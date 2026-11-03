using Auth.Config;
using Microsoft.Data.SqlClient;

namespace Auth.Data;

public interface ISqlConnectionFactory
{
    /// <summary>Returns an OPEN connection from the pool. The caller must dispose it.</summary>
    Task<SqlConnection> OpenConnectionAsync(CancellationToken ct);

    /// <summary>Opens one connection at startup to fail fast on bad configuration.</summary>
    Task VerifyConnectivityAsync(CancellationToken ct);
}

/// <summary>
/// Singleton created once at startup. ADO.NET keeps one connection pool per unique
/// connection string, so building the string once here gives the whole service a single
/// shared pool. Disposing a SqlConnection returns it to that pool; the pool is cleared on
/// shutdown in Program.cs (SqlConnection.ClearAllPools).
/// </summary>
public sealed class SqlConnectionFactory : ISqlConnectionFactory
{
    private readonly string _connectionString;
    private readonly ILogger<SqlConnectionFactory> _logger;
    private readonly string _server;
    private readonly string _database;

    public SqlConnectionFactory(EnvConfig config, ILogger<SqlConnectionFactory> logger)
    {
        _logger = logger;
        _server = $"{config.DbServer},{config.DbPort}";
        _database = config.DbName;

        var builder = new SqlConnectionStringBuilder
        {
            DataSource = _server,
            InitialCatalog = config.DbName,
            UserID = config.DbUser,
            Password = config.DbPassword,
            IntegratedSecurity = false,
            Encrypt = SqlConnectionEncryptOption.Mandatory,
            TrustServerCertificate = config.DbTrustServerCert,
            Pooling = true,
            MinPoolSize = config.DbPoolMin,
            MaxPoolSize = config.DbPoolMax,
            ConnectTimeout = config.DbConnectTimeoutSeconds,
            ApplicationName = "auth-service",
        };
        _connectionString = builder.ConnectionString; // never logged
    }

    public async Task<SqlConnection> OpenConnectionAsync(CancellationToken ct)
    {
        var connection = new SqlConnection(_connectionString);
        try
        {
            await connection.OpenAsync(ct);
            return connection;
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    public async Task VerifyConnectivityAsync(CancellationToken ct)
    {
        SqlConnection? connection = null;
        SqlCommand? command = null;
        try
        {
            connection = await OpenConnectionAsync(ct);
            command = new SqlCommand("SELECT 1;", connection);
            await command.ExecuteScalarAsync(ct);
            _logger.LogInformation("Connected to SQL Server {Server}, database {Database}", _server, _database);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Cannot connect to SQL Server {Server}, database {Database}", _server, _database);
            throw;
        }
        finally
        {
            if (command is not null) await command.DisposeAsync();
            if (connection is not null) await connection.DisposeAsync();
        }
    }
}
