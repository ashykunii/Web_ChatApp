using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;

namespace ChatApp.Application.Services;

public class ModerationService : IModerationService
{
    private readonly IModerationRepository _repo;
    private readonly IUserRepository _users;

    public ModerationService(IModerationRepository repo, IUserRepository users)
    {
        _repo = repo;
        _users = users;
    }

    public async Task<bool> IsBannedAsync(string userId)
    {
        var user = await _users.FindByIdAsync(userId);
        if (user == null) return false;

        if (!user.IsBanned) return false;

        // check if ban has expired
        var ban = await _repo.GetActiveBanAsync(userId);
        if (ban == null) return false;

        if (ban.ExpiresAtUtc.HasValue && ban.ExpiresAtUtc.Value < DateTime.UtcNow)
        {
            // expired — auto-lift
            user.IsBanned = false;
            user.BanReason = null;
            await _users.UpdateAsync(user);
            await _repo.RemoveBanAsync(ban);
            await _users.SaveChangesAsync();
            return false;
        }

        return true;
    }

    public Task<bool> IsBlockedAsync(string blockerId, string targetUserId) =>
        _repo.IsBlockedAsync(blockerId, targetUserId);

    public Task<IReadOnlyList<string>> GetUsersWhoBlockedAsync(string userId) =>
        _repo.GetUsersWhoBlockedAsync(userId);

    public async Task BlockUserAsync(string blockerId, string targetUserId)
    {
        if (await _repo.IsBlockedAsync(blockerId, targetUserId)) return;

        await _repo.AddBlockAsync(new BlockedUser
        {
            BlockerId = blockerId,
            BlockedUserId = targetUserId,
            BlockedAtUtc = DateTime.UtcNow
        });
        await _repo.SaveChangesAsync();
    }

    public async Task UnblockUserAsync(string blockerId, string targetUserId)
    {
        var block = await _repo.FindBlockAsync(blockerId, targetUserId);
        if (block == null) return;

        await _repo.RemoveBlockAsync(block);
        await _repo.SaveChangesAsync();
    }

    public async Task BanUserAsync(string adminId, string targetUserId, BanRequest request)
    {
        var user = await _users.FindByIdAsync(targetUserId)
            ?? throw new InvalidOperationException("User not found.");

        user.IsBanned = true;
        user.BanReason = request.Reason;

        var ban = new UserBan
        {
            UserId = targetUserId,
            IssuedByAdminId = adminId,
            Reason = request.Reason,
            IssuedAtUtc = DateTime.UtcNow,
            ExpiresAtUtc = request.ExpiresAtUtc
        };

        await _repo.AddBanAsync(ban);
        await _users.UpdateAsync(user);
        await _repo.SaveChangesAsync();
        await _users.SaveChangesAsync();
    }

    public async Task UnbanUserAsync(string adminId, string targetUserId)
    {
        var user = await _users.FindByIdAsync(targetUserId)
            ?? throw new InvalidOperationException("User not found.");

        user.IsBanned = false;
        user.BanReason = null;

        var ban = await _repo.GetActiveBanAsync(targetUserId);
        if (ban != null)
            await _repo.RemoveBanAsync(ban);

        await _users.UpdateAsync(user);
        await _repo.SaveChangesAsync();
    }
}
