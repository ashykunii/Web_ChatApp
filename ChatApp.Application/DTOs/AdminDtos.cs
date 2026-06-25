namespace ChatApp.Application.DTOs;

public record BanRequest(string Reason, DateTime? ExpiresAtUtc);

public record AdminUserDto(
    string UserId,
    string UserName,
    string DisplayName,
    bool IsBanned,
    string? BanReason,
    string PresenceStatus,
    DateTime LastSeenUtc,
    bool IsAdmin,
    string? AvatarUrl = null);
