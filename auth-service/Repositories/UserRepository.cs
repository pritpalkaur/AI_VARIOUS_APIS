using System.Data;
using Auth.Common;
using Auth.Data;
using Auth.Models;
using Microsoft.Data.SqlClient;

namespace Auth.Repositories;

/// <summary>
/// Data access for dbo.Users. Every method:
///   - uses parameterized SQL only,
///   - catches and logs driver errors, rethrowing them as DataAccessException,
///   - disposes reader/command/connection in finally (the connection goes back to the pool).
/// </summary>
public sealed class UserRepository : IUserRepository
{
    private const int SqlUniqueConstraintViolation = 2627;
    private const int SqlUniqueIndexViolation = 2601;

    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly ILogger<UserRepository> _logger;

    public UserRepository(ISqlConnectionFactory connectionFactory, ILogger<UserRepository> logger)
    {
        _connectionFactory = connectionFactory;
        _logger = logger;
    }

    public async Task<User> CreateAsync(string username, string email, string passwordHash, string role,
        CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.Users (Username, Email, PasswordHash, Role)
            OUTPUT INSERTED.Id, INSERTED.Username, INSERTED.Email, INSERTED.PasswordHash,
                   INSERTED.Role, INSERTED.CreatedAt
            VALUES (@Username, @Email, @PasswordHash, @Role);
            """;

        SqlConnection? connection = null;
        SqlCommand? command = null;
        SqlDataReader? reader = null;
        try
        {
            connection = await _connectionFactory.OpenConnectionAsync(ct);
            command = new SqlCommand(sql, connection);
            command.Parameters.Add("@Username", SqlDbType.NVarChar, 50).Value = username;
            command.Parameters.Add("@Email", SqlDbType.NVarChar, 254).Value = email;
            command.Parameters.Add("@PasswordHash", SqlDbType.NVarChar, 100).Value = passwordHash;
            command.Parameters.Add("@Role", SqlDbType.NVarChar, 20).Value = role;

            reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
            if (!await reader.ReadAsync(ct))
                throw new InvalidOperationException("INSERT into dbo.Users returned no row.");

            return Map(reader);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw Wrap(ex, nameof(CreateAsync));
        }
        finally
        {
            if (reader is not null) await reader.DisposeAsync();
            if (command is not null) await command.DisposeAsync();
            if (connection is not null) await connection.DisposeAsync();
        }
    }

    public async Task<User?> GetByUsernameAsync(string username, CancellationToken ct)
    {
        const string sql = """
            SELECT Id, Username, Email, PasswordHash, Role, CreatedAt
            FROM dbo.Users
            WHERE Username = @Username;
            """;

        SqlConnection? connection = null;
        SqlCommand? command = null;
        SqlDataReader? reader = null;
        try
        {
            connection = await _connectionFactory.OpenConnectionAsync(ct);
            command = new SqlCommand(sql, connection);
            command.Parameters.Add("@Username", SqlDbType.NVarChar, 50).Value = username;

            reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
            return await reader.ReadAsync(ct) ? Map(reader) : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw Wrap(ex, nameof(GetByUsernameAsync));
        }
        finally
        {
            if (reader is not null) await reader.DisposeAsync();
            if (command is not null) await command.DisposeAsync();
            if (connection is not null) await connection.DisposeAsync();
        }
    }

    public async Task<User?> GetByIdAsync(int id, CancellationToken ct)
    {
        const string sql = """
            SELECT Id, Username, Email, PasswordHash, Role, CreatedAt
            FROM dbo.Users
            WHERE Id = @Id;
            """;

        SqlConnection? connection = null;
        SqlCommand? command = null;
        SqlDataReader? reader = null;
        try
        {
            connection = await _connectionFactory.OpenConnectionAsync(ct);
            command = new SqlCommand(sql, connection);
            command.Parameters.Add("@Id", SqlDbType.Int).Value = id;

            reader = await command.ExecuteReaderAsync(CommandBehavior.SingleRow, ct);
            return await reader.ReadAsync(ct) ? Map(reader) : null;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw Wrap(ex, nameof(GetByIdAsync));
        }
        finally
        {
            if (reader is not null) await reader.DisposeAsync();
            if (command is not null) await command.DisposeAsync();
            if (connection is not null) await connection.DisposeAsync();
        }
    }

    private static User Map(SqlDataReader reader) => new()
    {
        Id = reader.GetInt32(reader.GetOrdinal("Id")),
        Username = reader.GetString(reader.GetOrdinal("Username")),
        Email = reader.GetString(reader.GetOrdinal("Email")),
        PasswordHash = reader.GetString(reader.GetOrdinal("PasswordHash")),
        Role = reader.GetString(reader.GetOrdinal("Role")),
        // DATETIME2 columns hold UTC (SYSUTCDATETIME); mark them so JSON ends with "Z".
        CreatedAt = DateTime.SpecifyKind(reader.GetDateTime(reader.GetOrdinal("CreatedAt")), DateTimeKind.Utc),
    };

    private DataAccessException Wrap(Exception ex, string operation)
    {
        if (ex is SqlException sqlEx && sqlEx.Number is SqlUniqueConstraintViolation or SqlUniqueIndexViolation)
        {
            var constraint = DataAccessException.ExtractConstraintName(sqlEx.Message);
            _logger.LogInformation("Unique constraint {Constraint} violated in {Repository}.{Operation}",
                constraint, nameof(UserRepository), operation);
            return new DataAccessException(operation, "Unique constraint violated.", ex,
                isUniqueViolation: true, constraintName: constraint);
        }

        _logger.LogError(ex, "Database error in {Repository}.{Operation}", nameof(UserRepository), operation);
        return new DataAccessException(operation, "Database operation failed.", ex);
    }
}
