using ChatApp.Application.DTOs;
using ChatApp.Domain.Models;

namespace ChatApp.Application.Interfaces;

public interface IModerationService
{
    Task<bool> IsBannedAsync(string userId);
    Task<bool> IsBlockedAsync(string blockerId, string targetUserId);
    Task<IReadOnlyList<string>> GetUsersWhoBlockedAsync(string userId);
    Task BlockUserAsync(string blockerId, string targetUserId);
    Task UnblockUserAsync(string blockerId, string targetUserId);
    Task BanUserAsync(string adminId, string targetUserId, BanRequest request);
    Task UnbanUserAsync(string adminId, string targetUserId);
}
