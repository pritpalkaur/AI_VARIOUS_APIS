namespace Auth.Dtos;

public sealed record AuthResponse(
    string AccessToken,
    string TokenType,
    int ExpiresIn,
    DateTime ExpiresAt,
    UserDto User);
