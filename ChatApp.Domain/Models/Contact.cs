namespace ChatApp.Domain.Models;

public class Contact
{
    public int Id { get; set; }
    public string OwnerId { get; set; } = string.Empty;
    public string ContactUserId { get; set; } = string.Empty;
    public DateTime AddedAtUtc { get; set; }

    // Navigation
    public ApplicationUser Owner { get; set; } = null!;
    public ApplicationUser ContactUser { get; set; } = null!;
}
