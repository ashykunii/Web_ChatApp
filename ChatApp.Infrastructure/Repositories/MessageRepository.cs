using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using ChatApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Infrastructure.Repositories;

public class MessageRepository : IMessageRepository
{
    private readonly ChatDbContext _db;

    public MessageRepository(ChatDbContext db) => _db = db;

    public async Task<Message> AddAsync(Message message)
    {
        _db.Messages.Add(message);
        await _db.SaveChangesAsync();
        return message;
    }

    public async Task<IReadOnlyList<Message>> AddRangeAsync(IEnumerable<Message> messages)
    {
        var list = messages.ToList();
        _db.Messages.AddRange(list);
        await _db.SaveChangesAsync();
        return list;
    }

    public async Task<IReadOnlyList<Message>> GetPrivateHistoryAsync(
        string userAId, string userBId, long? cursor, int take)
    {
        var query = _db.Messages
            .Where(m => !m.IsDeleted
                && ((m.SenderId == userAId && m.RecipientId == userBId)
                 || (m.SenderId == userBId && m.RecipientId == userAId)))
            .OrderByDescending(m => m.Id)
            .AsQueryable();

        if (cursor.HasValue)
            query = query.Where(m => m.Id < cursor.Value);

        var page = await query.Take(take).ToListAsync();
        return page.OrderBy(m => m.Id).ToList();    // re-sort ascending for display
    }

    public async Task<IReadOnlyList<Message>> GetGroupHistoryAsync(
        int groupId, long? cursor, int take)
    {
        var query = _db.Messages
            .Where(m => !m.IsDeleted && m.GroupId == groupId)
            .OrderByDescending(m => m.Id)
            .AsQueryable();

        if (cursor.HasValue)
            query = query.Where(m => m.Id < cursor.Value);

        var page = await query.Take(take).ToListAsync();
        return page.OrderBy(m => m.Id).ToList();
    }

    public async Task<bool> DeleteAsync(long messageId, string requestingUserId)
    {
        var msg = await _db.Messages.FindAsync(messageId);
        if (msg == null || msg.SenderId != requestingUserId) return false;

        msg.IsDeleted = true;
        await _db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> UpdateContentAsync(long messageId, string requestingUserId, string newContent)
    {
        var msg = await _db.Messages.FindAsync(messageId);
        if (msg == null || msg.SenderId != requestingUserId || msg.IsDeleted) return false;

        msg.Content = newContent;
        await _db.SaveChangesAsync();
        return true;
    }

    public Task SaveChangesAsync() => _db.SaveChangesAsync();
}
