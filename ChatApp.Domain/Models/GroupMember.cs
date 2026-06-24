namespace ChatApp.Domain.Models;

public class GroupMember
{
    public int GroupId { get; set; }
    public string UserId { get; set; } = string.Empty;
    public DateTime JoinedAtUtc { get; set; }
    public bool IsAdminOfGroup { get; set; } = false;

    // Navigation
    public GroupChannel Group { get; set; } = null!;
    public ApplicationUser User { get; set; } = null!;
}
