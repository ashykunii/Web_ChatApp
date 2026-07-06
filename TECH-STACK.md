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