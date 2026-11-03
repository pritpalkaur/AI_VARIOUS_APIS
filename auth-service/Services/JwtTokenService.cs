using System.Globalization;
using System.Text;
using Auth.Config;
using Auth.Models;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Auth.Services;

/// <summary>
/// Issues HS256 access tokens. Claims (also read by Product and Order services):
///   sub = user id (string), username, role ("Admin" | "User"), jti, iat, nbf, exp, iss, aud
/// </summary>
public sealed class JwtTokenService : IJwtTokenService
{
    public const string UsernameClaim = "username";
    public const string RoleClaim = "role";

    private readonly EnvConfig _config;
    private readonly SigningCredentials _signingCredentials;
    private readonly JsonWebTokenHandler _handler = new();

    public JwtTokenService(EnvConfig config)
    {
        _config = config;
        _signingCredentials = new SigningCredentials(CreateSigningKey(config.JwtSecret), SecurityAlgorithms.HmacSha256);
    }

    public static SymmetricSecurityKey CreateSigningKey(string secret) => new(Encoding.UTF8.GetBytes(secret));

    public IssuedToken CreateToken(User user)
    {
        var now = DateTime.UtcNow;
        var expires = now.AddMinutes(_config.JwtExpiresMinutes);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = _config.JwtIssuer,
            Audience = _config.JwtAudience,
            IssuedAt = now,
            NotBefore = now,
            Expires = expires,
            SigningCredentials = _signingCredentials,
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = user.Id.ToString(CultureInfo.InvariantCulture),
                [UsernameClaim] = user.Username,
                [RoleClaim] = user.Role,
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString("N"),
            },
        };

        var token = _handler.CreateToken(descriptor);
        return new IssuedToken(token, _config.JwtExpiresMinutes * 60, expires);
    }
}
