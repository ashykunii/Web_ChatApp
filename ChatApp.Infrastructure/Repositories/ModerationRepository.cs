using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using ChatApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Infrastructure.Repositories;

public class ModerationRepository : IModerationRepository
{
    private readonly ChatDbContext _db;

    public ModerationRepository(ChatDbContext db) => _db = db;

    public Task<bool> IsBlockedAsync(string blockerId, string blockedUserId) =>
        _db.BlockedUsers.AnyAsync(b => b.BlockerId == blockerId && b.BlockedUserId == blockedUserId);

    public async Task<IReadOnlyList<string>> GetUsersWhoBlockedAsync(string userId) =>
        await _db.BlockedUsers
            .Where(b => b.BlockedUserId == userId)
            .Select(b => b.BlockerId)
            .ToListAsync();

    public Task<BlockedUser?> FindBlockAsync(string blockerId, string blockedUserId) =>
        _db.BlockedUsers.FirstOrDefaultAsync(b => b.BlockerId == blockerId && b.BlockedUserId == blockedUserId);

    public async Task AddBlockAsync(BlockedUser block)
    {
        _db.BlockedUsers.Add(block);
        await _db.SaveChangesAsync();
    }

    public async Task RemoveBlockAsync(BlockedUser block)
    {
        _db.BlockedUsers.Remove(block);
        await _db.SaveChangesAsync();
    }

    public Task<bool> IsBannedAsync(string userId) =>
        _db.Users.AnyAsync(u => u.Id == userId && u.IsBanned);

    public async Task AddBanAsync(UserBan ban)
    {
        _db.UserBans.Add(ban);
        await _db.SaveChangesAsync();
    }

    public Task<UserBan?> GetActiveBanAsync(string userId) =>
        _db.UserBans
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.IssuedAtUtc)
            .FirstOrDefaultAsync();

    public async Task<IReadOnlyList<UserBan>> GetBanHistoryAsync(string userId) =>
        await _db.UserBans
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.IssuedAtUtc)
            .ToListAsync();

    public async Task RemoveBanAsync(UserBan ban)
    {
        _db.UserBans.Remove(ban);
        await _db.SaveChangesAsync();
    }

    public Task SaveChangesAsync() => _db.SaveChangesAsync();
}
