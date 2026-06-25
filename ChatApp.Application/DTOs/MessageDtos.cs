namespace ChatApp.Application.DTOs;

public record MessageDto(
    long Id,
    string SenderId,
    string SenderDisplayName,
    string? RecipientId,
    int? GroupId,
    string Content,
    DateTime SentAtUtc,
    bool IsDeleted,
    string? AttachmentUrl = null,
    string? AttachmentFileName = null,
    string? AttachmentType = null,
    string? SenderAvatarUrl = null);

public record SendPrivateMessageRequest(string RecipientId, string Content);

public record SendGroupMessageRequest(int GroupId, string Content);

public record SendBulkMessageRequest(List<string> RecipientIds, string Content);

public record PagedMessages(IReadOnlyList<MessageDto> Items, long? NextCursor);

public record UpdateMessageRequest(string Content);
