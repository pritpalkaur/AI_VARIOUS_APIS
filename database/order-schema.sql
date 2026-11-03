/*
    OrderApiDb - owned by the Order Service.
    Safe to re-run: objects are created only if missing. No DROP / TRUNCATE.

    Products and users live in other databases (ProductApiDb, AuthDb), so there are no foreign
    keys to them - SQL Server cannot enforce constraints across databases. Instead:
      - the Order Service checks the product through the Product API when an order is
        created or switched to another product, and
      - each order stores a snapshot of what it needs to display (ProductName, Username,
        UnitPrice), so it never has to read another service's database.

    Run with SQL Server authentication (password via the SQLCMDPASSWORD environment variable):
        sqlcmd -S PRITI_LAPTOP -U user1 -b -i database\order-schema.sql
*/

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF DB_ID(N'OrderApiDb') IS NULL
BEGIN
    CREATE DATABASE [OrderApiDb];
    PRINT 'Database OrderApiDb created.';
END
ELSE
    PRINT 'Database OrderApiDb already exists - skipping.';
GO

USE [OrderApiDb];
GO

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID(N'dbo.Orders', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Orders
    (
        Id            INT            IDENTITY(1,1) NOT NULL,
        ProductId     INT            NOT NULL,          -- ProductApiDb.dbo.Products.Id (checked via the Product API)
        ProductName   NVARCHAR(100)  NOT NULL,          -- snapshot when the order is created / product changed
        UserId        INT            NOT NULL,          -- AuthDb.dbo.Users.Id (from the JWT "sub" claim)
        Username      NVARCHAR(50)   NOT NULL,          -- snapshot from the JWT "username" claim
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
        CONSTRAINT CK_Orders_ProductId  CHECK (ProductId >= 1),
        CONSTRAINT CK_Orders_UserId     CHECK (UserId >= 1),
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

-- "Does this product have orders?" (asked by the Product Service before a delete) + ?productId= filter
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

/* Permissions for user1: data access only (skipped when user1 owns the database). */
DECLARE @user1Sid VARBINARY(85) = SUSER_SID(N'user1');
DECLARE @mappedUser SYSNAME = (SELECT name FROM sys.database_principals WHERE sid = @user1Sid);

IF @user1Sid IS NULL
    PRINT 'WARNING: login user1 does not exist. Create it (see README), then re-run this script.';
ELSE IF @mappedUser = N'dbo'
    PRINT 'user1 owns OrderApiDb (mapped to dbo) - it already has full rights; no grant needed.';
ELSE
BEGIN
    IF @mappedUser IS NULL
    BEGIN
        CREATE USER [user1] FOR LOGIN [user1];
        SET @mappedUser = N'user1';
        PRINT 'Database user user1 created in OrderApiDb.';
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
