using System.Security.Claims;
using ChatApp.Application.Interfaces;

namespace ChatApp.Api.Middleware;

public class BanEnforcementMiddleware
{
    private readonly RequestDelegate _next;

    public BanEnforcementMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, IModerationService moderation)
    {
        if (context.User?.Identity?.IsAuthenticated == true)
        {
            var userId = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId != null && await moderation.IsBannedAsync(userId))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { error = "Account banned." });
                return;
            }
        }
        await _next(context);
    }
}
