using ChatApp.Domain.Enums;

namespace ChatApp.Domain.Models;

public class Message
{
    public long Id { get; set; }
    public string SenderId { get; set; } = string.Empty;
    public string? RecipientId { get; set; }    // private message — exactly one of these is set
    public int? GroupId { get; set; }           // group message   — exactly one of these is set
    public string Content { get; set; } = string.Empty;
    public MessageType Type { get; set; } = MessageType.Private;
    public DateTime SentAtUtc { get; set; }     // always set server-side, never from client
    public bool IsDeleted { get; set; } = false;
    public string? AttachmentUrl { get; set; }
    public string? AttachmentFileName { get; set; }
    public string? AttachmentType { get; set; }

    // Navigation
    public ApplicationUser Sender { get; set; } = null!;
    public ApplicationUser? Recipient { get; set; }
    public GroupChannel? Group { get; set; }
}
