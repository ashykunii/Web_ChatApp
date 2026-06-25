namespace ChatApp.Application.DTOs;

public record CreateGroupRequest(string Name, List<string> InitialMemberIds);

public record GroupDto(int Id, string Name, string CreatedById, DateTime CreatedAtUtc, int MemberCount);

public record GroupMemberDto(string UserId, string DisplayName, bool IsAdmin, DateTime JoinedAtUtc);

public record AddMemberRequest(string UserId);
