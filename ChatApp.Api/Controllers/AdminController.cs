using System.Security.Claims;
using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using ChatApp.Api.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace ChatApp.Api.Controllers;

[Authorize(Policy = "AdminOnly")]
[ApiController]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly IModerationService _moderation;
    private readonly IHubContext<ChatHub> _hubContext;

    public AdminController(
        IAdminService adminService,
        IModerationService moderation,
        IHubContext<ChatHub> hubContext)
    {
        _adminService = adminService;
        _moderation = moderation;
        _hubContext = hubContext;
    }

    private string MyId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers() =>
        Ok(await _adminService.GetAllUsersAsync());

    [HttpPost("ban/{userId}")]
    public async Task<IActionResult> BanUser(string userId, [FromBody] BanRequest req)
    {
        await _moderation.BanUserAsync(MyId, userId, req);

        // Force-disconnect any live connections for this user
        var connectionIds = ChatHub.GetConnectionIds(userId);
        foreach (var connId in connectionIds)
        {
            await _hubContext.Clients.Client(connId)
                .SendAsync("ForceDisconnect", req.Reason);
        }

        return Ok(new { message = "User banned and disconnected." });
    }

    [HttpPost("unban/{userId}")]
    public async Task<IActionResult> UnbanUser(string userId)
    {
        await _moderation.UnbanUserAsync(MyId, userId);
        return Ok(new { message = "User unbanned." });
    }
}
