using ChatApp.Domain.Enums;
using Microsoft.AspNetCore.Identity;

namespace ChatApp.Domain.Models;

public class ApplicationUser : IdentityUser
{
    public string DisplayName { get; set; } = string.Empty;
    public PresenceStatus PresenceStatus { get; set; } = PresenceStatus.Offline;
    public DateTime LastSeenUtc { get; set; } = DateTime.UtcNow;
    public bool IsBanned { get; set; } = false;
    public string? BanReason { get; set; }
    public string? AvatarUrl { get; set; }

    // Navigation
    public ICollection<Message> SentMessages { get; set; } = new List<Message>();
    public ICollection<GroupMember> GroupMemberships { get; set; } = new List<GroupMember>();
    public ICollection<Contact> Contacts { get; set; } = new List<Contact>();
    public ICollection<BlockedUser> BlockedUsers { get; set; } = new List<BlockedUser>();
    public ICollection<UserBan> Bans { get; set; } = new List<UserBan>();
}
