using System.Text;
using System.Text.RegularExpressions;
using Auth.Dtos;

namespace Auth.Validation;

/// <summary>Request validation. Returns every problem found so the client can fix them all at once.</summary>
public static partial class AuthValidator
{
    // BCrypt only uses the first 72 bytes of a password; longer input would be silently truncated.
    private const int BcryptMaxBytes = 72;

    public static List<string> ValidateRegister(RegisterRequest? request)
    {
        var errors = new List<string>();
        if (request is null)
        {
            errors.Add("Request body is required.");
            return errors;
        }

        var username = request.Username?.Trim();
        if (string.IsNullOrEmpty(username))
            errors.Add("username is required.");
        else if (username.Length is < 3 or > 50)
            errors.Add("username must be between 3 and 50 characters.");
        else if (!UsernamePattern().IsMatch(username))
            errors.Add("username may contain only letters, digits, '_', '.' and '-'.");

        var email = request.Email?.Trim();
        if (string.IsNullOrEmpty(email))
            errors.Add("email is required.");
        else if (email.Length > 254)
            errors.Add("email must be at most 254 characters.");
        else if (!EmailPattern().IsMatch(email))
            errors.Add("email must be a valid email address.");

        var password = request.Password;
        if (string.IsNullOrEmpty(password))
            errors.Add("password is required.");
        else
        {
            if (password.Length < 8)
                errors.Add("password must be at least 8 characters.");
            if (Encoding.UTF8.GetByteCount(password) > BcryptMaxBytes)
                errors.Add("password must be at most 72 bytes (72 plain ASCII characters).");
            if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit))
                errors.Add("password must contain at least one letter and one digit.");
        }

        return errors;
    }

    public static List<string> ValidateLogin(LoginRequest? request)
    {
        var errors = new List<string>();
        if (request is null)
        {
            errors.Add("Request body is required.");
            return errors;
        }

        var username = request.Username?.Trim();
        if (string.IsNullOrEmpty(username))
            errors.Add("username is required.");
        else if (username.Length > 50)
            errors.Add("username must be at most 50 characters.");

        if (string.IsNullOrEmpty(request.Password))
            errors.Add("password is required.");
        else if (request.Password.Length > 200)
            errors.Add("password is too long.");

        return errors;
    }

    [GeneratedRegex("^[A-Za-z0-9_.-]+$")]
    private static partial Regex UsernamePattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();
}
