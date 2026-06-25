using ChatApp.Application.DTOs;

namespace ChatApp.Application.Interfaces;

public interface IMessageService
{
    Task<MessageDto> SaveAndCreatePrivateMessageAsync(
        string senderId, string recipientId, string content, string? attachmentUrl = null, string? attachmentFileName = null, string? attachmentType = null);
    Task<MessageDto> SaveAndCreateGroupMessageAsync(
        string senderId, int groupId, string content, string? attachmentUrl = null, string? attachmentFileName = null, string? attachmentType = null);
    Task<IReadOnlyList<MessageDto>> SaveAndCreateBulkMessagesAsync(
        string senderId, IEnumerable<string> recipientIds, string content);
    Task<PagedMessages> GetPrivateHistoryAsync(
        string myId, string otherUserId, long? cursor, int take);
    Task<PagedMessages> GetGroupHistoryAsync(
        int groupId, long? cursor, int take);
    Task<IReadOnlyList<int>> GetUserGroupIdsAsync(string userId);
    Task<bool> DeleteMessageAsync(long messageId, string userId);
    Task<bool> UpdateMessageAsync(long messageId, string userId, string newContent);
}
