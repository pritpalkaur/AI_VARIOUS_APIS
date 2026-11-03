using Gateway.Common;
using Gateway.Config;
using Microsoft.AspNetCore.Diagnostics;
using Yarp.ReverseProxy.Forwarder;
using Yarp.ReverseProxy.Model;

namespace Gateway.Middleware;

/// <summary>
/// Writes the JSON error body for responses that have a status but no body:
///  - YARP proxy failures (service down = 502, service too slow = 504),
///  - unknown gateway paths (404) and wrong methods (405).
/// Responses relayed from a service already have a body and are never touched.
/// </summary>
public static class StatusCodeResponseWriter
{
    public static async Task WriteAsync(StatusCodeContext statusContext)
    {
        var context = statusContext.HttpContext;
        var response = context.Response;
        var service = ProxyRoutes.DisplayName(context.Features.Get<IReverseProxyFeature>()?.Route.Config.ClusterId);

        var proxyError = context.Features.Get<IForwarderErrorFeature>();
        if (proxyError is not null)
        {
            var logger = context.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger(typeof(StatusCodeResponseWriter));
            // One line is enough here: "service down" stack traces add nothing.
            logger.LogError("Proxy to {Service} service failed: {ProxyError} - {Reason}",
                service, proxyError.Error, proxyError.Exception?.Message);
        }

        var (code, message) = response.StatusCode switch
        {
            StatusCodes.Status502BadGateway =>
                (ErrorCodes.BadGateway, $"The {service} service is unavailable. Please try again later."),
            StatusCodes.Status504GatewayTimeout =>
                (ErrorCodes.GatewayTimeout, $"The {service} service did not respond in time."),
            StatusCodes.Status400BadRequest => (ErrorCodes.BadRequest, "The request could not be processed."),
            StatusCodes.Status401Unauthorized => (ErrorCodes.Unauthorized, "Missing or invalid access token."),
            StatusCodes.Status403Forbidden => (ErrorCodes.Forbidden, "You do not have permission to perform this action."),
            StatusCodes.Status404NotFound => (ErrorCodes.NotFound, "The requested resource was not found."),
            StatusCodes.Status405MethodNotAllowed => (ErrorCodes.MethodNotAllowed, "HTTP method not allowed for this resource."),
            _ => (ErrorCodes.InternalError, "An unexpected error occurred."),
        };
        await response.WriteAsJsonAsync(ApiResponse.Fail(code, message));
    }
}
