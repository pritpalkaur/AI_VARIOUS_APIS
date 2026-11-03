using Auth.Config;
using BCrypt.Net;

namespace Auth.Services;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string password, string hash);

    /// <summary>Spends the same time as a real Verify, so unknown usernames can't be detected by timing.</summary>
    void SimulateVerify(string password);
}

public sealed class BCryptPasswordHasher : IPasswordHasher
{
    private readonly int _workFactor;
    private readonly string _dummyHash;

    public BCryptPasswordHasher(EnvConfig config)
    {
        _workFactor = config.BcryptWorkFactor;
        _dummyHash = BCrypt.Net.BCrypt.HashPassword(Guid.NewGuid().ToString(), _workFactor);
    }

    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, _workFactor);

    public bool Verify(string password, string hash)
    {
        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (SaltParseException)
        {
            return false; // corrupt hash in DB - treat as a failed login
        }
    }

    public void SimulateVerify(string password) => BCrypt.Net.BCrypt.Verify(password, _dummyHash);
}
