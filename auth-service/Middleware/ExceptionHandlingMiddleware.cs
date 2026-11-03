using Auth.Common;

namespace Auth.Middleware;

/// <summary>
/// Last line of defence: turns exceptions into the JSON error envelope.
/// AppException messages are client-safe; anything else is logged and returned as a
/// generic 500 so stack traces and SQL errors never reach the client.
/// </summary>
public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            _logger.LogInformation("Request {Method} {Path} was cancelled by the client",
                context.Request.Method, context.Request.Path.Value);
        }
        catch (AppException ex)
        {
            await WriteErrorAsync(context, ex.StatusCode, ex.Code, ex.Message);
        }
        catch (BadHttpRequestException ex)
        {
            _logger.LogInformation("Bad HTTP request on {Path}: {Reason}", context.Request.Path.Value, ex.Message);
            await WriteErrorAsync(context, ex.StatusCode, ErrorCodes.BadRequest, "The request could not be processed.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception for {Method} {Path}",
                context.Request.Method, context.Request.Path.Value);
            await WriteErrorAsync(context, StatusCodes.Status500InternalServerError,
                ErrorCodes.InternalError, "An unexpected error occurred.");
        }
    }

    private static async Task WriteErrorAsync(HttpContext context, int statusCode, string code, string message)
    {
        if (context.Response.HasStarted) return;
        context.Response.StatusCode = statusCode;
        await context.Response.WriteAsJsonAsync(ApiResponse.Fail(code, message));
    }
}
