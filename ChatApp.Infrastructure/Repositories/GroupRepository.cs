using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using ChatApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Infrastructure.Repositories;

public class GroupRepository : IGroupRepository
{
    private readonly ChatDbContext _db;

    public GroupRepository(ChatDbContext db) => _db = db;

    public async Task<GroupChannel> CreateAsync(GroupChannel group)
    {
        _db.GroupChannels.Add(group);
        await _db.SaveChangesAsync();
        return group;
    }

    public Task<GroupChannel?> FindByIdAsync(int groupId) =>
        _db.GroupChannels
            .Include(g => g.Members)
            .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Id == groupId);

    public async Task<IReadOnlyList<GroupChannel>> GetUserGroupsAsync(string userId) =>
        await _db.GroupMembers
            .Where(gm => gm.UserId == userId)
            .Include(gm => gm.Group)
            .ThenInclude(g => g.Members)
            .Select(gm => gm.Group)
            .ToListAsync();

    public async Task<IReadOnlyList<int>> GetUserGroupIdsAsync(string userId) =>
        await _db.GroupMembers
            .Where(gm => gm.UserId == userId)
            .Select(gm => gm.GroupId)
            .ToListAsync();

    public Task<GroupMember?> FindMemberAsync(int groupId, string userId) =>
        _db.GroupMembers.FirstOrDefaultAsync(gm => gm.GroupId == groupId && gm.UserId == userId);

    public async Task AddMemberAsync(GroupMember member)
    {
        _db.GroupMembers.Add(member);
        await _db.SaveChangesAsync();
    }

    public async Task RemoveMemberAsync(GroupMember member)
    {
        _db.GroupMembers.Remove(member);
        await _db.SaveChangesAsync();
    }

    public async Task<bool> IsGroupAdminAsync(int groupId, string userId)
    {
        var member = await FindMemberAsync(groupId, userId);
        return member?.IsAdminOfGroup ?? false;
    }

    public async Task<IReadOnlyList<ApplicationUser>> GetGroupMembersAsync(int groupId) =>
        await _db.GroupMembers
            .Where(gm => gm.GroupId == groupId)
            .Include(gm => gm.User)
            .Select(gm => gm.User)
            .ToListAsync();

    public Task SaveChangesAsync() => _db.SaveChangesAsync();
}
