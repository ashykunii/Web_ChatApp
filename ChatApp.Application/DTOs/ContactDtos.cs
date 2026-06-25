namespace ChatApp.Application.DTOs;

public record ContactDto(
    string UserId,
    string DisplayName,
    string UserName,
    string PresenceStatus,
    DateTime LastSeenUtc,
    string? AvatarUrl = null);

public record UserSearchResult(string UserId, string DisplayName, string UserName, bool IsContact, bool IsBlocked, string? AvatarUrl = null);
