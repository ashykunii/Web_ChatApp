using ChatApp.Domain.Models;

namespace ChatApp.Domain.Interfaces;

public interface IMessageRepository
{
    Task<Message> AddAsync(Message message);
    Task<IReadOnlyList<Message>> AddRangeAsync(IEnumerable<Message> messages);
    Task<IReadOnlyList<Message>> GetPrivateHistoryAsync(
        string userAId, string userBId, long? cursor, int take);
    Task<IReadOnlyList<Message>> GetGroupHistoryAsync(
        int groupId, long? cursor, int take);
    Task<bool> DeleteAsync(long messageId, string requestingUserId);
    Task<bool> UpdateContentAsync(long messageId, string requestingUserId, string newContent);
    Task SaveChangesAsync();
}
