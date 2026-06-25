using System.Security.Claims;
using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ChatApp.Api.Controllers;

[Authorize]
[ApiController]
[Route("api/groups")]
public class GroupsController : ControllerBase
{
    private readonly IGroupRepository _groups;
    private readonly IMessageService _msgService; // for getting group ids

    public GroupsController(IGroupRepository groups, IMessageService msgService)
    {
        _groups = groups;
        _msgService = msgService;
    }

    private string MyId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;

    [HttpGet]
    public async Task<IActionResult> MyGroups()
    {
        var groups = await _groups.GetUserGroupsAsync(MyId);
        return Ok(groups.Select(g => new GroupDto(
            g.Id, g.Name, g.CreatedById, g.CreatedAtUtc, g.Members.Count)));
    }

    [HttpPost]
    public async Task<IActionResult> CreateGroup([FromBody] CreateGroupRequest req)
    {
        var group = new GroupChannel
        {
            Name = req.Name,
            CreatedById = MyId,
            CreatedAtUtc = DateTime.UtcNow
        };

        var created = await _groups.CreateAsync(group);

        // Add creator as admin
        await _groups.AddMemberAsync(new GroupMember
        {
            GroupId = created.Id,
            UserId = MyId,
            JoinedAtUtc = DateTime.UtcNow,
            IsAdminOfGroup = true
        });

        // Add other initial members
        foreach (var userId in req.InitialMemberIds.Distinct().Where(id => id != MyId))
        {
            await _groups.AddMemberAsync(new GroupMember
            {
                GroupId = created.Id,
                UserId = userId,
                JoinedAtUtc = DateTime.UtcNow,
                IsAdminOfGroup = false
            });
        }

        return Created($"/api/groups/{created.Id}",
            new GroupDto(created.Id, created.Name, created.CreatedById, created.CreatedAtUtc, req.InitialMemberIds.Count + 1));
    }

    [HttpGet("{groupId:int}")]
    public async Task<IActionResult> GetGroup(int groupId)
    {
        var group = await _groups.FindByIdAsync(groupId);
        if (group == null) return NotFound();

        var isMember = await _groups.FindMemberAsync(groupId, MyId) != null;
        if (!isMember) return Forbid();

        return Ok(new
        {
            group.Id,
            group.Name,
            group.CreatedById,
            group.CreatedAtUtc,
            Members = group.Members.Select(m => new GroupMemberDto(
                m.UserId, m.User.DisplayName, m.IsAdminOfGroup, m.JoinedAtUtc))
        });
    }

    [HttpPost("{groupId:int}/members")]
    public async Task<IActionResult> AddMember(int groupId, [FromBody] AddMemberRequest req)
    {
        if (!await _groups.IsGroupAdminAsync(groupId, MyId))
            return Forbid();

        if (await _groups.FindMemberAsync(groupId, req.UserId) != null)
            return BadRequest(new { error = "User is already a member." });

        await _groups.AddMemberAsync(new GroupMember
        {
            GroupId = groupId,
            UserId = req.UserId,
            JoinedAtUtc = DateTime.UtcNow
        });

        return Ok(new { message = "Member added." });
    }

    [HttpDelete("{groupId:int}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(int groupId, string userId)
    {
        var isAdmin = await _groups.IsGroupAdminAsync(groupId, MyId);
        var isSelf = userId == MyId;

        if (!isAdmin && !isSelf) return Forbid();

        var member = await _groups.FindMemberAsync(groupId, userId);
        if (member == null) return NotFound();

        await _groups.RemoveMemberAsync(member);
        return Ok(new { message = "Removed from group." });
    }
}
