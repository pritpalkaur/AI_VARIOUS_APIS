/*
    AuthDb - owned by the Auth Service (users and credentials).
    Safe to re-run: objects are created only if missing. No DROP / TRUNCATE.

    Run with SQL Server authentication (password via the SQLCMDPASSWORD environment variable):
        sqlcmd -S PRITI_LAPTOP -U user1 -b -i database\auth-schema.sql
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'AuthDb') IS NULL
BEGIN
    CREATE DATABASE [AuthDb];
    PRINT 'Database AuthDb created.';
END
ELSE
    PRINT 'Database AuthDb already exists - skipping.';
GO

USE [AuthDb];
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users
    (
        Id            INT            IDENTITY(1,1) NOT NULL,
        Username      NVARCHAR(50)   NOT NULL,
        Email         NVARCHAR(254)  NOT NULL,
        PasswordHash  NVARCHAR(100)  NOT NULL,          -- BCrypt hash (60 chars)
        Role          NVARCHAR(20)   NOT NULL
                      CONSTRAINT DF_Users_Role DEFAULT (N'User'),
        CreatedAt     DATETIME2(3)   NOT NULL
                      CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_Users              PRIMARY KEY CLUSTERED (Id),
        CONSTRAINT UQ_Users_Username     UNIQUE (Username),
        CONSTRAINT UQ_Users_Email        UNIQUE (Email),
        CONSTRAINT CK_Users_Role         CHECK (Role IN (N'Admin', N'User')),
        CONSTRAINT CK_Users_UsernameLen  CHECK (LEN(Username) BETWEEN 3 AND 50)
    );
    PRINT 'Table dbo.Users created.';
END
ELSE
    PRINT 'Table dbo.Users already exists - skipping.';
GO

/* Permissions for user1: data access only (skipped when user1 owns the database). */
DECLARE @user1Sid VARBINARY(85) = SUSER_SID(N'user1');
DECLARE @mappedUser SYSNAME = (SELECT name FROM sys.database_principals WHERE sid = @user1Sid);

IF @user1Sid IS NULL
    PRINT 'WARNING: login user1 does not exist. Create it (see README), then re-run this script.';
ELSE IF @mappedUser = N'dbo'
    PRINT 'user1 owns AuthDb (mapped to dbo) - it already has full rights; no grant needed.';
ELSE
BEGIN
    IF @mappedUser IS NULL
    BEGIN
        CREATE USER [user1] FOR LOGIN [user1];
        SET @mappedUser = N'user1';
        PRINT 'Database user user1 created in AuthDb.';
    END
    IF @mappedUser = N'user1'
    BEGIN
        GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [user1];
        PRINT 'Granted SELECT/INSERT/UPDATE/DELETE on dbo to user1.';
    END
    ELSE
        PRINT 'Login user1 is mapped to database user ' + @mappedUser + ' - grant it SELECT/INSERT/UPDATE/DELETE on dbo manually.';
END
GO

-- Promote a user to Admin (run manually after registering):
-- UPDATE AuthDb.dbo.Users SET Role = N'Admin' WHERE Username = N'your_username';
