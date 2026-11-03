using Auth.Dtos;

namespace Auth.Services;

public interface IAuthService
{
    Task<UserDto> RegisterAsync(RegisterRequest request, CancellationToken ct);
    Task<AuthResponse> LoginAsync(LoginRequest request, CancellationToken ct);
    Task<UserDto> GetCurrentUserAsync(int userId, CancellationToken ct);
}
