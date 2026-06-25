using ChatApp.Domain.Models;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Infrastructure.Data;

public class ChatDbContext : IdentityDbContext<ApplicationUser>
{
    public ChatDbContext(DbContextOptions<ChatDbContext> options) : base(options) { }

    public DbSet<Message> Messages => Set<Message>();
    public DbSet<GroupChannel> GroupChannels => Set<GroupChannel>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<BlockedUser> BlockedUsers => Set<BlockedUser>();
    public DbSet<UserBan> UserBans => Set<UserBan>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Message — composite indexes for efficient cursor pagination
        builder.Entity<Message>(e =>
        {
            e.HasIndex(m => new { m.RecipientId, m.Id });   // private message history
            e.HasIndex(m => new { m.GroupId, m.Id });        // group message history

            e.HasOne(m => m.Sender)
             .WithMany(u => u.SentMessages)
             .HasForeignKey(m => m.SenderId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(m => m.Recipient)
             .WithMany()
             .HasForeignKey(m => m.RecipientId)
             .OnDelete(DeleteBehavior.Restrict)
             .IsRequired(false);

            e.HasOne(m => m.Group)
             .WithMany(g => g.Messages)
             .HasForeignKey(m => m.GroupId)
             .OnDelete(DeleteBehavior.Cascade)
             .IsRequired(false);
        });

        // GroupMember — composite PK (no duplicate membership)
        builder.Entity<GroupMember>(e =>
        {
            e.HasKey(gm => new { gm.GroupId, gm.UserId });

            e.HasOne(gm => gm.Group)
             .WithMany(g => g.Members)
             .HasForeignKey(gm => gm.GroupId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(gm => gm.User)
             .WithMany(u => u.GroupMemberships)
             .HasForeignKey(gm => gm.UserId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        // Contact — unique pair constraint
        builder.Entity<Contact>(e =>
        {
            e.HasIndex(c => new { c.OwnerId, c.ContactUserId }).IsUnique();

            e.HasOne(c => c.Owner)
             .WithMany(u => u.Contacts)
             .HasForeignKey(c => c.OwnerId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(c => c.ContactUser)
             .WithMany()
             .HasForeignKey(c => c.ContactUserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // BlockedUser — unique pair constraint
        builder.Entity<BlockedUser>(e =>
        {
            e.HasIndex(b => new { b.BlockerId, b.BlockedUserId }).IsUnique();

            e.HasOne(b => b.Blocker)
             .WithMany(u => u.BlockedUsers)
             .HasForeignKey(b => b.BlockerId)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(b => b.Blocked)
             .WithMany()
             .HasForeignKey(b => b.BlockedUserId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // UserBan
        builder.Entity<UserBan>(e =>
        {
            e.HasOne(b => b.User)
             .WithMany(u => u.Bans)
             .HasForeignKey(b => b.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(b => b.IssuedByAdmin)
             .WithMany()
             .HasForeignKey(b => b.IssuedByAdminId)
             .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
