using Auth.Common;
using Microsoft.AspNetCore.Diagnostics;

namespace Auth.Middleware;

/// <summary>
/// Fills in the JSON error body for framework responses that have a status but no body
/// (unknown route 404, 405 wrong method, 415 wrong Content-Type).
/// </summary>
public static class StatusCodeResponseWriter
{
    public static async Task WriteAsync(StatusCodeContext statusContext)
    {
        var response = statusContext.HttpContext.Response;
        var (code, message) = response.StatusCode switch
        {
            StatusCodes.Status400BadRequest => (ErrorCodes.BadRequest, "The request could not be processed."),
            StatusCodes.Status401Unauthorized => (ErrorCodes.Unauthorized, "Missing or invalid access token."),
            StatusCodes.Status403Forbidden => (ErrorCodes.Forbidden, "You do not have permission to perform this action."),
            StatusCodes.Status404NotFound => (ErrorCodes.NotFound, "The requested resource was not found."),
            StatusCodes.Status405MethodNotAllowed => (ErrorCodes.MethodNotAllowed, "HTTP method not allowed for this resource."),
            StatusCodes.Status415UnsupportedMediaType => (ErrorCodes.UnsupportedMediaType, "Content-Type must be application/json."),
            _ => (ErrorCodes.InternalError, "An unexpected error occurred."),
        };
        await response.WriteAsJsonAsync(ApiResponse.Fail(code, message));
    }
}
