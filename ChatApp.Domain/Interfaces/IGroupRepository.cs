using ChatApp.Domain.Models;

namespace ChatApp.Domain.Interfaces;

public interface IGroupRepository
{
    Task<GroupChannel> CreateAsync(GroupChannel group);
    Task<GroupChannel?> FindByIdAsync(int groupId);
    Task<IReadOnlyList<GroupChannel>> GetUserGroupsAsync(string userId);
    Task<IReadOnlyList<int>> GetUserGroupIdsAsync(string userId);
    Task<GroupMember?> FindMemberAsync(int groupId, string userId);
    Task AddMemberAsync(GroupMember member);
    Task RemoveMemberAsync(GroupMember member);
    Task<bool> IsGroupAdminAsync(int groupId, string userId);
    Task<IReadOnlyList<ApplicationUser>> GetGroupMembersAsync(int groupId);
    Task SaveChangesAsync();
}
