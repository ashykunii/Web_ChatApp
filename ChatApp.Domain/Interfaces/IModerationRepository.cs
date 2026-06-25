using ChatApp.Domain.Models;

namespace ChatApp.Domain.Interfaces;

public interface IModerationRepository
{
    Task<bool> IsBlockedAsync(string blockerId, string blockedUserId);
    Task<IReadOnlyList<string>> GetUsersWhoBlockedAsync(string userId);
    Task<BlockedUser?> FindBlockAsync(string blockerId, string blockedUserId);
    Task AddBlockAsync(BlockedUser block);
    Task RemoveBlockAsync(BlockedUser block);
    Task<bool> IsBannedAsync(string userId);
    Task AddBanAsync(UserBan ban);
    Task<UserBan?> GetActiveBanAsync(string userId);
    Task<IReadOnlyList<UserBan>> GetBanHistoryAsync(string userId);
    Task RemoveBanAsync(UserBan ban);
    Task SaveChangesAsync();
}
