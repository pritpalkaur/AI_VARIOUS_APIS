namespace Auth.Models;

/// <summary>Row in dbo.Users. PasswordHash never leaves the service layer.</summary>
public sealed class User
{
    public int Id { get; init; }
    public string Username { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string PasswordHash { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public DateTime CreatedAt { get; init; }
}
