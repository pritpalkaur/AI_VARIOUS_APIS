using System.Security.Claims;
using Auth.Common;
using Auth.Dtos;
using Auth.Services;
using Auth.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;

namespace Auth.Controllers;

/// <summary>
/// HTTP layer only: validate input, call the service, wrap the result in the JSON envelope.
/// Errors are thrown as AppException and rendered by ExceptionHandlingMiddleware.
/// </summary>
[ApiController]
[Route("api/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService) => _authService = authService;

    /// <summary>POST /api/auth/register - creates a user with role "User".</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register([FromBody] RegisterRequest? request, CancellationToken ct)
    {
        var errors = AuthValidator.ValidateRegister(request);
        if (errors.Count > 0)
            throw AppException.Validation(string.Join(" ", errors));

        var user = await _authService.RegisterAsync(request!, ct);
        return StatusCode(StatusCodes.Status201Created, ApiResponse.Ok(user, "User registered successfully."));
    }

    /// <summary>POST /api/auth/login - returns a JWT access token.</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest? request, CancellationToken ct)
    {
        var errors = AuthValidator.ValidateLogin(request);
        if (errors.Count > 0)
            throw AppException.Validation(string.Join(" ", errors));

        var result = await _authService.LoginAsync(request!, ct);
        return Ok(ApiResponse.Ok(result, "Login successful."));
    }

    /// <summary>GET /api/auth/me - returns the user identified by the bearer token.</summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        var sub = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (!int.TryParse(sub, out var userId))
            throw AppException.Unauthorized(ErrorCodes.Unauthorized, "Missing or invalid access token.");

        var user = await _authService.GetCurrentUserAsync(userId, ct);
        return Ok(ApiResponse.Ok(user, "Current user retrieved."));
    }
}
