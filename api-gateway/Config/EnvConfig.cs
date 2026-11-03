using System.Globalization;

namespace Gateway.Config;

/// <summary>
/// Settings read from environment variables (.env is loaded into the environment at startup).
/// Validated once; values are never logged.
/// </summary>
public sealed class EnvConfig
{
    public required int Port { get; init; }
    public required string[] CorsOrigins { get; init; }

    public required string AuthServiceUrl { get; init; }
    public required string ProductServiceUrl { get; init; }
    public required string OrderServiceUrl { get; init; }
    public required int ProxyTimeoutSeconds { get; init; }

    public required string JwtSecret { get; init; }
    public required string JwtIssuer { get; init; }
    public required string JwtAudience { get; init; }

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

        string ServiceUrl(string name, string defaultValue)
        {
            var value = Optional(name, defaultValue);
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
                errors.Add($"{name} must be an absolute http(s) URL");
            return value.TrimEnd('/');
        }

        var config = new EnvConfig
        {
            Port = Int("PORT", 5000, 1, 65535),
            CorsOrigins = Optional("CORS_ORIGIN", "http://localhost:5173")
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),

            // 127.0.0.1, not localhost: on Windows localhost tries ::1 first (~2 s per refused attempt).
            AuthServiceUrl = ServiceUrl("AUTH_SERVICE_URL", "http://127.0.0.1:5001"),
            ProductServiceUrl = ServiceUrl("PRODUCT_SERVICE_URL", "http://127.0.0.1:5002"),
            OrderServiceUrl = ServiceUrl("ORDER_SERVICE_URL", "http://127.0.0.1:5003"),
            ProxyTimeoutSeconds = Int("PROXY_TIMEOUT_SECONDS", 30, 1, 300),

            JwtSecret = Required("JWT_SECRET", trim: false),
            JwtIssuer = Required("JWT_ISSUER"),
            JwtAudience = Required("JWT_AUDIENCE"),

            LogLevel = Optional("LOG_LEVEL", "info"),
            LogDir = Optional("LOG_DIR", "logs"),
        };

        if (config.JwtSecret.Length is > 0 and < 32)
            errors.Add("JWT_SECRET must be at least 32 characters");
        if (config.JwtSecret.StartsWith("replace_with", StringComparison.OrdinalIgnoreCase))
            errors.Add("JWT_SECRET still has the placeholder value from .env.example");

        if (errors.Count > 0)
            throw new InvalidOperationException("Invalid configuration: " + string.Join("; ", errors));

        return config;
    }
}
