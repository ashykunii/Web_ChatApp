using ChatApp.Domain.Enums;

namespace ChatApp.Application.Interfaces;

public interface IPresenceService
{
    Task SetStatusAsync(string userId, PresenceStatus status);
    Task<PresenceStatus> GetStatusAsync(string userId);
}
