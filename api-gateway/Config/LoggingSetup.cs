using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;

namespace Gateway.Config;

public static class LoggingSetup
{
    /// <summary>Console (human readable) + daily rolling JSON file, level from LOG_LEVEL.</summary>
    public static Serilog.ILogger CreateLogger(EnvConfig config)
    {
        var level = ParseLevel(config.LogLevel);
        // Framework and YARP per-request chatter is capped at Warning (we log requests ourselves).
        var frameworkLevel = level > LogEventLevel.Warning ? level : LogEventLevel.Warning;
        var logPath = Path.Combine(Path.GetFullPath(config.LogDir), "api-gateway-.log");

        return new LoggerConfiguration()
            .MinimumLevel.Is(level)
            .MinimumLevel.Override("Microsoft", frameworkLevel)
            .MinimumLevel.Override("System", frameworkLevel)
            .MinimumLevel.Override("Yarp", frameworkLevel)
            // Proxy failures are logged once, with the service name, by StatusCodeResponseWriter.
            .MinimumLevel.Override("Yarp.ReverseProxy.Forwarder", LogEventLevel.Error)
            .Enrich.FromLogContext()
            .Enrich.WithProperty("Service", "api-gateway")
            .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}")
            .WriteTo.File(
                new CompactJsonFormatter(),
                logPath,
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 14)
            .CreateLogger();
    }

    private static LogEventLevel ParseLevel(string value) => value.Trim().ToLowerInvariant() switch
    {
        "trace" or "verbose" => LogEventLevel.Verbose,
        "debug" => LogEventLevel.Debug,
        "info" or "information" => LogEventLevel.Information,
        "warn" or "warning" => LogEventLevel.Warning,
        "error" => LogEventLevel.Error,
        "fatal" => LogEventLevel.Fatal,
        _ => LogEventLevel.Information,
    };
}
