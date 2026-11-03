using System.Text.RegularExpressions;

namespace Auth.Common;

/// <summary>
/// Thrown by repositories. Wraps the driver exception (already logged) so SQL details
/// never travel past the service layer.
/// </summary>
public sealed partial class DataAccessException : Exception
{
    public string Operation { get; }
    public bool IsUniqueViolation { get; }
    public string? ConstraintName { get; }

    public DataAccessException(string operation, string message, Exception? inner = null,
        bool isUniqueViolation = false, string? constraintName = null)
        : base(message, inner)
    {
        Operation = operation;
        IsUniqueViolation = isUniqueViolation;
        ConstraintName = constraintName;
    }

    /// <summary>Extracts 'UQ_Users_Username' from SQL Server error 2627/2601 text.</summary>
    public static string? ExtractConstraintName(string sqlMessage)
    {
        var match = QuotedName().Match(sqlMessage);
        return match.Success ? match.Groups[1].Value : null;
    }

    [GeneratedRegex(@"'(UQ_[A-Za-z0-9_]+|IX_[A-Za-z0-9_]+)'")]
    private static partial Regex QuotedName();
}
