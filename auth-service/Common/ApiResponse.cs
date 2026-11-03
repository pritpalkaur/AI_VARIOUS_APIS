namespace Auth.Common;

// Shared JSON envelope (camelCase on the wire):
//   { "success": true,  "data": ..., "message": "..." }
//   { "success": false, "error": { "code": "...", "message": "..." } }

public sealed record ApiSuccessResponse<T>(bool Success, T Data, string Message);

public sealed record ApiErrorDetail(string Code, string Message);

public sealed record ApiErrorResponse(bool Success, ApiErrorDetail Error);

public static class ApiResponse
{
    public static ApiSuccessResponse<T> Ok<T>(T data, string message) => new(true, data, message);

    public static ApiErrorResponse Fail(string code, string message) => new(false, new ApiErrorDetail(code, message));
}
