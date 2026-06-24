namespace ChatApp.Domain.Models;

public class GroupChannel
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string CreatedById { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }

    // Navigation
    public ApplicationUser CreatedBy { get; set; } = null!;
    public ICollection<GroupMember> Members { get; set; } = new List<GroupMember>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
