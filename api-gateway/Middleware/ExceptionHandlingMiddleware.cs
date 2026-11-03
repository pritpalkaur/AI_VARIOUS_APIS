using Gateway.Common;

namespace Gateway.Middleware;

/// <summary>Turns unexpected exceptions into the JSON error envelope; details go to the log only.</summary>
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
