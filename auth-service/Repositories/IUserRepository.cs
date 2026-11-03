using Auth.Models;

namespace Auth.Repositories;

public interface IUserRepository
{
    Task<User> CreateAsync(string username, string email, string passwordHash, string role, CancellationToken ct);
    Task<User?> GetByUsernameAsync(string username, CancellationToken ct);
    Task<User?> GetByIdAsync(int id, CancellationToken ct);
}
