using ChatApp.Domain.Models;

namespace ChatApp.Domain.Interfaces;

public interface IContactRepository
{
    Task<IReadOnlyList<Contact>> GetContactsAsync(string ownerId);
    Task<Contact?> FindAsync(string ownerId, string contactUserId);
    Task AddAsync(Contact contact);
    Task RemoveAsync(Contact contact);
    Task<bool> ExistsAsync(string ownerId, string contactUserId);
    Task SaveChangesAsync();
}
