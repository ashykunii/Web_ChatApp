using ChatApp.Application.DTOs;

namespace ChatApp.Application.Interfaces;

public interface IContactService
{
    Task<IReadOnlyList<ContactDto>> GetContactsAsync(string ownerId);
    Task AddContactAsync(string ownerId, string contactUserId);
    Task RemoveContactAsync(string ownerId, string contactUserId);
    Task<IReadOnlyList<UserSearchResult>> SearchUsersAsync(string query, string requestingUserId);
}
