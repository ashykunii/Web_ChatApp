## Tech Stack — ChatApp

**Architecture:** Clean/onion architecture, 4 projects — `ChatApp.Domain` (entities, enums, repository interfaces) → `ChatApp.Application` (services, DTOs, business logic) → `ChatApp.Infrastructure` (EF Core repositories, Identity) → `ChatApp.Api` (hosting, controllers, hub, static frontend).

**Backend**
- **.NET 10 / ASP.NET Core** — Web API host (`Microsoft.NET.Sdk.Web`)
- **Entity Framework Core 10 + SQLite** — persistence (`chat.db`), via `Microsoft.EntityFrameworkCore.Sqlite`
- **ASP.NET Core Identity** — user accounts, roles (`Admin`/`User`), stored via `Microsoft.AspNetCore.Identity.EntityFrameworkCore`
- **JWT Bearer auth** (`Microsoft.AspNetCore.Authentication.JwtBearer`) — issues/validates tokens for both REST and the SignalR hub
- **Swashbuckle/Swagger** — API docs with a Bearer auth scheme wired in

**Frontend**
- Vanilla **HTML/CSS/JS** (no framework/bundler) served straight out of `wwwroot` via `UseStaticFiles`/`UseDefaultFiles`
- **@microsoft/signalr 8.0.7** client, loaded from CDN (`cdnjs`)

---

# Technology Stack

## ASP.NET Core Web API (.NET 8.0)

**Framework:** Built using ASP.NET Core Web API targeting **.NET 8.0**, which provides the HTTP server, dependency injection container, middleware pipeline, authentication, routing, and controller infrastructure.

**Project:** `ChatApp.Api`

**Startup:** Configured entirely in `Program.cs`, where services are registered and the middleware pipeline is constructed.

```csharp
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
```

**Responsibilities:**

* Hosts all REST API endpoints.
* Performs user authentication and authorization.
* Handles profile management.
* Manages contacts and friendships.
* Creates and manages chat groups.
* Coordinates database operations through Entity Framework Core.
* Serves as the entry point for SignalR connections.

---

## Entity Framework Core 8.0

**Package:** `Microsoft.EntityFrameworkCore` together with the SQLite provider `Microsoft.EntityFrameworkCore.Sqlite`.

**DbContext:** `ChatApp.Infrastructure/Data/ChatDbContext.cs`

**Configuration:**

```csharp
builder.Services.AddDbContext<ChatDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));
```

**Database Context**

The `ChatDbContext` acts as the application's unit of work and exposes entity collections through `DbSet<T>` properties.

Example:

```csharp
public DbSet<User> Users => Set<User>();
public DbSet<Message> Messages => Set<Message>();
public DbSet<Group> Groups => Set<Group>();
```

**Responsibilities**

* Maps C# entity classes to relational database tables.
* Executes CRUD operations using LINQ.
* Tracks entity state changes.
* Generates SQL automatically.
* Applies schema migrations.
* Maintains relationships between users, contacts, groups, and messages.

---

## SQLite Database

**Provider:** SQLite

**Database File:**

```
ChatApp.Api/chat.db
```

**Connection String**

```json
{
  "ConnectionStrings": {
    "Default": "Data Source=chat.db"
  }
}
```

SQLite stores the application's persistent data inside a single database file, eliminating the need for a separate database server.

**Stored Data**

* User accounts
* Password hashes
* User profiles
* Contacts
* Private messages
* Group information
* Group memberships
* Message history
* Presence metadata

SQLite was selected because it is lightweight, portable, requires zero configuration, and is well suited for development, demonstrations, and small-scale deployments.

---

## JWT Bearer Authentication

**Package:** `Microsoft.AspNetCore.Authentication.JwtBearer`

**Configuration:** `Program.cs`

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // JWT validation parameters
    });
```

After a successful login, the server generates a signed JSON Web Token (JWT).

Clients include this token with every API request:

```
Authorization: Bearer <token>
```

For SignalR, the token is supplied through the `access_token` query parameter during connection negotiation.

**Responsibilities**

* Authenticates users.
* Protects API endpoints.
* Secures SignalR hub connections.
* Enables stateless authentication.
* Stores user identity inside claims for authorization throughout the application.

---

## HTML5

HTML5 provides the semantic structure of the client application.

**Responsibilities**

* Login and registration forms.
* Chat layout.
* Navigation.
* Contact list.
* Group management interface.
* Message panels.
* Profile pages.

HTML acts purely as the presentation structure, while all dynamic behaviour is handled by JavaScript.

---

## CSS3

The frontend styling is implemented entirely using **Vanilla CSS**, without external UI frameworks.

**Responsibilities**

* Responsive layouts.
* Flexbox-based chat interface.
* Theme colours.
* Typography.
* Animations.
* Message bubbles.
* Presence indicators.
* Modal dialogs.
* Mobile responsiveness.

Keeping the styling framework-free reduces bundle size and provides complete control over the application's appearance.

---

## JavaScript (ES6+)

The frontend logic is written using modern JavaScript without frontend frameworks such as React, Angular, or Vue.

**Main Script:** `wwwroot/js/app.js`

**Responsibilities**

* Maintains client-side application state.
* Performs Fetch API requests.
* Stores JWT authentication tokens.
* Establishes SignalR connections.
* Updates the DOM dynamically.
* Handles user interactions.
* Processes incoming real-time events.
* Synchronizes messages and presence information.

Example SignalR connection:

```javascript
state.connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, {
        accessTokenFactory: () => state.token
    })
    .withAutomaticReconnect()
    .build();
```

Because the application uses Vanilla JavaScript, all rendering is performed manually through DOM manipulation instead of a virtual DOM or component framework.

---

## OpenAPI / Swagger UI

**Package:** `Swashbuckle.AspNetCore`

**Configuration**

```csharp
builder.Services.AddSwaggerGen();

app.UseSwagger();
app.UseSwaggerUI();
```

Swagger automatically generates interactive API documentation by inspecting controller routes and model definitions.

**Capabilities**

* Lists all available REST endpoints.
* Displays request and response schemas.
* Documents HTTP status codes.
* Allows authenticated API testing.
* Eliminates the need for external API clients during development.

The Swagger UI serves as both documentation and a testing environment, simplifying backend development and API verification.

---

## SignalR in depth

**Package:** SignalR server is *not* a separate NuGet package here — it comes free as part of the `Microsoft.AspNetCore.App` shared framework (referenced in `ChatApp.Infrastructure.csproj`). The client is the standalone `microsoft-signalr` JS package (v8.0.7) pulled from CDN.

**Hub:** `ChatApp.Api/Hubs/ChatHub.cs`, mapped at `/hubs/chat`:
```csharp
app.MapHub<ChatHub>("/hubs/chat").RequireCors("ClientApp");
```

**Server config** (`Program.cs`):
```csharp
builder.Services.AddSignalR(options =>
{
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(15);
    options.KeepAliveInterval = TimeSpan.FromSeconds(7);
    options.EnableDetailedErrors = builder.Environment.IsDevelopment();
});
builder.Services.AddSingleton<IUserIdProvider, NameUserIdProvider>();
```
- Aggressive 7s keep-alive / 15s timeout — good for near-real-time presence detection, at the cost of a bit more chatter.
- A custom `IUserIdProvider` (`NameUserIdProvider`) maps each connection to the JWT's `ClaimTypes.NameIdentifier` claim, which is what enables `Clients.User(userId)` targeting.

**Auth over WebSockets:** Browsers can't set an `Authorization` header on a WS handshake, so the JWT is passed as a query string param during negotiation and pulled into the auth pipeline manually:
```csharp
options.Events = new JwtBearerEvents
{
    OnMessageReceived = context =>
    {
        var token = context.Request.Query["access_token"];
        if (!string.IsNullOrEmpty(token) &&
            context.HttpContext.Request.Path.StartsWithSegments("/hubs/chat"))
        {
            context.Token = token;
        }
        return Task.CompletedTask;
    }
};
```
The hub class itself is `[Authorize]`-protected, so an invalid/missing token rejects the connection outright.

**Connection lifecycle & fan-out patterns used:**
- `_userConnections`: a `static ConcurrentDictionary<string, HashSet<string>>` mapping `userId → connectionIds`, handling multi-tab/multi-device sessions manually (SignalR's `Clients.User` already does this via the `IUserIdProvider`, but this dictionary is also used to detect "first connection = just came online" / "last connection dropped = now offline" transitions, and to force-disconnect banned users from `AdminController`).
- **Groups** — used for group chats. On `OnConnectedAsync`, a connection is auto-joined into a SignalR group per chat-group (`group-{id}`) so `Clients.Group(...)` fans a message out to every member's active connections.
- **Clients.User(userId)** — used for private messages and presence-aware messaging (echoes the message back to the sender's own other tabs and pushes to the recipient in one call each).
- **Clients.All / Clients.AllExcept(...)** — used for global-ish events (message edited/deleted/seen broadcasts, presence changes excluding users who've blocked the actor).

**Hub methods (client → server, invoked via `connection.invoke(...)`):**
| Method | Purpose |
|---|---|
| `SendPrivateMessage` | 1:1 message, includes optional attachment metadata |
| `SendGroupMessage` | group message |
| `SendBulkMessage` | fan-out a message as separate private threads to many recipients |
| `DeleteMessage` / `EditMessage` | mutate + broadcast the change |
| `MarkSeen` | read-receipt — flips `IsReadAt` server-side, then broadcasts `MessageSeen` |
| `SetPresence` | user-driven presence status (Online/Away/etc — server alone controls `Offline`) |
| `JoinGroupChannel` / `LeaveGroupChannel` | manual group membership sync when REST endpoints create/modify groups mid-session |
| `SendTyping` | notifies target user that the current user is typing (real-time chat presence context) |
| `ClearPrivateHistory` | wipes all private messages in the active thread and sends sync requests to the counter-party |
| `ClearGroupHistory` | purges all messages inside the group for all participants and broadcasts the clear event |

**Server → client events (`connection.on(...)`):** `ReceiveMessage`, `MessageDeleted`, `MessageEdited`, `MessageSeen`, `PresenceChanged`, `BulkMessageSent`, `UserTyping` (active typing indicator animation), `HistoryCleared` (forces UI refresh and thread clearing).

**Client setup** (`app.js`):
```javascript
state.connection = new signalR.HubConnectionBuilder()
    .withUrl(HUB_URL, { accessTokenFactory: () => state.token })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build();
```
`accessTokenFactory` re-reads the JWT from `state.token` on every (re)connect attempt, and `withAutomaticReconnect()` gives it default exponential-backoff retry behavior if the socket drops.

**Transport:** SignalR auto-negotiates the best available transport (WebSockets → falls back to Server-Sent Events → long polling), so it works even behind proxies that block raw WebSocket upgrades.