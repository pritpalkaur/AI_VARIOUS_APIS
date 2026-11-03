using System.Globalization;

namespace Auth.Config;

/// <summary>
/// Strongly typed settings read from environment variables (.env is loaded into the
/// environment at startup). Values are validated once; secrets are never logged.
/// </summary>
public sealed class EnvConfig
{
    public required int Port { get; init; }
    public required string[] CorsOrigins { get; init; }

    public required string DbServer { get; init; }
    public required int DbPort { get; init; }
    public required string DbName { get; init; }
    public required string DbUser { get; init; }
    public required string DbPassword { get; init; }
    public required bool DbTrustServerCert { get; init; }
    public required int DbPoolMin { get; init; }
    public required int DbPoolMax { get; init; }
    public required int DbConnectTimeoutSeconds { get; init; }

    public required string JwtSecret { get; init; }
    public required string JwtIssuer { get; init; }
    public required string JwtAudience { get; init; }
    public required int JwtExpiresMinutes { get; init; }

    public required int BcryptWorkFactor { get; init; }

    public required string LogLevel { get; init; }
    public required string LogDir { get; init; }

    public static EnvConfig Load()
    {
        var errors = new List<string>();

        string Required(string name, bool trim = true)
        {
            var value = Environment.GetEnvironmentVariable(name);
            if (string.IsNullOrWhiteSpace(value))
            {
                errors.Add($"{name} is required");
                return string.Empty;
            }
            return trim ? value.Trim() : value;
        }

        string Optional(string name, string defaultValue)
        {
            var value = Environment.GetEnvironmentVariable(name);
            return string.IsNullOrWhiteSpace(value) ? defaultValue : value.Trim();
        }

        int Int(string name, int defaultValue, int min, int max)
        {
            var raw = Environment.GetEnvironmentVariable(name);
            if (string.IsNullOrWhiteSpace(raw)) return defaultValue;
            if (!int.TryParse(raw.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value)
                || value < min || value > max)
            {
                errors.Add($"{name} must be an integer between {min} and {max}");
                return defaultValue;
            }
            return value;
        }

        bool Bool(string name, bool defaultValue)
        {
            var raw = Environment.GetEnvironmentVariable(name);
            if (string.IsNullOrWhiteSpace(raw)) return defaultValue;
            if (!bool.TryParse(raw.Trim(), out var value))
            {
                errors.Add($"{name} must be true or false");
                return defaultValue;
            }
            return value;
        }

        var config = new EnvConfig
        {
            Port = Int("PORT", 5001, 1, 65535),
            CorsOrigins = Optional("CORS_ORIGIN", "http://localhost:5173")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),

            DbServer = Required("DB_SERVER"),
            DbPort = Int("DB_PORT", 1433, 1, 65535),
            DbName = Required("DB_NAME"),
            DbUser = Required("DB_USER"),
            DbPassword = Required("DB_PASSWORD", trim: false),
            DbTrustServerCert = Bool("DB_TRUST_SERVER_CERT", false),
            DbPoolMin = Int("DB_POOL_MIN", 0, 0, 100),
            DbPoolMax = Int("DB_POOL_MAX", 20, 1, 200),
            DbConnectTimeoutSeconds = Int("DB_CONNECT_TIMEOUT_SECONDS", 15, 1, 120),

            JwtSecret = Required("JWT_SECRET", trim: false),
            JwtIssuer = Required("JWT_ISSUER"),
            JwtAudience = Required("JWT_AUDIENCE"),
            JwtExpiresMinutes = Int("JWT_EXPIRES_MINUTES", 60, 1, 1440),

            BcryptWorkFactor = Int("BCRYPT_WORK_FACTOR", 12, 10, 14),

            LogLevel = Optional("LOG_LEVEL", "info"),
            LogDir = Optional("LOG_DIR", "logs"),
        };

        if (config.JwtSecret.Length is > 0 and < 32)
            errors.Add("JWT_SECRET must be at least 32 characters");
        if (config.JwtSecret.StartsWith("replace_with", StringComparison.OrdinalIgnoreCase))
            errors.Add("JWT_SECRET still has the placeholder value from .env.example");
        if (config.DbPoolMin > config.DbPoolMax)
            errors.Add("DB_POOL_MIN must not be greater than DB_POOL_MAX");

        if (errors.Count > 0)
            throw new InvalidOperationException("Invalid configuration: " + string.Join("; ", errors));

        return config;
    }
}
