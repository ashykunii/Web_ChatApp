using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using ChatApp.Domain.Models;
using ChatApp.Domain.Enums;
using ChatApp.Domain.Interfaces;

namespace ChatApp.Application.Services;

public class MessageService : IMessageService
{
    private readonly IMessageRepository _messages;
    private readonly IUserRepository _users;
    private readonly IGroupRepository _groups;

    public MessageService(
        IMessageRepository messages,
        IUserRepository users,
        IGroupRepository groups)
    {
        _messages = messages;
        _users = users;
        _groups = groups;
    }

    public async Task<MessageDto> SaveAndCreatePrivateMessageAsync(
        string senderId, string recipientId, string content, string? attachmentUrl = null, string? attachmentFileName = null, string? attachmentType = null)
    {
        if ((string.IsNullOrWhiteSpace(content) && string.IsNullOrEmpty(attachmentUrl)) || (content != null && content.Length > 4000))
            throw new InvalidOperationException("Message content is invalid.");

        var sender = await _users.FindByIdAsync(senderId)
            ?? throw new InvalidOperationException("Sender not found.");

        var message = new Message
        {
            SenderId = senderId,
            RecipientId = recipientId,
            Content = content?.Trim() ?? string.Empty,
            Type = MessageType.Private,
            SentAtUtc = DateTime.UtcNow,  // always server-side
            AttachmentUrl = attachmentUrl,
            AttachmentFileName = attachmentFileName,
            AttachmentType = attachmentType
        };

        var saved = await _messages.AddAsync(message);
        return ToDto(saved, sender.DisplayName, sender.AvatarUrl);
    }

    public async Task<MessageDto> SaveAndCreateGroupMessageAsync(
        string senderId, int groupId, string content, string? attachmentUrl = null, string? attachmentFileName = null, string? attachmentType = null)
    {
        if ((string.IsNullOrWhiteSpace(content) && string.IsNullOrEmpty(attachmentUrl)) || (content != null && content.Length > 4000))
            throw new InvalidOperationException("Message content is invalid.");

        var sender = await _users.FindByIdAsync(senderId)
            ?? throw new InvalidOperationException("Sender not found.");

        var member = await _groups.FindMemberAsync(groupId, senderId)
            ?? throw new InvalidOperationException("You are not a member of this group.");

        var message = new Message
        {
            SenderId = senderId,
            GroupId = groupId,
            Content = content?.Trim() ?? string.Empty,
            Type = MessageType.Group,
            SentAtUtc = DateTime.UtcNow,
            AttachmentUrl = attachmentUrl,
            AttachmentFileName = attachmentFileName,
            AttachmentType = attachmentType
        };

        var saved = await _messages.AddAsync(message);
        return ToDto(saved, sender.DisplayName, sender.AvatarUrl);
    }

    public async Task<IReadOnlyList<MessageDto>> SaveAndCreateBulkMessagesAsync(
        string senderId, IEnumerable<string> recipientIds, string content)
    {
        if (string.IsNullOrWhiteSpace(content) || content.Length > 4000)
            throw new InvalidOperationException("Message content is invalid.");

        var sender = await _users.FindByIdAsync(senderId)
            ?? throw new InvalidOperationException("Sender not found.");

        var now = DateTime.UtcNow;
        var messages = recipientIds
            .Distinct()
            .Select(rid => new Message
            {
                SenderId = senderId,
                RecipientId = rid,
                Content = content.Trim(),
                Type = MessageType.Private,
                SentAtUtc = now
            })
            .ToList();

        var saved = await _messages.AddRangeAsync(messages);
        return saved.Select(m => ToDto(m, sender.DisplayName, sender.AvatarUrl)).ToList();
    }

    public async Task<PagedMessages> GetPrivateHistoryAsync(
        string myId, string otherUserId, long? cursor, int take)
    {
        take = Math.Clamp(take, 1, 100);
        var users = new Dictionary<string, string>();

        var msgs = await _messages.GetPrivateHistoryAsync(myId, otherUserId, cursor, take);

        var senders = new Dictionary<string, ApplicationUser?>();
        foreach (var m in msgs)
        {
            if (!senders.ContainsKey(m.SenderId))
            {
                senders[m.SenderId] = await _users.FindByIdAsync(m.SenderId);
            }
        }

        var items = msgs.Select(m => ToDto(m, senders[m.SenderId]?.DisplayName ?? "Unknown", senders[m.SenderId]?.AvatarUrl)).ToList();
        var nextCursor = msgs.Count == take ? msgs[^1].Id : (long?)null;

        return new PagedMessages(items, nextCursor);
    }

    public async Task<PagedMessages> GetGroupHistoryAsync(int groupId, long? cursor, int take)
    {
        take = Math.Clamp(take, 1, 100);
        var msgs = await _messages.GetGroupHistoryAsync(groupId, cursor, take);

        var senders = new Dictionary<string, ApplicationUser?>();
        foreach (var m in msgs)
        {
            if (!senders.ContainsKey(m.SenderId))
            {
                senders[m.SenderId] = await _users.FindByIdAsync(m.SenderId);
            }
        }

        var items = msgs.Select(m => ToDto(m, senders[m.SenderId]?.DisplayName ?? "Unknown", senders[m.SenderId]?.AvatarUrl)).ToList();
        var nextCursor = msgs.Count == take ? msgs[^1].Id : (long?)null;

        return new PagedMessages(items, nextCursor);
    }

    public async Task<IReadOnlyList<int>> GetUserGroupIdsAsync(string userId)
    {
        return await _groups.GetUserGroupIdsAsync(userId);
    }

    public async Task<bool> DeleteMessageAsync(long messageId, string userId)
    {
        return await _messages.DeleteAsync(messageId, userId);
    }

    public async Task<bool> UpdateMessageAsync(long messageId, string userId, string newContent)
    {
        return await _messages.UpdateContentAsync(messageId, userId, newContent);
    }

    private static MessageDto ToDto(Message m, string senderName, string? senderAvatarUrl = null) =>
        new(m.Id, m.SenderId, senderName, m.RecipientId, m.GroupId,
            m.IsDeleted ? "[deleted]" : m.Content, m.SentAtUtc, m.IsDeleted,
            m.AttachmentUrl, m.AttachmentFileName, m.AttachmentType,
            senderAvatarUrl);
}
