using Gateway.Common;
using Gateway.Config;
using Gateway.Middleware;
using Serilog;
using Yarp.ReverseProxy.Transforms;

// Load .env files into the environment: this service's own .env (optional overrides) first,
// then the shared ../.env used by every service. Earlier sources win, and real environment
// variables win over both.
DotNetEnv.Env.NoClobber().Load(".env");
DotNetEnv.Env.NoClobber().Load(Path.Combine("..", ".env"));

// Console-only logger until configuration is known.
Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var config = EnvConfig.Load();
    Log.Logger = LoggingSetup.CreateLogger(config);
    Log.Information("API gateway starting (log level {LogLevel})", config.LogLevel);

    var builder = WebApplication.CreateBuilder(args);
    builder.Host.UseSerilog();
    builder.WebHost.UseUrls($"http://localhost:{config.Port}");

    builder.Services.AddSingleton(config);

    builder.Services
        .AddReverseProxy()
        .LoadFromMemory(ProxyRoutes.Routes(), ProxyRoutes.Clusters(config))
        .AddTransforms(transforms =>
        {
            // CORS is answered by the gateway. Dropping Origin stops the services from adding
            // their own Access-Control-* headers, which would duplicate ours and break the browser.
            transforms.AddRequestHeaderRemove("Origin");
        });

    builder.Services.AddCors(options => options.AddPolicy("client", policy => policy
        .WithOrigins(config.CorsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .WithExposedHeaders("Location")));

    builder.Services.AddJwtAuthentication(config);

    var app = builder.Build();

    app.Lifetime.ApplicationStarted.Register(() =>
    {
        Log.Information("API gateway listening on http://localhost:{Port} (API docs: /docs)", config.Port);
        Log.Information("Routing /api/auth -> {Auth}, /api/products -> {Product}, /api/orders -> {Order}",
            config.AuthServiceUrl, config.ProductServiceUrl, config.OrderServiceUrl);
    });
    app.Lifetime.ApplicationStopping.Register(() => Log.Information("API gateway shutting down..."));
    app.Lifetime.ApplicationStopped.Register(() => Log.Information("API gateway stopped."));

    // ---- HTTP pipeline (order matters)
    app.UseMiddleware<RequestLoggingMiddleware>();     // outermost: sees the final status code
    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseStatusCodePages(StatusCodeResponseWriter.WriteAsync);

    // ---- API documentation: one Swagger UI for all three services. The specs are fetched from
    // the services through the gateway, and their relative server URL ("/") makes "Try it out"
    // call the gateway too. Assets are bundled (no CDN).
    app.UseSwaggerUI(options =>
    {
        options.RoutePrefix = "docs";
        options.DocumentTitle = "Store APIs (via gateway)";
        options.SwaggerEndpoint(ProxyRoutes.SpecUrl(ProxyRoutes.AuthCluster), "Auth Service");
        options.SwaggerEndpoint(ProxyRoutes.SpecUrl(ProxyRoutes.ProductCluster), "Product Service");
        options.SwaggerEndpoint(ProxyRoutes.SpecUrl(ProxyRoutes.OrderCluster), "Order Service");
        options.EnablePersistAuthorization(); // keep the pasted token across reloads and spec switches
    });

    app.UseCors("client");                             // answers preflight before authentication
    app.UseAuthentication();
    app.UseAuthorization();                            // enforces each route's AuthorizationPolicy

    app.MapGet("/health", () => Results.Ok(
        ApiResponse.Ok(new { status = "ok", service = "api-gateway" }, "Service is healthy.")));
    app.MapReverseProxy();

    await app.RunAsync();
}
catch (Exception ex) when (ex is not HostAbortedException)
{
    Log.Fatal(ex, "API gateway failed to start or crashed");
    Environment.ExitCode = 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}
