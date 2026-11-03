using Auth.Common;
using Auth.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Auth.Config;

public static class JwtAuthenticationSetup
{
    /// <summary>
    /// Validates the tokens this service issues (used by GET /api/auth/me).
    /// Product and Order services apply the same rules with the same .env values.
    /// </summary>
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, EnvConfig config)
    {
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false; // keep "sub", "username", "role" as-is
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = config.JwtIssuer,
                    ValidateAudience = true,
                    ValidAudience = config.JwtAudience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = JwtTokenService.CreateSigningKey(config.JwtSecret),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = JwtTokenService.UsernameClaim,
                    RoleClaimType = JwtTokenService.RoleClaim,
                };

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        // Log the failure type only - never the token itself.
                        var logger = context.HttpContext.RequestServices
                            .GetRequiredService<ILogger<JwtBearerEvents>>();
                        logger.LogInformation("JWT validation failed: {Reason}", context.Exception.GetType().Name);
                        return Task.CompletedTask;
                    },
                    OnChallenge = async context =>
                    {
                        context.HandleResponse();
                        var message = context.AuthenticateFailure is SecurityTokenExpiredException
                            ? "Access token has expired."
                            : "Missing or invalid access token.";
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        await context.Response.WriteAsJsonAsync(ApiResponse.Fail(ErrorCodes.Unauthorized, message));
                    },
                    OnForbidden = async context =>
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        await context.Response.WriteAsJsonAsync(
                            ApiResponse.Fail(ErrorCodes.Forbidden, "You do not have permission to perform this action."));
                    },
                };
            });

        services.AddAuthorization();
        return services;
    }
}
