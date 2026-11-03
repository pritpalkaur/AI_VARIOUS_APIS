using Auth.Models;

namespace Auth.Dtos;

public sealed record UserDto(int Id, string Username, string Email, string Role, DateTime CreatedAt)
{
    public static UserDto From(User user) =>
        new(user.Id, user.Username, user.Email, user.Role, user.CreatedAt);
}
