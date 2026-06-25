using System.Security.Claims;
using ChatApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/contacts")]
public class ContactsController : ControllerBase
{
    private readonly IContactService _contacts;
    private readonly IModerationService _moderation;

    public ContactsController(IContactService contacts, IModerationService moderation)
    {
        _contacts = contacts;
        _moderation = moderation;
    }

    private string MyId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    [HttpGet]
    public async Task<IActionResult> GetContacts() =>
        Ok(await _contacts.GetContactsAsync(MyId));

    [HttpPost("{userId}")]
    public async Task<IActionResult> AddContact(string userId)
    {
        await _contacts.AddContactAsync(MyId, userId);
        return Ok(new { message = "Contact added." });
    }

    [HttpDelete("{userId}")]
    public async Task<IActionResult> RemoveContact(string userId)
    {
        await _contacts.RemoveContactAsync(MyId, userId);
        return Ok(new { message = "Contact removed." });
    }

    [HttpPost("block/{userId}")]
    public async Task<IActionResult> BlockUser(string userId)
    {
        await _moderation.BlockUserAsync(MyId, userId);
        return Ok(new { message = "User blocked." });
    }

    [HttpDelete("block/{userId}")]
    public async Task<IActionResult> UnblockUser(string userId)
    {
        await _moderation.UnblockUserAsync(MyId, userId);
        return Ok(new { message = "User unblocked." });
    }

    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return BadRequest(new { error = "Query too short." });

        var results = await _contacts.SearchUsersAsync(q, MyId);
        return Ok(results);
    }
}
