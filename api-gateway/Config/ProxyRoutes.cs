using Yarp.ReverseProxy.Configuration;

namespace Gateway.Config;

/// <summary>
/// YARP routes and clusters, built from .env (not appsettings) so every service is configured
/// the same way. Paths are forwarded unchanged: /api/products/1 -> {PRODUCT_SERVICE_URL}/api/products/1.
/// </summary>
public static class ProxyRoutes
{
    public const string AuthCluster = "auth";
    public const string ProductCluster = "product";
    public const string OrderCluster = "order";

    // YARP's built-in policy names.
    private const string Public = "anonymous";
    private const string Authenticated = "default";

    /// <summary>Gateway URL of a service's OpenAPI spec, e.g. /docs/specs/product.yaml.</summary>
    public static string SpecUrl(string clusterId) => $"/docs/specs/{clusterId}.yaml";

    /// <summary>Friendly names used in 502/504 messages.</summary>
    public static string DisplayName(string? clusterId) => clusterId switch
    {
        AuthCluster => "Auth",
        ProductCluster => "Product",
        OrderCluster => "Order",
        _ => "upstream",
    };

    public static IReadOnlyList<RouteConfig> Routes() =>
    [
        // Public: login and register (POST only). Literal paths win over the catch-all below.
        new RouteConfig
        {
            RouteId = "auth-login",
            ClusterId = AuthCluster,
            AuthorizationPolicy = Public,
            Match = new RouteMatch { Path = "/api/auth/login", Methods = ["POST"] },
        },
        new RouteConfig
        {
            RouteId = "auth-register",
            ClusterId = AuthCluster,
            AuthorizationPolicy = Public,
            Match = new RouteMatch { Path = "/api/auth/register", Methods = ["POST"] },
        },

        // Everything else needs a valid JWT at the gateway.
        new RouteConfig
        {
            RouteId = "auth-protected",
            ClusterId = AuthCluster,
            AuthorizationPolicy = Authenticated,
            Match = new RouteMatch { Path = "/api/auth/{**rest}" },
        },
        new RouteConfig
        {
            RouteId = "products",
            ClusterId = ProductCluster,
            AuthorizationPolicy = Authenticated,
            Match = new RouteMatch { Path = "/api/products/{**rest}" }, // also matches /api/products
        },
        new RouteConfig
        {
            RouteId = "orders",
            ClusterId = OrderCluster,
            AuthorizationPolicy = Authenticated,
            Match = new RouteMatch { Path = "/api/orders/{**rest}" },
        },

        // Public: each service's OpenAPI spec, for the gateway's Swagger UI at /docs.
        SpecRoute(AuthCluster),
        SpecRoute(ProductCluster),
        SpecRoute(OrderCluster),
    ];

    /// <summary>GET /docs/specs/{cluster}.yaml -> {service}/openapi.yaml</summary>
    private static RouteConfig SpecRoute(string clusterId) => new()
    {
        RouteId = $"docs-spec-{clusterId}",
        ClusterId = clusterId,
        AuthorizationPolicy = Public,
        Match = new RouteMatch { Path = SpecUrl(clusterId), Methods = ["GET"] },
        Transforms = [new Dictionary<string, string> { ["PathSet"] = "/openapi.yaml" }],
    };

    public static IReadOnlyList<ClusterConfig> Clusters(EnvConfig config) =>
    [
        Cluster(AuthCluster, config.AuthServiceUrl, config.ProxyTimeoutSeconds),
        Cluster(ProductCluster, config.ProductServiceUrl, config.ProxyTimeoutSeconds),
        Cluster(OrderCluster, config.OrderServiceUrl, config.ProxyTimeoutSeconds),
    ];

    private static ClusterConfig Cluster(string id, string address, int timeoutSeconds) => new()
    {
        ClusterId = id,
        Destinations = new Dictionary<string, DestinationConfig>
        {
            [id] = new DestinationConfig { Address = address },
        },
        HttpRequest = new Yarp.ReverseProxy.Forwarder.ForwarderRequestConfig
        {
            ActivityTimeout = TimeSpan.FromSeconds(timeoutSeconds),
        },
    };
}
