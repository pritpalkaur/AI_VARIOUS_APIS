using Auth.Models;

namespace Auth.Services;

public sealed record IssuedToken(string AccessToken, int ExpiresInSeconds, DateTime ExpiresAtUtc);

public interface IJwtTokenService
{
    IssuedToken CreateToken(User user);
}
