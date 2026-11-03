/*
    ProductApiDb - owned by the Product Service (catalogue).
    Safe to re-run: objects are created only if missing. No DROP / TRUNCATE.

    Run with SQL Server authentication (password via the SQLCMDPASSWORD environment variable):
        sqlcmd -S PRITI_LAPTOP -U user1 -b -i database\product-schema.sql
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'ProductApiDb') IS NULL
BEGIN
    CREATE DATABASE [ProductApiDb];
    PRINT 'Database ProductApiDb created.';
END
ELSE
    PRINT 'Database ProductApiDb already exists - skipping.';
GO

USE [ProductApiDb];
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.Products', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Products
    (
        Id            INT             IDENTITY(1,1) NOT NULL,
        Name          NVARCHAR(100)   NOT NULL,
        Description   NVARCHAR(1000)  NULL,
        Price         DECIMAL(10,2)   NOT NULL,
        Stock         INT             NOT NULL
                      CONSTRAINT DF_Products_Stock DEFAULT (0),
        CreatedAt     DATETIME2(3)    NOT NULL
                      CONSTRAINT DF_Products_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt     DATETIME2(3)    NOT NULL
                      CONSTRAINT DF_Products_UpdatedAt DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_Products          PRIMARY KEY CLUSTERED (Id),
        CONSTRAINT UQ_Products_Name     UNIQUE (Name),
        CONSTRAINT CK_Products_NameLen  CHECK (LEN(Name) BETWEEN 2 AND 100),
        CONSTRAINT CK_Products_Price    CHECK (Price BETWEEN 0.01 AND 999999.99),
        CONSTRAINT CK_Products_Stock    CHECK (Stock BETWEEN 0 AND 1000000)
    );
    PRINT 'Table dbo.Products created.';
END
ELSE
    PRINT 'Table dbo.Products already exists - skipping.';
GO

-- Product list: sort by price / newest
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_Price' AND object_id = OBJECT_ID(N'dbo.Products'))
    CREATE NONCLUSTERED INDEX IX_Products_Price ON dbo.Products (Price);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Products'))
    CREATE NONCLUSTERED INDEX IX_Products_CreatedAt ON dbo.Products (CreatedAt);
GO

/* Permissions for user1: data access only (skipped when user1 owns the database). */
DECLARE @user1Sid VARBINARY(85) = SUSER_SID(N'user1');
DECLARE @mappedUser SYSNAME = (SELECT name FROM sys.database_principals WHERE sid = @user1Sid);

IF @user1Sid IS NULL
    PRINT 'WARNING: login user1 does not exist. Create it (see README), then re-run this script.';
ELSE IF @mappedUser = N'dbo'
    PRINT 'user1 owns ProductApiDb (mapped to dbo) - it already has full rights; no grant needed.';
ELSE
BEGIN
    IF @mappedUser IS NULL
    BEGIN
        CREATE USER [user1] FOR LOGIN [user1];
        SET @mappedUser = N'user1';
        PRINT 'Database user user1 created in ProductApiDb.';
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
