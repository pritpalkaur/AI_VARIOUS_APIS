/*
    Creates the SQL Server login user1 (only if it does not exist yet).

    The password is NOT stored in this file. sqlcmd fills in $(USER1_PASSWORD) from an
    environment variable of the same name, which you set for one shell session only
    (see README, step 3). Avoid single quotes (') in the password.

    Run as an admin:
        sqlcmd -S localhost -E -b -i database\create-login.sql
*/

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'user1')
BEGIN
    CREATE LOGIN [user1]
        WITH PASSWORD = N'$(USER1_PASSWORD)',
             CHECK_POLICY = ON,
             DEFAULT_DATABASE = [master];
    PRINT 'Login user1 created.';
END
ELSE
    PRINT 'Login user1 already exists - skipping.';
GO
