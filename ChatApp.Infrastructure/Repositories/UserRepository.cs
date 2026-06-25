using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using ChatApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace ChatApp.Infrastructure.Repositories;

public class UserRepository : IUserRepository
{
    private readonly ChatDbContext _db;

    public UserRepository(ChatDbContext db) => _db = db;

    public Task<ApplicationUser?> FindByIdAsync(string userId) =>
        _db.Users.FirstOrDefaultAsync(u => u.Id == userId);

    public async Task<IReadOnlyList<ApplicationUser>> SearchAsync(string query, string excludeUserId)
    {
        return await _db.Users
            .Where(u => u.Id != excludeUserId
                && (u.UserName!.Contains(query) || u.DisplayName.Contains(query)))
            .Take(20)
            .ToListAsync();
    }

    public async Task<IReadOnlyList<ApplicationUser>> GetAllAsync() =>
        await _db.Users.ToListAsync();

    public Task UpdateAsync(ApplicationUser user)
    {
        _db.Users.Update(user);
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync() => _db.SaveChangesAsync();
}
