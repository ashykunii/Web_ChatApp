using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;

namespace ChatApp.Application.Services;

public class ContactService : IContactService
{
    private readonly IContactRepository _contacts;
    private readonly IUserRepository _users;
    private readonly IModerationRepository _moderation;

    public ContactService(
        IContactRepository contacts,
        IUserRepository users,
        IModerationRepository moderation)
    {
        _contacts = contacts;
        _users = users;
        _moderation = moderation;
    }

    public async Task<IReadOnlyList<ContactDto>> GetContactsAsync(string ownerId)
    {
        var contacts = await _contacts.GetContactsAsync(ownerId);
        return contacts
            .Select(c => new ContactDto(
                c.ContactUserId,
                c.ContactUser.DisplayName,
                c.ContactUser.UserName ?? "",
                c.ContactUser.PresenceStatus.ToString(),
                c.ContactUser.LastSeenUtc,
                c.ContactUser.AvatarUrl))
            .ToList();
    }

    public async Task AddContactAsync(string ownerId, string contactUserId)
    {
        if (ownerId == contactUserId)
            throw new InvalidOperationException("Cannot add yourself as a contact.");

        if (await _contacts.ExistsAsync(ownerId, contactUserId)) return;

        await _contacts.AddAsync(new Contact
        {
            OwnerId = ownerId,
            ContactUserId = contactUserId,
            AddedAtUtc = DateTime.UtcNow
        });
        await _contacts.SaveChangesAsync();
    }

    public async Task RemoveContactAsync(string ownerId, string contactUserId)
    {
        var contact = await _contacts.FindAsync(ownerId, contactUserId);
        if (contact == null) return;

        await _contacts.RemoveAsync(contact);
        await _contacts.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<UserSearchResult>> SearchUsersAsync(
        string query, string requestingUserId)
    {
        var users = await _users.SearchAsync(query, requestingUserId);
        var result = new List<UserSearchResult>();

        foreach (var u in users)
        {
            var isContact = await _contacts.ExistsAsync(requestingUserId, u.Id);
            var isBlocked = await _moderation.IsBlockedAsync(requestingUserId, u.Id);
            result.Add(new UserSearchResult(u.Id, u.DisplayName, u.UserName ?? "", isContact, isBlocked, u.AvatarUrl));
        }

        return result;
    }
}
