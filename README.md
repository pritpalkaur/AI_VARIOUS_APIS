# Store system: Auth, Product and Order APIs + React client

Three REST APIs that share one SQL Server database, plus a web client. Everything runs on your own machine. There are no cloud services.

| Part | Tech | Port | What it does |
|---|---|---|---|
| `auth-service` | C# / ASP.NET Core (.NET 10), `Microsoft.Data.SqlClient`, BCrypt, Serilog | **5001** | Register, log in, issue JWTs |
| `product-service` | Node.js / Express 5, `mssql`, winston | **5002** | Product CRUD (writes need the Admin role) |
| `order-service` | Rust / Axum 0.8, `tiberius` + `bb8`, tracing | **5003** | Order CRUD (a User sees only their own orders) |
| `client` | React 19 + Vite 8 | **5173** | Login, products, orders |
| `database` | SQL Server 2017 or newer | 1433 | Database `AppDb`, login `user1` |

```
 Browser (React, :5173)
   │  Authorization: Bearer <JWT>
   ├──► Auth Service    :5001 ──┐   signs JWTs (HS256, JWT_SECRET)
   ├──► Product Service :5002 ──┼──► SQL Server  AppDb  (login: user1)
   └──► Order Service   :5003 ──┘   both validate JWTs with the same JWT_SECRET / ISSUER / AUDIENCE
```

---

## Contents
1. [Prerequisites](#1-prerequisites)
2. [Configure SQL Server](#2-configure-sql-server)
3. [Create the `user1` login](#3-create-the-user1-login)
4. [Create the database and tables](#4-create-the-database-and-tables)
5. [Configure the `.env` files](#5-configure-the-env-files)
6. [Run the services](#6-run-the-services)
7. [Run the client](#7-run-the-client)
8. [Create an Admin user](#8-create-an-admin-user)
9. [Sample requests (curl)](#9-sample-requests-curl)
10. [API reference](#10-api-reference)
11. [Logging](#11-logging)
12. [Tests](#12-tests)
13. [Troubleshooting](#13-troubleshooting)
14. [Project structure and conventions](#14-project-structure-and-conventions)

---

## 1. Prerequisites

Install these once. All commands are for **Windows PowerShell**.

| Tool | Version | Install | Check |
|---|---|---|---|
| SQL Server | 2017 or newer (Developer or Express) | [microsoft.com/sql-server](https://www.microsoft.com/sql-server/sql-server-downloads) | `Get-Service MSSQLSERVER` |
| sqlcmd | any | Installed with SQL Server, or `winget install Microsoft.Sqlcmd` | `sqlcmd -?` |
| .NET SDK | 10.0 | `winget install Microsoft.DotNet.SDK.10` | `dotnet --list-sdks` |
| Node.js | 20 or newer (built with 22) | `winget install OpenJS.NodeJS.LTS` | `node --version` |
| Visual Studio C++ Build Tools | 2022 or newer | `winget install Microsoft.VisualStudio.2022.BuildTools --override "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive"` | needed by Rust to link |
| Rust | stable (built with 1.99), MSVC toolchain | `winget install Rustlang.Rustup`, then `rustup default stable` | `cargo --version` |

Open a **new** terminal after installing so that `PATH` picks up `dotnet`, `node` and `cargo`.

---

## 2. Configure SQL Server

The services connect with **SQL Server Authentication** over **TCP port 1433**.

1. **Turn on mixed-mode authentication.** In SSMS, right-click the server, choose **Properties → Security**, and select **SQL Server and Windows Authentication mode**.
   To check it from the command line:
   ```powershell
   sqlcmd -S localhost -E -Q "SELECT CASE SERVERPROPERTY('IsIntegratedSecurityOnly') WHEN 1 THEN 'Windows only - change it' ELSE 'Mixed mode - OK' END"
   ```
2. **Turn on TCP/IP.** Open **SQL Server Configuration Manager**, go to **SQL Server Network Configuration → Protocols for MSSQLSERVER**, and set **TCP/IP** to **Enabled**. Under **IP Addresses → IPAll**, set **TCP Port** to `1433`.
3. **Restart SQL Server** to apply both changes. Run this in an elevated PowerShell:
   ```powershell
   Restart-Service MSSQLSERVER
   ```

---

## 3. Create the `user1` login

Skip this step if `user1` already exists. To check:
```powershell
sqlcmd -S localhost -E -Q "SELECT name FROM sys.server_principals WHERE name = 'user1'"
```

The password is **never written to a file**. You type it once, it lives in an environment variable for this terminal only, and `database\create-login.sql` reads it through sqlcmd's `$(USER1_PASSWORD)` variable.

```powershell
cd C:\AI_VARIOUS_APIS

# Type the password (hidden). Avoid single quotes (') in it.
$secure = Read-Host "Password for user1" -AsSecureString
$env:USER1_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password

sqlcmd -S localhost -E -b -i database\create-login.sql

# Remove it from this terminal again
Remove-Item Env:USER1_PASSWORD
```

`CHECK_POLICY = ON` means the password must meet the Windows password policy: by default at least 8 characters, using 3 of upper case, lower case, digits and symbols.

---

## 4. Create the database and tables

Run the schema as **yourself (Windows authentication)**, not as `user1`:

```powershell
sqlcmd -S localhost -E -b -i database\schema.sql
```

The script creates:
- the database `AppDb`
- the tables `Users`, `Products` and `Orders`, with primary keys, foreign keys, check constraints and indexes
- a database user for `user1`, with **only** `SELECT / INSERT / UPDATE / DELETE` on `dbo`. It gets no rights to change the schema.

It's **safe to re-run**. Each object is created only if it doesn't already exist, and the script contains no `DROP` or `TRUNCATE`.

> **Order of steps:** if `user1` didn't exist when you ran `schema.sql`, the script prints a warning and skips the permissions. Do step 3, then re-run this step.

Check that it worked:
```powershell
sqlcmd -S localhost -E -d AppDb -Q "SELECT name FROM sys.tables ORDER BY name"
```

---

## 5. Configure the `.env` files

Each service reads its own `.env` file, which is git-ignored. Create them from the examples:

```powershell
cd C:\AI_VARIOUS_APIS
Copy-Item auth-service\.env.example    auth-service\.env
Copy-Item product-service\.env.example product-service\.env
Copy-Item order-service\.env.example   order-service\.env
Copy-Item client\.env.example          client\.env      # optional: it only holds the default URLs
```

Generate **one** JWT secret. The three services must share it:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then edit the three service `.env` files:

| Setting | `auth-service` | `product-service` | `order-service` |
|---|---|---|---|
| `DB_PASSWORD` | user1's password | same | same |
| `JWT_SECRET` | the generated value | **identical** | **identical** |
| `JWT_ISSUER` | `auth-service` | **identical** | **identical** |
| `JWT_AUDIENCE` | `app-clients` | **identical** | **identical** |
| `PORT` | 5001 | 5002 | 5003 |

Leave every other setting at its default unless your SQL Server isn't the default instance on `localhost:1433`. For a named instance, use its TCP port in `DB_PORT`.

Every service checks its settings at startup. If something is missing or invalid, it prints the setting names (never their values) and exits.

---

## 6. Run the services

Use **one terminal per service**. Stop each one with **Ctrl+C**, which shuts it down gracefully: in-flight requests finish, the connection pool closes and the logs are flushed.

**Terminal 1: Auth Service (C#)**
```powershell
cd C:\AI_VARIOUS_APIS\auth-service
dotnet run
# [.. INF] Connected to SQL Server localhost,1433, database AppDb
# [.. INF] Auth service listening on http://localhost:5001
```

**Terminal 2: Product Service (Node)**
```powershell
cd C:\AI_VARIOUS_APIS\product-service
npm install        # first time only
npm start          # or: npm run dev  (restarts automatically when files change)
# [.. info] Connected to SQL Server
# [.. info] Product service listening on http://localhost:5002
```

**Terminal 3: Order Service (Rust)**
```powershell
cd C:\AI_VARIOUS_APIS\order-service
cargo run          # the first build downloads and compiles crates (~2 minutes)
# INFO Connected to SQL Server
# INFO Order service listening on http://localhost:5003
```

For an optimized build, use `cargo run --release`.

Quick check (`curl.exe` comes with Windows):
```powershell
curl.exe http://localhost:5001/health
curl.exe http://localhost:5002/health
curl.exe http://localhost:5003/health
```

Windows may show a firewall prompt the first time each service starts. All services listen on `localhost` only, so allowing **private networks** is enough.

---

## 7. Run the client

**Terminal 4**
```powershell
cd C:\AI_VARIOUS_APIS\client
npm install        # first time only
npm run dev
```

Open **http://localhost:5173**. The client must run on exactly this port, because the APIs only accept browser requests (CORS) from `http://localhost:5173`. Vite is configured with `strictPort`, so it fails instead of silently switching to another port.

For a production build, run `npm run build` and then `npm run preview`.

---

## 8. Create an Admin user

Everyone registers as a normal **User**. To get an **Admin**:

1. Register through the client (**Register** on the login page) or with the curl in section 9.
2. Promote the account:
   ```powershell
   sqlcmd -S localhost -E -d AppDb -Q "UPDATE dbo.Users SET Role = N'Admin' WHERE Username = N'alice'"
   ```
3. **Log out and log in again.** The role is stored inside the JWT, so a token issued before the promotion still says `User`.

| Role | Products | Orders |
|---|---|---|
| User | read | create / read / update / delete **own** orders |
| Admin | read, create, update, delete | create / read / update / delete **all** orders |

---

## 9. Sample requests (curl)

These examples are written for **Git Bash**, which comes with Git for Windows. Windows PowerShell 5.1 mangles the JSON quotes it passes to `curl.exe`; a PowerShell version of the login request follows below. `node` is used to pull the token out of the JSON response, so `jq` isn't needed.

```bash
AUTH=http://localhost:5001
PRODUCTS=http://localhost:5002
ORDERS=http://localhost:5003
json() { node -pe "JSON.parse(require('fs').readFileSync(0,'utf8'))$1"; }
```

### 9.1 Auth Service

```bash
# Health
curl -s $AUTH/health

# Register (201)
curl -s -X POST $AUTH/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"Secret123"}'

# Register the same username again (409 USERNAME_TAKEN)
curl -s -X POST $AUTH/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"other@example.com","password":"Secret123"}'

# Invalid input (400 VALIDATION_ERROR, lists every problem)
curl -s -X POST $AUTH/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"a!","email":"nope","password":"short"}'

# A second, normal user for the ownership examples
curl -s -X POST $AUTH/api/auth/register -H "Content-Type: application/json" \
  -d '{"username":"bob","email":"bob@example.com","password":"Secret123"}'
```

Now promote `alice` to Admin (section 8), then log in:

```bash
# Login (200) - save the tokens
ADMIN_TOKEN=$(curl -s -X POST $AUTH/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"Secret123"}' | json .data.accessToken)
USER_TOKEN=$(curl -s -X POST $AUTH/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"bob","password":"Secret123"}' | json .data.accessToken)

# Wrong password (401 INVALID_CREDENTIALS)
curl -s -X POST $AUTH/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"wrong-pass1"}'

# Current user (200)
curl -s $AUTH/api/auth/me -H "Authorization: Bearer $ADMIN_TOKEN"

# No token (401 UNAUTHORIZED)
curl -s $AUTH/api/auth/me
```

### 9.2 Product Service

```bash
# Health
curl -s $PRODUCTS/health

# Create (Admin, 201 + Location header)
curl -s -i -X POST $PRODUCTS/api/products -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Wireless Mouse","description":"2.4 GHz, USB receiver","price":24.99,"stock":150}'
curl -s -X POST $PRODUCTS/api/products -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Mechanical Keyboard","price":89.50,"stock":40}'

# Create as a normal User (403 FORBIDDEN)
curl -s -X POST $PRODUCTS/api/products -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"Nope","price":1}'

# Duplicate name (409 PRODUCT_NAME_TAKEN)
curl -s -X POST $PRODUCTS/api/products -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"wireless mouse","price":10}'

# Invalid input (400 VALIDATION_ERROR)
curl -s -X POST $PRODUCTS/api/products -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" -d '{"name":"X","price":1.234,"stock":-5}'

# List with paging, sorting and search (any logged-in user)
curl -s "$PRODUCTS/api/products?page=1&pageSize=10&sortBy=price&sortDir=asc&search=mouse" \
  -H "Authorization: Bearer $USER_TOKEN"

# Get by id (200), or 404 PRODUCT_NOT_FOUND
curl -s $PRODUCTS/api/products/1 -H "Authorization: Bearer $USER_TOKEN"
curl -s $PRODUCTS/api/products/9999 -H "Authorization: Bearer $USER_TOKEN"

# Update - full replace (Admin, 200)
curl -s -X PUT $PRODUCTS/api/products/1 -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Wireless Mouse","description":"Now with silent clicks","price":22.99,"stock":140}'

# Delete (Admin, 200) - product 2 has no orders yet
curl -s -X DELETE $PRODUCTS/api/products/2 -H "Authorization: Bearer $ADMIN_TOKEN"
```

### 9.3 Order Service

```bash
# Health
curl -s $ORDERS/health

# Create as bob (201) - status defaults to Pending, orderDate defaults to now
curl -s -i -X POST $ORDERS/api/orders -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" -d '{"productId":1,"quantity":2}'

# Create with explicit status and date (201)
curl -s -X POST $ORDERS/api/orders -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":1,"status":"Confirmed","orderDate":"2026-11-03T14:30:00Z"}'

# Product does not exist (404 PRODUCT_NOT_FOUND)
curl -s -X POST $ORDERS/api/orders -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" -d '{"productId":9999,"quantity":1}'

# Invalid input (400 VALIDATION_ERROR)
curl -s -X POST $ORDERS/api/orders -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" -d '{"productId":0,"quantity":2.5,"orderDate":"03/11/2026"}'

# List - bob sees only his orders; alice (Admin) sees everyone's
curl -s "$ORDERS/api/orders?page=1&pageSize=20&sortBy=orderDate&sortDir=desc" \
  -H "Authorization: Bearer $USER_TOKEN"
curl -s "$ORDERS/api/orders?status=Pending&sortBy=totalPrice&sortDir=desc" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get by id (200)
curl -s $ORDERS/api/orders/1 -H "Authorization: Bearer $USER_TOKEN"

# Update - full replace, every field required (200)
curl -s -X PUT $ORDERS/api/orders/1 -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"productId":1,"quantity":3,"status":"Shipped","orderDate":"2026-11-03"}'

# Delete (200)
curl -s -X DELETE $ORDERS/api/orders/2 -H "Authorization: Bearer $USER_TOKEN"
```

Some cross-service checks:
```bash
# A product that has orders cannot be deleted (409 PRODUCT_HAS_ORDERS)
curl -s -X DELETE $PRODUCTS/api/products/1 -H "Authorization: Bearer $ADMIN_TOKEN"

# Expired, tampered or missing token on any service (401)
curl -s $ORDERS/api/orders -H "Authorization: Bearer not.a.token"
```

### PowerShell equivalent (login + list)

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:5001/api/auth/login `
  -ContentType 'application/json' -Body (@{ username = 'alice'; password = 'Secret123' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }
Invoke-RestMethod -Uri 'http://localhost:5002/api/products?pageSize=5' -Headers $headers | ConvertTo-Json -Depth 5
```

Note that `Invoke-RestMethod` throws on 4xx/5xx responses. To see the JSON error body, use `curl` from Git Bash.

---

## 10. API reference

### Response shape (all three services)

```jsonc
// Success
{ "success": true, "data": { /* ... */ }, "message": "Product created." }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "price must be between 0.01 and 999999.99." } }
```

List endpoints return their `data` in this form:
```json
{ "items": [ ], "pagination": { "page": 1, "pageSize": 20, "totalItems": 42, "totalPages": 3 } }
```

### Endpoints

| Service | Method and path | Auth | Success | Errors |
|---|---|---|---|---|
| Auth | `POST /api/auth/register` | none | 201 | 400, 409 |
| Auth | `POST /api/auth/login` | none | 200 | 400, 401 |
| Auth | `GET /api/auth/me` | Bearer | 200 | 401, 404 |
| Product | `GET /api/products` | Bearer | 200 | 400, 401 |
| Product | `GET /api/products/:id` | Bearer | 200 | 400, 401, 404 |
| Product | `POST /api/products` | Admin | 201 | 400, 401, 403, 409 |
| Product | `PUT /api/products/:id` | Admin | 200 | 400, 401, 403, 404, 409 |
| Product | `DELETE /api/products/:id` | Admin | 200 | 400, 401, 403, 404, 409 |
| Order | `GET /api/orders` | Bearer | 200 | 400, 401 |
| Order | `GET /api/orders/:id` | Bearer | 200 | 400, 401, 404 |
| Order | `POST /api/orders` | Bearer | 201 | 400, 401, 404 |
| Order | `PUT /api/orders/:id` | Bearer | 200 | 400, 401, 404 |
| Order | `DELETE /api/orders/:id` | Bearer | 200 | 400, 401, 404 |
| All | `GET /health` | none | 200 | |

Any service can also return **500 `INTERNAL_ERROR`** with a generic message. The details go to the log only.

### Query parameters

| Endpoint | Parameter | Values / default |
|---|---|---|
| `GET /api/products` | `page` | ≥ 1, default 1 |
| | `pageSize` | 1–100, default 20 |
| | `sortBy` | `id`, `name`, `price`, `stock`, `createdAt` (default), `updatedAt` |
| | `sortDir` | `asc`, `desc` (default) |
| | `search` | text found anywhere in the name, max 100 characters |
| `GET /api/orders` | `page`, `pageSize` | same as products |
| | `sortBy` | `id`, `orderDate` (default), `quantity`, `totalPrice`, `status`, `createdAt` |
| | `sortDir` | `asc`, `desc` (default) |
| | `status` | `Pending`, `Confirmed`, `Shipped`, `Delivered`, `Cancelled` |

### Validation rules

| Field | Rule |
|---|---|
| `username` | required, 3–50 characters, letters, digits, `_` `.` `-` only, unique (case-insensitive) |
| `email` | required, valid format, max 254 characters, unique |
| `password` | required, 8–72 **bytes** (BCrypt's limit), at least one letter and one digit |
| `name` (product) | required, 2–100 characters, unique (case-insensitive) |
| `description` | optional, max 1000 characters, empty means `null` |
| `price` | required JSON number, 0.01–999999.99, max 2 decimals |
| `stock` | integer 0–1000000, default 0 |
| `productId` | required, must reference an existing product |
| `quantity` | required integer, 1–10000 |
| `status` | one of the five statuses. Optional on POST (default `Pending`), required on PUT |
| `orderDate` | ISO-8601 date-time with an offset (`2026-11-03T14:30:00Z`) or date only (`2026-11-03`), years 2000–2100. Optional on POST (default now), required on PUT |

### Order behaviour
- `unitPrice` is copied from the product **when the order is created**. Later product price changes don't affect existing orders. It's only copied again when an update switches the order to a **different** product.
- `totalPrice` = `quantity × unitPrice`. The database calculates it (as a computed column).
- A User asking for another user's order gets **404**, not 403, so other users' order ids aren't revealed.

### Error codes

`VALIDATION_ERROR`, `INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`, `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `FORBIDDEN`, `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `USER_NOT_FOUND`, `USERNAME_TAKEN`, `EMAIL_TAKEN`, `PRODUCT_NOT_FOUND`, `PRODUCT_NAME_TAKEN`, `PRODUCT_HAS_ORDERS`, `ORDER_NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`.

### JWT
- Algorithm **HS256**, signed by the Auth Service with `JWT_SECRET`. It's valid for `JWT_EXPIRES_MINUTES` (default 60). There are no refresh tokens: when it expires, the client returns you to the login page.
- Claims: `sub` (user id), `username`, `role` (`Admin` or `User`), `jti`, `iat`, `nbf`, `exp`, `iss`, `aud`.
- Each service checks the signature, `iss`, `aud` and `exp`, allowing 30 seconds of clock difference.

---

## 11. Logging

| Service | Console | File (JSON, rotated daily, kept 14 days) |
|---|---|---|
| Auth | readable text | `auth-service/logs/auth-service-YYYYMMDD.log` |
| Product | readable text | `product-service/logs/product-service-YYYY-MM-DD.log` |
| Order | readable text | `order-service/logs/order-service.YYYY-MM-DD.log` |

- **What's logged:** every request (method, path, status, duration), every caught error with context, startup and shutdown, and logins, including failed ones.
- **What's never logged:** passwords, JWTs, `Authorization` headers, connection strings, query strings or request bodies.
- **Level:** set `LOG_LEVEL` in each `.env` to `trace`, `debug`, `info` (default), `warn`, `error` or `fatal`. At `debug`, each service and repository call also logs how long it took.
- **Location:** set `LOG_DIR` to change where the files go. Relative paths start from the service's folder.

---

## 12. Tests

```powershell
cd C:\AI_VARIOUS_APIS\order-service
cargo test     # 12 router tests: JWT checks, validation, 400/401/404/405/415 - no database needed
```

The full flow, with all services running, is covered by the curl examples in section 9.

---

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| `Login failed for user 'user1'` | Mixed-mode authentication is off (section 2), the password in `.env` is wrong, or the login is disabled: `ALTER LOGIN [user1] ENABLE`. |
| `Cannot open database "AppDb" requested by the login` | `schema.sql` ran before `user1` existed. Re-run step 4. |
| Timeout, or `ECONNREFUSED 127.0.0.1:1433` | TCP/IP is disabled or SQL Server uses another port (section 2). For a named instance, set `DB_PORT` to its TCP port. |
| Certificate / TLS errors | Local SQL Server uses a self-signed certificate. Keep `DB_TRUST_SERVER_CERT=true`. |
| `401 Missing or invalid access token` from Product or Order, but login works | `JWT_SECRET`, `JWT_ISSUER` or `JWT_AUDIENCE` differ between the `.env` files. They must be identical. Restart the service after editing. |
| `403 FORBIDDEN` right after promoting to Admin | Log out and log in again to get a token with the new role. |
| Browser shows CORS errors | The client must be on `http://localhost:5173`, not `127.0.0.1`. Check `CORS_ORIGIN` in the service `.env` files. |
| Client shows "Cannot reach the … service" | That service isn't running, or it's on a different port. Check `client/.env`. |
| `Invalid configuration: …` at startup | The listed settings are missing or invalid in that service's `.env`. |
| `address already in use` / `EADDRINUSE` | Another process holds the port. Run `Get-NetTCPConnection -LocalPort 5002` and stop the process it shows. |
| Rust: `linker 'link.exe' not found` | Install the Visual Studio C++ Build Tools (section 1) and open a new terminal. |

---

## 14. Project structure and conventions

```
AI_VARIOUS_APIS/
├── database/         schema.sql, create-login.sql
├── auth-service/     Controllers → Services → Repositories → Data (SqlConnectionFactory)
├── product-service/  routes → controllers → services → repositories → db/pool.js
├── order-service/    routes.rs → handlers → services → repositories → db.rs (bb8 pool)
└── client/           pages, components, api (fetch wrapper), context (auth)
```

**Rules every service follows:**
- **Layers:** routing/controllers handle HTTP only, services hold business rules, repositories hold all SQL.
- **No ORM:** plain parameterized SQL only. Even sorting avoids string building: it uses `CASE` branches chosen by parameters.
- **One connection pool per service:** created at startup (after a connectivity check that stops the service on failure) and closed on shutdown.
  - **C#:** each repository method disposes its `SqlConnection` / `SqlCommand` / `SqlDataReader` in an explicit `finally`, which returns the connection to the ADO.NET pool. `SqlConnection.ClearAllPools()` runs on shutdown.
  - **Node:** each `mssql` request returns its connection when the query finishes, whether it succeeded or failed. The delete transaction rolls back in `finally` if it wasn't committed, which releases its connection. `pool.close()` runs on shutdown.
  - **Rust:** `Result<T, AppError>` with `?`. The pooled connection goes back to the pool automatically when it goes out of scope, including on early error returns.
- **Errors:** SQL errors and stack traces are logged and turned into a generic 500. Unique and foreign-key violations become 409 or 404 with a clear message.

**Security notes:**
- Passwords are stored as BCrypt hashes (cost 12).
- A login with an unknown username still runs a BCrypt check, so response timing doesn't reveal which usernames exist.
- The `user1` database user can only read and write data. It can't change the schema.
- Real `.env` files are git-ignored. Only `.env.example` files with placeholders are committed.
- The client keeps the JWT in `sessionStorage`, so it's cleared when the tab closes.
