using System.Diagnostics;
using Auth.Common;
using Auth.Dtos;
using Auth.Repositories;

namespace Auth.Services;

/// <summary>
/// Business logic for registration, login and "who am I". Input is validated by the
/// controller before it gets here. Each method follows the same pattern:
///   try     - do the work
///   catch   - map repository/unknown errors to safe AppExceptions
///   finally - log the duration
/// </summary>
public sealed class AuthService : IAuthService
{
    private const string DefaultRole = "User";
    private const string InvalidCredentialsMessage = "Invalid username or password.";

    private readonly IUserRepository _users;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IJwtTokenService _tokenService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(IUserRepository users, IPasswordHasher passwordHasher, IJwtTokenService tokenService,
        ILogger<AuthService> logger)
    {
        _users = users;
        _passwordHasher = passwordHasher;
        _tokenService = tokenService;
        _logger = logger;
    }

    public async Task<UserDto> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var username = request.Username!.Trim();
            var email = request.Email!.Trim().ToLowerInvariant();
            var passwordHash = _passwordHasher.Hash(request.Password!);

            // The UNIQUE constraints are the source of truth for duplicates (no race window).
            var user = await _users.CreateAsync(username, email, passwordHash, DefaultRole, ct);

            _logger.LogInformation("User {UserId} registered with username {Username}", user.Id, user.Username);
            return UserDto.From(user);
        }
        catch (DataAccessException ex) when (ex.IsUniqueViolation)
        {
            throw ex.ConstraintName switch
            {
                "UQ_Users_Username" => AppException.Conflict(ErrorCodes.UsernameTaken, "Username is already taken."),
                "UQ_Users_Email" => AppException.Conflict(ErrorCodes.EmailTaken, "Email is already registered."),
                _ => AppException.Conflict(ErrorCodes.Conflict, "User already exists."),
            };
        }
        catch (DataAccessException)
        {
            throw AppException.Internal(); // details already logged by the repository
        }
        catch (Exception ex) when (ex is not AppException and not OperationCanceledException)
        {
            _logger.LogError(ex, "Unexpected error in {Service}.{Operation}", nameof(AuthService), nameof(RegisterAsync));
            throw AppException.Internal();
        }
        finally
        {
            _logger.LogDebug("{Operation} finished in {ElapsedMs} ms", nameof(RegisterAsync), stopwatch.ElapsedMilliseconds);
        }
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var username = request.Username!.Trim();
            var user = await _users.GetByUsernameAsync(username, ct);

            if (user is null)
            {
                _passwordHasher.SimulateVerify(request.Password!);
                _logger.LogWarning("Failed login: unknown username {Username}", username);
                throw AppException.Unauthorized(ErrorCodes.InvalidCredentials, InvalidCredentialsMessage);
            }

            if (!_passwordHasher.Verify(request.Password!, user.PasswordHash))
            {
                _logger.LogWarning("Failed login: wrong password for user {UserId}", user.Id);
                throw AppException.Unauthorized(ErrorCodes.InvalidCredentials, InvalidCredentialsMessage);
            }

            var token = _tokenService.CreateToken(user);
            _logger.LogInformation("User {UserId} logged in", user.Id);

            return new AuthResponse(token.AccessToken, "Bearer", token.ExpiresInSeconds, token.ExpiresAtUtc,
                UserDto.From(user));
        }
        catch (DataAccessException)
        {
            throw AppException.Internal();
        }
        catch (Exception ex) when (ex is not AppException and not OperationCanceledException)
        {
            _logger.LogError(ex, "Unexpected error in {Service}.{Operation}", nameof(AuthService), nameof(LoginAsync));
            throw AppException.Internal();
        }
        finally
        {
            _logger.LogDebug("{Operation} finished in {ElapsedMs} ms", nameof(LoginAsync), stopwatch.ElapsedMilliseconds);
        }
    }

    public async Task<UserDto> GetCurrentUserAsync(int userId, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        try
        {
            var user = await _users.GetByIdAsync(userId, ct)
                       ?? throw AppException.NotFound(ErrorCodes.UserNotFound, "User no longer exists.");
            return UserDto.From(user);
        }
        catch (DataAccessException)
        {
            throw AppException.Internal();
        }
        catch (Exception ex) when (ex is not AppException and not OperationCanceledException)
        {
            _logger.LogError(ex, "Unexpected error in {Service}.{Operation}", nameof(AuthService), nameof(GetCurrentUserAsync));
            throw AppException.Internal();
        }
        finally
        {
            _logger.LogDebug("{Operation} finished in {ElapsedMs} ms", nameof(GetCurrentUserAsync), stopwatch.ElapsedMilliseconds);
        }
    }
}
