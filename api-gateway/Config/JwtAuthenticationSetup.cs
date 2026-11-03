using System.Text;
using Gateway.Common;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Gateway.Config;

public static class JwtAuthenticationSetup
{
    /// <summary>
    /// Same validation rules as the services (secret, issuer, audience, lifetime, HS256).
    /// The gateway rejects bad tokens early; the services still validate every token themselves.
    /// </summary>
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, EnvConfig config)
    {
        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = config.JwtIssuer,
                    ValidateAudience = true,
                    ValidAudience = config.JwtAudience,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.JwtSecret)),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    ValidateLifetime = true,
                    RequireExpirationTime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    NameClaimType = "username",
                    RoleClaimType = "role",
                };

                options.Events = new JwtBearerEvents
                {
                    OnAuthenticationFailed = context =>
                    {
                        // Log the failure type only - never the token itself.
                        var logger = context.HttpContext.RequestServices
                            .GetRequiredService<ILogger<JwtBearerEvents>>();
                        logger.LogInformation("JWT validation failed at gateway: {Reason}",
                            context.Exception.GetType().Name);
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
                };
            });

        // Default policy = "authenticated user"; YARP routes opt in with AuthorizationPolicy = "default".
        services.AddAuthorization();
        return services;
    }
}
