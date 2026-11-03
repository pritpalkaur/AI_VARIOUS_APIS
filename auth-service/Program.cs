using Auth.Common;
using Auth.Config;
using Auth.Data;
using Auth.Middleware;
using Auth.Repositories;
using Auth.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Serilog;

// Load .env into the environment. Real environment variables win over .env values.
DotNetEnv.Env.NoClobber().Load();

// Console-only logger until configuration is known.
Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var config = EnvConfig.Load();
    Log.Logger = LoggingSetup.CreateLogger(config);
    Log.Information("Auth service starting (log level {LogLevel})", config.LogLevel);

    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog();
    builder.WebHost.UseUrls($"http://localhost:{config.Port}");

    // ---- Dependency injection: controller -> service -> repository -> connection factory
    builder.Services.AddSingleton(config);
    builder.Services.AddSingleton<ISqlConnectionFactory, SqlConnectionFactory>();
    builder.Services.AddSingleton<IPasswordHasher, BCryptPasswordHasher>();
    builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
    builder.Services.AddScoped<IUserRepository, UserRepository>();
    builder.Services.AddScoped<IAuthService, AuthService>();

    builder.Services
        .AddControllers()
        .ConfigureApiBehaviorOptions(options =>
        {
            // Empty bodies for 404/415/... (filled by StatusCodeResponseWriter) instead of ProblemDetails.
            options.SuppressMapClientErrors = true;
            // Malformed JSON / wrong field types -> our 400 envelope.
            options.InvalidModelStateResponseFactory = _ => new BadRequestObjectResult(
                ApiResponse.Fail(ErrorCodes.InvalidJson, "Request body is missing or is not valid JSON."));
        });

    builder.Services.AddCors(options => options.AddPolicy("client", policy => policy
        .WithOrigins(config.CorsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()));

    builder.Services.AddJwtAuthentication(config);

    var app = builder.Build();

    // ---- Connection pool: verify once at startup, clear on shutdown
    await app.Services.GetRequiredService<ISqlConnectionFactory>().VerifyConnectivityAsync(CancellationToken.None);

    app.Lifetime.ApplicationStarted.Register(() =>
        Log.Information("Auth service listening on http://localhost:{Port}", config.Port));
    app.Lifetime.ApplicationStopping.Register(() =>
        Log.Information("Auth service shutting down..."));
    app.Lifetime.ApplicationStopped.Register(() =>
    {
        SqlConnection.ClearAllPools();
        Log.Information("SQL connection pool cleared. Auth service stopped.");
    });

    // ---- HTTP pipeline (order matters)
    app.UseMiddleware<RequestLoggingMiddleware>();     // outermost: sees the final status code
    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseStatusCodePages(StatusCodeResponseWriter.WriteAsync);
    app.UseCors("client");
    app.UseAuthentication();
    app.UseAuthorization();

    app.MapGet("/health", () => Results.Ok(
        ApiResponse.Ok(new { status = "ok", service = "auth-service" }, "Service is healthy.")));
    app.MapControllers();

    await app.RunAsync();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "Auth service failed to start or crashed");
    Environment.ExitCode = 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}
