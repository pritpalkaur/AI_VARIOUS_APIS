namespace Auth.Common;

/// <summary>
/// An error that is safe to show to the client. The middleware turns it into the
/// JSON error envelope with <see cref="StatusCode"/>.
/// </summary>
public sealed class AppException : Exception
{
    public int StatusCode { get; }
    public string Code { get; }

    public AppException(int statusCode, string code, string message) : base(message)
    {
        StatusCode = statusCode;
        Code = code;
    }

    public static AppException Validation(string message) =>
        new(StatusCodes.Status400BadRequest, ErrorCodes.ValidationError, message);

    public static AppException Unauthorized(string code, string message) =>
        new(StatusCodes.Status401Unauthorized, code, message);

    public static AppException NotFound(string code, string message) =>
        new(StatusCodes.Status404NotFound, code, message);

    public static AppException Conflict(string code, string message) =>
        new(StatusCodes.Status409Conflict, code, message);

    public static AppException Internal() =>
        new(StatusCodes.Status500InternalServerError, ErrorCodes.InternalError, "An unexpected error occurred.");
}
