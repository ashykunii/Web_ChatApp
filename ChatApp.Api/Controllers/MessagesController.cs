using System.Security.Claims;
using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/messages")]
public class MessagesController : ControllerBase
{
    private readonly IMessageService _messages;
    private readonly IModerationService _moderation;
    private readonly IWebHostEnvironment _env;

    public MessagesController(IMessageService messages, IModerationService moderation, IWebHostEnvironment env)
    {
        _messages = messages;
        _moderation = moderation;
        _env = env;
    }

    private string MyId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    [HttpGet("private/{otherUserId}")]
    public async Task<IActionResult> GetPrivateHistory(
        string otherUserId,
        [FromQuery] long? cursor,
        [FromQuery] int take = 30)
    {
        var result = await _messages.GetPrivateHistoryAsync(MyId, otherUserId, cursor, take);
        return Ok(result);
    }

    [HttpGet("group/{groupId:int}")]
    public async Task<IActionResult> GetGroupHistory(
        int groupId,
        [FromQuery] long? cursor,
        [FromQuery] int take = 30)
    {
        var result = await _messages.GetGroupHistoryAsync(groupId, cursor, take);
        return Ok(result);
    }

    // REST fallback send (for testing / non-realtime clients)
    [HttpPost("private")]
    public async Task<IActionResult> SendPrivate([FromBody] SendPrivateMessageRequest req)
    {
        if (await _moderation.IsBlockedAsync(req.RecipientId, MyId))
            return BadRequest(new { error = "Cannot send to this user." });

        var dto = await _messages.SaveAndCreatePrivateMessageAsync(MyId, req.RecipientId, req.Content);
        return Ok(dto);
    }

    [HttpPost("upload")]
    public async Task<IActionResult> Upload(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file uploaded" });

        if (file.Length > 10 * 1024 * 1024)
            return BadRequest(new { error = "File size exceeds 10MB limit" });

        var uploadsDir = Path.Combine(_env.WebRootPath, "uploads");
        if (!Directory.Exists(uploadsDir))
        {
            Directory.CreateDirectory(uploadsDir);
        }

        var fileName = $"{Guid.NewGuid()}{Path.GetExtension(file.FileName)}";
        var filePath = Path.Combine(uploadsDir, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var isImage = file.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase);

        return Ok(new
        {
            url = $"/uploads/{fileName}",
            fileName = file.FileName,
            attachmentType = isImage ? "image" : "file"
        });
    }

    [HttpDelete("{messageId:long}")]
    public async Task<IActionResult> Delete(long messageId)
    {
        var ok = await _messages.DeleteMessageAsync(messageId, MyId);
        if (!ok) return BadRequest(new { error = "Could not delete message or not authorized." });
        return NoContent();
    }

    [HttpPut("{messageId:long}")]
    public async Task<IActionResult> Update(long messageId, [FromBody] UpdateMessageRequest req)
    {
        var ok = await _messages.UpdateMessageAsync(messageId, MyId, req.Content);
        if (!ok) return BadRequest(new { error = "Could not edit message or not authorized." });
        return NoContent();
    }
}
