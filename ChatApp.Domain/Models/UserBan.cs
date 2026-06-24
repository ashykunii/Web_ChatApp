namespace ChatApp.Domain.Models;

public class UserBan
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string IssuedByAdminId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public DateTime IssuedAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }   // null = permanent

    // Navigation
    public ApplicationUser User { get; set; } = null!;
    public ApplicationUser IssuedByAdmin { get; set; } = null!;
}
