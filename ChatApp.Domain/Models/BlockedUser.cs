namespace ChatApp.Domain.Models;

public class BlockedUser
{
    public int Id { get; set; }
    public string BlockerId { get; set; } = string.Empty;
    public string BlockedUserId { get; set; } = string.Empty;
    public DateTime BlockedAtUtc { get; set; }

    // Navigation
    public ApplicationUser Blocker { get; set; } = null!;
    public ApplicationUser Blocked { get; set; } = null!;
}
