using System.Diagnostics;
using Yarp.ReverseProxy.Model;

namespace Gateway.Middleware;

/// <summary>
/// One log line per request: method, path, status, duration and the upstream service.
/// Only the path is logged - never headers (Authorization), query strings or bodies.
/// </summary>
public sealed class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _logger;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            await _next(context);
        }
        finally
        {
            stopwatch.Stop();
            var status = context.Response.StatusCode;
            var upstream = context.Features.Get<IReverseProxyFeature>()?.Route.Config.ClusterId ?? "gateway";
            var level = status >= 500 ? LogLevel.Error
                : status >= 400 ? LogLevel.Warning
                : LogLevel.Information;

            _logger.Log(level, "HTTP {Method} {Path} -> {Upstream} responded {StatusCode} in {ElapsedMs:0.0} ms",
                context.Request.Method, context.Request.Path.Value, upstream, status,
                stopwatch.Elapsed.TotalMilliseconds);
        }
    }
}
