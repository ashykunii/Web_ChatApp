using ChatApp.Domain.Models;

namespace ChatApp.Domain.Interfaces;

public interface IUserRepository
{
    Task<ApplicationUser?> FindByIdAsync(string userId);
    Task<IReadOnlyList<ApplicationUser>> SearchAsync(string query, string excludeUserId);
    Task<IReadOnlyList<ApplicationUser>> GetAllAsync();
    Task UpdateAsync(ApplicationUser user);
    Task SaveChangesAsync();
}
