using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using ChatApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Infrastructure.Repositories;

public class ContactRepository : IContactRepository
{
    private readonly ChatDbContext _db;

    public ContactRepository(ChatDbContext db) => _db = db;

    public async Task<IReadOnlyList<Contact>> GetContactsAsync(string ownerId) =>
        await _db.Contacts
            .Include(c => c.ContactUser)
            .Where(c => c.OwnerId == ownerId)
            .ToListAsync();

    public Task<Contact?> FindAsync(string ownerId, string contactUserId) =>
        _db.Contacts.FirstOrDefaultAsync(c => c.OwnerId == ownerId && c.ContactUserId == contactUserId);

    public async Task AddAsync(Contact contact)
    {
        _db.Contacts.Add(contact);
        await _db.SaveChangesAsync();
    }

    public async Task RemoveAsync(Contact contact)
    {
        _db.Contacts.Remove(contact);
        await _db.SaveChangesAsync();
    }

    public Task<bool> ExistsAsync(string ownerId, string contactUserId) =>
        _db.Contacts.AnyAsync(c => c.OwnerId == ownerId && c.ContactUserId == contactUserId);

    public Task SaveChangesAsync() => _db.SaveChangesAsync();
}
