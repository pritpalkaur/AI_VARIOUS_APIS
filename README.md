# Store system: Auth, Product and Order APIs + gateway + React client

Three REST APIs that share one SQL Server database, an API gateway in front of them, and a web client. Everything runs on your own machine. There are no cloud services.

| Part | Tech | Port | What it does |
|---|---|---|---|
| `api-gateway` | C# / ASP.NET Core (.NET 10) + YARP, Serilog | **5000** | The single entry point: routes requests to the services, checks JWTs, answers CORS |
| `auth-service` | C# / ASP.NET Core (.NET 10), `Microsoft.Data.SqlClient`, BCrypt, Serilog | **5001** | Register, log in, issue JWTs |
| `product-service` | Node.js / Express 5, `mssql`, winston | **5002** | Product CRUD (writes need the Admin role) |
| `order-service` | Rust / Axum 0.8, `tiberius` + `bb8`, tracing | **5003** | Order CRUD (a User sees only their own orders) |
| `client` | React 19 + Vite 8 | **5173** | Login, products, orders |
| `database` | SQL Server 2017 or newer | 1433 | **One database per service**: `AuthDb`, `ProductApiDb`, `OrderApiDb` (login `user1`) |

```
 Browser (React, :5173)
   │  every request: http://localhost:5000/api/...   (Authorization: Bearer <JWT>)
   ▼
 API Gateway :5000  (YARP)   - CORS for the client, JWT check (login/register are public)
   │  /api/auth/*     ──► Auth Service    :5001 ──► AuthDb        (Users)
   │  /api/products*  ──► Product Service :5002 ──► ProductApiDb  (Products)
   │  /api/orders*    ──► Order Service   :5003 ──► OrderApiDb    (Orders)
   │
   │  service-to-service (direct, with the caller's token):
   │    Order   ──GET /api/products/{id}────────────► Product   (price + name for a new order)
   │    Product ──GET /api/orders?productId=..──────► Order     ("has orders?" before a delete)
```

The client only knows the gateway's address. The services stay reachable directly on `localhost` for debugging and for their Swagger UIs.

Each service owns its database and never reads another's. Data that crosses service lines goes through the other service's API; see [Cross-service data](#cross-service-data).

---

## Contents
1. [Prerequisites](#1-prerequisites)
2. [Configure SQL Server](#2-configure-sql-server)
3. [Create the `user1` login](#3-create-the-user1-login)
4. [Create the databases and tables](#4-create-the-databases-and-tables)
5. [Configure the `.env` files](#5-configure-the-env-files)
6. [Run the services](#6-run-the-services)
7. [Run the client](#7-run-the-client)
8. [Create an Admin user](#8-create-an-admin-user)
9. [Sample requests (curl)](#9-sample-requests-curl)
10. [API reference](#10-api-reference) (interactive docs: [Swagger UI](#swagger-ui--openapi))
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

To create it, use SQL Server Management Studio:
1. Connect with Windows authentication.
2. Expand **Security → Logins**, right-click, and choose **New Login…**.
3. Enter the login name `user1`, choose **SQL Server authentication**, and type the password.
4. On **Server Roles**, tick **dbcreator** so `user1` can create the three databases in step 4.

The password is only typed into SSMS and your local `.env` (step 5). It never goes into a script or the README.

(The repo used to include a `database\create-login.sql` script for this. It's still in git history: `git checkout 3e87644 -- database/create-login.sql`.)

---

## 4. Create the databases and tables

Each service has its **own database**, with one script each. Run them with **SQL Server authentication** as `user1`. Put the password in sqlcmd's `SQLCMDPASSWORD` variable rather than on the command line, so it doesn't show up in the process list or your shell history:

```powershell
cd C:\AI_VARIOUS_APIS
$secure = Read-Host "Password for user1" -AsSecureString
$env:SQLCMDPASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password

sqlcmd -S PRITI_LAPTOP -U user1 -b -i database\auth-schema.sql      # AuthDb       -> Users
sqlcmd -S PRITI_LAPTOP -U user1 -b -i database\product-schema.sql   # ProductApiDb -> Products
sqlcmd -S PRITI_LAPTOP -U user1 -b -i database\order-schema.sql     # OrderApiDb   -> Orders

Remove-Item Env:SQLCMDPASSWORD
```
Replace `PRITI_LAPTOP` with your server name. `localhost` also works for a default instance.

| Script | Database | Table | Notes |
|---|---|---|---|
| `auth-schema.sql` | `AuthDb` | `Users` | unique username and email, role check |
| `product-schema.sql` | `ProductApiDb` | `Products` | unique name, price and stock checks, sort indexes |
| `order-schema.sql` | `OrderApiDb` | `Orders` | snapshot columns `ProductName` and `Username`, computed `TotalPrice`, indexes for "my orders", status and product filters |

- **No cross-database foreign keys:** SQL Server can't enforce them across databases. The services check each other's data through the APIs instead (see [Cross-service data](#cross-service-data)).
- **Permissions:** whoever runs a script becomes that database's owner. Run as `user1`, `user1` owns all three. If an admin runs them instead, the script grants `user1` only `SELECT / INSERT / UPDATE / DELETE`.
- **Safe to re-run:** each object is created only if it's missing. There's no `DROP` or `TRUNCATE`.

Check that it worked:
```powershell
sqlcmd -S PRITI_LAPTOP -U user1 -Q "SELECT name FROM sys.databases WHERE name IN ('AuthDb','ProductApiDb','OrderApiDb')"
```

---

## 5. Configure the `.env` files

**One shared file for everything:** all four services (gateway, auth, product, order) read **`C:\AI_VARIOUS_APIS\.env`** in the project root. It's git-ignored.

```powershell
cd C:\AI_VARIOUS_APIS
Copy-Item .env.example .env
notepad .env
```

Set these two lines:
- `DB_PASSWORD`: user1's SQL Server password.
- `JWT_SECRET`: **at least 32 characters**. Every service refuses to start with a shorter one, because HS256 needs a 256-bit key. If the value contains spaces, wrap it in double quotes. Generate a random one with:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  ```

Leave everything else at the defaults. **Don't add `PORT`** to the shared file: each service needs a different port, and each already defaults to the right one (5000–5003).

**Per-service overrides (optional):** a service also reads its own `<service>/.env` *before* the shared file, so any value there wins for that service only. The per-service `.env.example` files list every setting a service understands. Real environment variables beat both files.

The client is separate: Vite only reads `client/.env`, which is optional because its default already points to the gateway.

If you use per-service files instead, these values must line up:

| Setting | `auth-service` | `product-service` | `order-service` | `api-gateway` |
|---|---|---|---|---|
| `DB_PASSWORD` | user1's password | same | same | not used |
| `JWT_SECRET` | the generated value | **identical** | **identical** | **identical** |
| `JWT_ISSUER` | `auth-service` | **identical** | **identical** | **identical** |
| `JWT_AUDIENCE` | `app-clients` | **identical** | **identical** | **identical** |
| `PORT` | 5001 | 5002 | 5003 | 5000 |

The gateway's `*_SERVICE_URL` settings default to `http://127.0.0.1:5001`, `:5002` and `:5003`. They use `127.0.0.1` rather than `localhost` on purpose: on Windows, `localhost` tries IPv6 first, and each failed attempt adds about 2 seconds.

Leave every other setting at its default unless your SQL Server isn't the default instance on `localhost:1433`. For a named instance, use its TCP port in `DB_PORT`.

Every service checks its settings at startup. If something is missing or invalid, it prints the setting names (never their values) and exits.

---

## 6. Run the services

Use **one terminal per service**. Stop each one with **Ctrl+C**, which shuts it down gracefully: in-flight requests finish, the connection pool closes and the logs are flushed.

**Terminal 1: Auth Service (C#)**
```powershell
cd C:\AI_VARIOUS_APIS\auth-service
dotnet run
# [.. INF] Connected to SQL Server PRITI_LAPTOP,1433, database AuthDb
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

**Terminal 4: API Gateway (C# + YARP)**
```powershell
cd C:\AI_VARIOUS_APIS\api-gateway
dotnet run
# [.. INF] API gateway listening on http://localhost:5000
# [.. INF] Routing /api/auth -> http://127.0.0.1:5001, /api/products -> ..., /api/orders -> ...
```
The gateway doesn't need the services at startup. If a service is down, requests for it get **502** `BAD_GATEWAY` naming that service.

Quick check (`curl.exe` comes with Windows):
```powershell
curl.exe http://localhost:5000/health     # gateway
curl.exe http://localhost:5001/health     # services, directly
curl.exe http://localhost:5002/health
curl.exe http://localhost:5003/health
```

Interactive API docs for everything, through the gateway: **http://localhost:5000/docs**. See [Swagger UI / OpenAPI](#swagger-ui--openapi).

Windows may show a firewall prompt the first time each service starts. All services listen on `localhost` only, so allowing **private networks** is enough.

---

## 7. Run the client

**Terminal 5**
```powershell
cd C:\AI_VARIOUS_APIS\client
npm install        # first time only
npm run dev
```

Open **http://localhost:5173**. The client sends **every** request to the gateway (`VITE_API_GATEWAY_URL`, default `http://localhost:5000`). It must run on exactly port 5173, because the gateway only accepts browser requests (CORS) from `http://localhost:5173`. Vite is configured with `strictPort`, so it fails instead of silently switching to another port.

For a production build, run `npm run build` and then `npm run preview`.

---

## 8. Create an Admin user

Everyone registers as a normal **User**. To get an **Admin**:

1. Register through the client (**Register** on the login page) or with the curl in section 9.
2. Promote the account:
   ```powershell
   sqlcmd -S PRITI_LAPTOP -U user1 -d AuthDb -Q "UPDATE dbo.Users SET Role = N'Admin' WHERE Username = N'alice'"
   ```
3. **Log out and log in again.** The role is stored inside the JWT, so a token issued before the promotion still says `User`.

**Sample data (optional):** with everything running and an Admin in place, run
```powershell
node tools\seed-sample-data.mjs
```
It creates 6 customers (`bob`, `charlie`, `diana`, `ethan`, `fiona`, `george`, password `Secret123`), 12 products and about 15 orders across all three databases. It goes through the gateway, so passwords are hashed and order snapshots are filled in exactly as in real use. It's safe to re-run: existing records are reused.

| Role | Products | Orders |
|---|---|---|
| User | read | create / read / update / delete **own** orders |
| Admin | read, create, update, delete | create / read / update / delete **all** orders |

---

## 9. Sample requests (curl)

These examples are written for **Git Bash**, which comes with Git for Windows. Windows PowerShell 5.1 mangles the JSON quotes it passes to `curl.exe`; a PowerShell version of the login request follows below. `node` is used to pull the token out of the JSON response, so `jq` isn't needed.

All requests go **through the gateway**, just like the client's:

```bash
GATEWAY=http://localhost:5000
AUTH=$GATEWAY        # /api/auth/*     -> Auth Service
PRODUCTS=$GATEWAY    # /api/products/* -> Product Service
ORDERS=$GATEWAY      # /api/orders/*   -> Order Service
json() { node -pe "JSON.parse(require('fs').readFileSync(0,'utf8'))$1"; }
```

To debug a single service and bypass the gateway, point a variable at the service directly, for example `PRODUCTS=http://localhost:5002`. The paths and responses are identical. The `/health` examples below are an exception: they hit each service directly, because the gateway's `/health` is its own.

### 9.1 Auth Service

```bash
# Health (gateway, then the Auth Service directly)
curl -s $GATEWAY/health
curl -s http://localhost:5001/health

# Register (201) - public: no token needed, even at the gateway
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
# Health (directly - the gateway only forwards /api/products*)
curl -s http://localhost:5002/health

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
# Health (directly - the gateway only forwards /api/orders*)
curl -s http://localhost:5003/health

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

# Expired, tampered or missing token (401) - rejected by the gateway before any service is called
curl -s $ORDERS/api/orders -H "Authorization: Bearer not.a.token"

# A service that is not running (502 BAD_GATEWAY, e.g. "The Order service is unavailable...")
# Stop the order service, then:
curl -s $ORDERS/api/orders -H "Authorization: Bearer $USER_TOKEN"
```

### PowerShell equivalent (login + list)

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/login `
  -ContentType 'application/json' -Body (@{ username = 'alice'; password = 'Secret123' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.data.accessToken)" }
Invoke-RestMethod -Uri 'http://localhost:5000/api/products?pageSize=5' -Headers $headers | ConvertTo-Json -Depth 5
```

Note that `Invoke-RestMethod` throws on 4xx/5xx responses. To see the JSON error body, use `curl` from Git Bash.

---

## 10. API reference

### API Gateway

The client and the curl examples call **`http://localhost:5000`**. The gateway forwards each path **unchanged** to its service:

| Path | Forwarded to | Token at the gateway |
|---|---|---|
| `POST /api/auth/login`, `POST /api/auth/register` | Auth Service | **not required** (public) |
| `/api/auth/*` (e.g. `/me`) | Auth Service | required |
| `/api/products`, `/api/products/*` | Product Service | required |
| `/api/orders`, `/api/orders/*` | Order Service | required |
| `GET /health` | answered by the gateway itself | not required |
| `GET /docs` | Swagger UI for all three APIs (see below) | not required |
| `GET /docs/specs/{auth,product,order}.yaml` | that service's `/openapi.yaml` | not required |

What the gateway adds:
- **JWT check:** a missing, invalid or expired token gets **401** right at the gateway, using the same rules and `.env` values as the services. Each service still checks the token again, and role rules (Admin-only product writes, order ownership) are enforced by the services.
- **CORS:** answered once at the gateway for `CORS_ORIGIN`. The gateway removes the browser's `Origin` header before forwarding, so the services don't add a second, conflicting set of CORS headers.
- **Gateway-specific errors**, in the same JSON shape as everything else:

| Status | Code | When |
|---|---|---|
| 502 | `BAD_GATEWAY` | The service isn't running: "The Order service is unavailable. Please try again later." |
| 504 | `GATEWAY_TIMEOUT` | The service took longer than `PROXY_TIMEOUT_SECONDS` (default 30) |
| 404 | `NOT_FOUND` | No gateway route matches the path |

- **Logging:** one line per request (method, path, upstream service, status, duration), in `api-gateway/logs/api-gateway-YYYYMMDD.log`. As in the services, tokens and headers are never logged.

### Swagger UI / OpenAPI

**Main entry point: http://localhost:5000/docs** is one Swagger UI for all three APIs, served by the gateway. Pick **Auth Service**, **Product Service** or **Order Service** in the top-right dropdown. "Try it out" requests go **through the gateway**, exactly like the web client's.

1. Select **Auth Service**, then run `POST /api/auth/login` with **Try it out**.
2. Copy `data.accessToken` from the response, click **Authorize**, and paste the token (without `Bearer `).
3. Switch to **Product Service** or **Order Service** and call any endpoint. The token is remembered across spec switches and page reloads.

How it works:
- The gateway fetches each spec from its service (`/docs/specs/auth.yaml` → `auth-service/openapi.yaml`, and so on).
- The specs use a relative server URL (`/`), so Swagger UI sends requests to whichever host served the page.
- If a service is down, its spec won't load, and the dropdown shows the gateway's 502 error.

Each service also serves its own copy of the docs, which calls that service directly. This is useful for debugging one service without the gateway:

| Service | Swagger UI | Raw spec | Spec file |
|---|---|---|---|
| Auth | http://localhost:5001/docs | http://localhost:5001/openapi.yaml | `auth-service/openapi.yaml` |
| Product | http://localhost:5002/docs | http://localhost:5002/openapi.yaml | `product-service/openapi.yaml` |
| Order | http://localhost:5003/docs | http://localhost:5003/openapi.yaml | `order-service/openapi.yaml` |

On a service's own docs page, use the same login → **Authorize** steps. That page doesn't remember the token across reloads.

**How the docs are built:**
- The specs are **hand-written** YAML files that live next to each service's code. They aren't generated from the code, because all three services validate input manually, so a generator couldn't infer the field rules or the shared response format.
- Each spec documents:
  - every field rule (lengths, ranges, patterns, enums, defaults)
  - the success and error response shapes, with examples
  - every error code an endpoint can return
- The Swagger UI files are bundled into each service: Swashbuckle.AspNetCore.SwaggerUI for C#, swagger-ui-express for Node, and utoipa-swagger-ui with the `vendored` feature for Rust. No CDN is used.
- **When you change an endpoint, update its `openapi.yaml` too.** `cargo test` in `order-service` checks all three specs: the YAML parses, every `$ref` resolves, and every implemented route is documented with an `operationId`, `summary` and `responses`.
- The spec files also work with other tools. You can import them into Postman or Insomnia, or use them to generate a client.

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
- The product's **name and price are copied onto the order** (`productName`, `unitPrice`) when it's created. Renaming or repricing the product later doesn't change existing orders. They're only copied again when an update switches the order to a **different** product.
- `username` is copied from the creator's token.
- `totalPrice` = `quantity × unitPrice`. The database calculates it (as a computed column).
- A User asking for another user's order gets **404**, not 403, so other users' order ids aren't revealed.

### Cross-service data

Each service has its own database (`AuthDb`, `ProductApiDb`, `OrderApiDb`) and never reads another's. The two places where data crosses service lines use direct service-to-service API calls, which skip the gateway. Each call forwards the original caller's bearer token, so the usual role rules apply:

| When | Who calls whom | Call | If the other service is down |
|---|---|---|---|
| Creating an order, or switching it to another product | Order → Product | `GET /api/products/{id}`: must exist (else 404 `PRODUCT_NOT_FOUND`); its name and price are copied onto the order | **503** `PRODUCT_SERVICE_UNAVAILABLE`; nothing is written |
| Deleting a product (Admin) | Product → Order | `GET /api/orders?productId={id}&pageSize=1`: if `totalItems` > 0, **409** `PRODUCT_HAS_ORDERS` | **503** `ORDER_SERVICE_UNAVAILABLE`; the product is **not** deleted |

Addresses come from `PRODUCT_SERVICE_URL` and `ORDER_SERVICE_URL` in `.env`, with a timeout of `SERVICE_CALL_TIMEOUT_MS` (default 5000).

**Trade-off:** without cross-database foreign keys, an order placed in the instant between the "has orders?" check and the delete could outlive its product. That order is still fully readable, because it carries its own name and price snapshot.

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
| Gateway | readable text | `api-gateway/logs/api-gateway-YYYYMMDD.log` |
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
cargo test     # 14 tests, no database needed:
               #  - router: JWT checks, validation, 400/401/404/405/415, Swagger UI + spec served
               #  - OpenAPI: all three services' specs parse, $refs resolve, every route documented
```

The full flow, with all services running, is covered by the curl examples in section 9.

---

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| `Login failed for user 'user1'` | Mixed-mode authentication is off (section 2), the password in `.env` is wrong, or the login is disabled: `ALTER LOGIN [user1] ENABLE`. |
| `Cannot open database "AuthDb"` (or `ProductApiDb` / `OrderApiDb`) | That service's database doesn't exist yet. Run its script from step 4. |
| `503 PRODUCT_SERVICE_UNAVAILABLE` when creating an order | The Product Service isn't running, or `PRODUCT_SERVICE_URL` is wrong. The Order Service needs it for prices. |
| `503 ORDER_SERVICE_UNAVAILABLE` when deleting a product | The Order Service isn't running, or `ORDER_SERVICE_URL` is wrong. Deletes are refused rather than done without the orders check. |
| Timeout, or `ECONNREFUSED 127.0.0.1:1433` | TCP/IP is disabled or SQL Server uses another port (section 2). For a named instance, set `DB_PORT` to its TCP port. |
| Certificate / TLS errors | Local SQL Server uses a self-signed certificate. Keep `DB_TRUST_SERVER_CERT=true`. |
| `401 Missing or invalid access token` from Product or Order, but login works | `JWT_SECRET`, `JWT_ISSUER` or `JWT_AUDIENCE` differ between the `.env` files. They must be identical. Restart the service after editing. |
| `403 FORBIDDEN` right after promoting to Admin | Log out and log in again to get a token with the new role. |
| Browser shows CORS errors | The client must be on `http://localhost:5173`, not `127.0.0.1`. Check `CORS_ORIGIN` in `api-gateway/.env`. |
| Client shows "Cannot reach the API gateway" | The gateway isn't running on port 5000, or `VITE_API_GATEWAY_URL` in `client/.env` points elsewhere. |
| `502 BAD_GATEWAY` "The X service is unavailable" | That service isn't running, or the gateway's `*_SERVICE_URL` points to the wrong port. |
| `401` at the gateway, but the token works when calling the service directly | The gateway's `JWT_SECRET`, `JWT_ISSUER` or `JWT_AUDIENCE` differ from the Auth Service's. |
| `Invalid configuration: …` at startup | The listed settings are missing or invalid in that service's `.env`. |
| `address already in use` / `EADDRINUSE` | Another process holds the port. Run `Get-NetTCPConnection -LocalPort 5002` and stop the process it shows. |
| Rust: `linker 'link.exe' not found` | Install the Visual Studio C++ Build Tools (section 1) and open a new terminal. |

---

## 14. Project structure and conventions

```
AI_VARIOUS_APIS/
├── database/         auth-schema.sql (AuthDb), product-schema.sql (ProductApiDb), order-schema.sql (OrderApiDb)
├── api-gateway/      Program.cs (pipeline) → Config/ProxyRoutes.cs (YARP routes + clusters), JWT, logging
├── auth-service/     Controllers → Services → Repositories → Data (SqlConnectionFactory); openapi.yaml
├── product-service/  routes → controllers → services → repositories → db/pool.js; openapi.yaml
├── order-service/    routes.rs → handlers → services → repositories → db.rs (bb8 pool); openapi.yaml
└── client/           pages, components, api (fetch wrapper), context (auth)
```

**Rules every service follows:**
- **Layers:** routing/controllers handle HTTP only, services hold business rules, repositories hold all SQL.
- **No ORM:** plain parameterized SQL only. Even sorting avoids string building: it uses `CASE` branches chosen by parameters.
- **One connection pool per service:** created at startup (after a connectivity check that stops the service on failure) and closed on shutdown.
  - **C#:** each repository method disposes its `SqlConnection` / `SqlCommand` / `SqlDataReader` in an explicit `finally`, which returns the connection to the ADO.NET pool. `SqlConnection.ClearAllPools()` runs on shutdown.
  - **Node:** each `mssql` request returns its connection when the query finishes, whether it succeeded or failed. `pool.close()` runs on shutdown.
  - **Rust:** `Result<T, AppError>` with `?`. The pooled connection goes back to the pool automatically when it goes out of scope, including on early error returns.
- **Errors:** SQL errors and stack traces are logged and turned into a generic 500. Unique violations become 409 with a clear message. When a service another one depends on is down, the caller gets a 503 naming it.
- **Database per service:** a service only connects to its own database and never queries another's tables. Data that crosses service lines goes through the owning service's API.

**Security notes:**
- Passwords are stored as BCrypt hashes (cost 12).
- A login with an unknown username still runs a BCrypt check, so response timing doesn't reveal which usernames exist.
- The `user1` database user can only read and write data. It can't change the schema.
- Real `.env` files are git-ignored. Only `.env.example` files with placeholders are committed.
- The client keeps the JWT in `sessionStorage`, so it's cleared when the tab closes.
