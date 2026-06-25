using ChatApp.Application.Interfaces;
using ChatApp.Domain.Enums;
using ChatApp.Domain.Interfaces;

namespace ChatApp.Application.Services;

public class PresenceService : IPresenceService
{
    private readonly IUserRepository _users;

    public PresenceService(IUserRepository users) => _users = users;

    public async Task SetStatusAsync(string userId, PresenceStatus status)
    {
        var user = await _users.FindByIdAsync(userId);
        if (user == null) return;

        user.PresenceStatus = status;
        if (status == PresenceStatus.Offline)
            user.LastSeenUtc = DateTime.UtcNow;

        await _users.UpdateAsync(user);
        await _users.SaveChangesAsync();
    }

    public async Task<PresenceStatus> GetStatusAsync(string userId)
    {
        var user = await _users.FindByIdAsync(userId);
        return user?.PresenceStatus ?? PresenceStatus.Offline;
    }
}
