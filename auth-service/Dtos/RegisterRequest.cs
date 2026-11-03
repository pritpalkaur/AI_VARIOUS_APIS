namespace Auth.Dtos;

// A class (not a record) so a generated ToString() can never print the password into a log.
// Properties are nullable so missing fields reach AuthValidator and get clear 400 messages.
public sealed class RegisterRequest
{
    public string? Username { get; init; }
    public string? Email { get; init; }
    public string? Password { get; init; }
}
