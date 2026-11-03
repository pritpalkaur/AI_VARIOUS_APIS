/*
    AppDb schema
    ------------
    Safe to re-run: every object is created only if it does not already exist.
    This script contains NO DROP, TRUNCATE, or other destructive statements.

    Run as a SQL Server admin (e.g. Windows Authentication), NOT as user1:
        sqlcmd -S localhost -E -b -i database\schema.sql

    user1 receives only data permissions (SELECT/INSERT/UPDATE/DELETE) on dbo,
    no DDL rights. The user1 login itself is created separately (see README),
    because its password must never appear in a committed file.
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------------
   1. Database
--------------------------------------------------------------------------- */
IF DB_ID(N'AppDb') IS NULL
BEGIN
    CREATE DATABASE [AppDb];
    PRINT 'Database AppDb created.';
END
ELSE
    PRINT 'Database AppDb already exists - skipping.';
GO

USE [AppDb];
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------------------------------------------------------------------------
   2. Users  (owned by Auth Service)
--------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   3. Products  (owned by Product Service)
--------------------------------------------------------------------------- */
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

/* ---------------------------------------------------------------------------
   4. Orders  (owned by Order Service) - one product per order
--------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Orders
    (
        Id            INT            IDENTITY(1,1) NOT NULL,
        ProductId     INT            NOT NULL,
        UserId        INT            NOT NULL,
        Quantity      INT            NOT NULL,
        UnitPrice     DECIMAL(10,2)  NOT NULL,          -- product price snapshot at order time
        TotalPrice    AS CAST(Quantity * UnitPrice AS DECIMAL(18,2)) PERSISTED,
        Status        NVARCHAR(20)   NOT NULL
                      CONSTRAINT DF_Orders_Status DEFAULT (N'Pending'),
        OrderDate     DATETIME2(3)   NOT NULL
                      CONSTRAINT DF_Orders_OrderDate DEFAULT (SYSUTCDATETIME()),
        CreatedAt     DATETIME2(3)   NOT NULL
                      CONSTRAINT DF_Orders_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt     DATETIME2(3)   NOT NULL
                      CONSTRAINT DF_Orders_UpdatedAt DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT PK_Orders            PRIMARY KEY CLUSTERED (Id),
        -- NO ACTION: deleting a product/user that has orders is rejected (API returns 409)
        CONSTRAINT FK_Orders_Products   FOREIGN KEY (ProductId) REFERENCES dbo.Products (Id)
                                        ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT FK_Orders_Users      FOREIGN KEY (UserId)    REFERENCES dbo.Users (Id)
                                        ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT CK_Orders_Quantity   CHECK (Quantity BETWEEN 1 AND 10000),
        CONSTRAINT CK_Orders_UnitPrice  CHECK (UnitPrice BETWEEN 0.01 AND 999999.99),
        CONSTRAINT CK_Orders_Status     CHECK (Status IN (N'Pending', N'Confirmed', N'Shipped',
                                                          N'Delivered', N'Cancelled'))
    );
    PRINT 'Table dbo.Orders created.';
END
ELSE
    PRINT 'Table dbo.Orders already exists - skipping.';
GO

/* ---------------------------------------------------------------------------
   5. Indexes  (PKs and UNIQUE constraints above already create their own)
--------------------------------------------------------------------------- */

-- Product list: sort by price / newest
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_Price' AND object_id = OBJECT_ID(N'dbo.Products'))
    CREATE NONCLUSTERED INDEX IX_Products_Price ON dbo.Products (Price);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Products_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Products'))
    CREATE NONCLUSTERED INDEX IX_Products_CreatedAt ON dbo.Products (CreatedAt);
GO

-- FK support + "does this product have orders?" check before delete
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_ProductId' AND object_id = OBJECT_ID(N'dbo.Orders'))
    CREATE NONCLUSTERED INDEX IX_Orders_ProductId ON dbo.Orders (ProductId);
GO

-- "My orders" list (role User), newest first
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_UserId_OrderDate' AND object_id = OBJECT_ID(N'dbo.Orders'))
    CREATE NONCLUSTERED INDEX IX_Orders_UserId_OrderDate ON dbo.Orders (UserId, OrderDate DESC);
GO

-- ?status= filter, newest first
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_Status_OrderDate' AND object_id = OBJECT_ID(N'dbo.Orders'))
    CREATE NONCLUSTERED INDEX IX_Orders_Status_OrderDate ON dbo.Orders (Status, OrderDate DESC);
GO

/* ---------------------------------------------------------------------------
   6. Permissions for user1 (data access only, no DDL)
--------------------------------------------------------------------------- */
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'user1')
BEGIN
    IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'user1')
    BEGIN
        CREATE USER [user1] FOR LOGIN [user1];
        PRINT 'Database user user1 created in AppDb.';
    END

    GRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [user1];
    PRINT 'Granted SELECT/INSERT/UPDATE/DELETE on dbo to user1.';
END
ELSE
    PRINT 'WARNING: login user1 does not exist. Create it (see README), then re-run this script.';
GO

/* ---------------------------------------------------------------------------
   7. Promote a user to Admin (run manually after registering via the API)
--------------------------------------------------------------------------- */
-- UPDATE dbo.Users SET Role = N'Admin' WHERE Username = N'your_username';
