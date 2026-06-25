using ChatApp.Application.DTOs;
using ChatApp.Application.Interfaces;
using ChatApp.Domain.Interfaces;
using Microsoft.AspNetCore.Identity;
using ChatApp.Domain.Models;

namespace ChatApp.Application.Services;

public class AdminService : IAdminService
{
    private readonly IUserRepository _users;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminService(IUserRepository users, UserManager<ApplicationUser> userManager)
    {
        _users = users;
        _userManager = userManager;
    }

    public async Task<IReadOnlyList<AdminUserDto>> GetAllUsersAsync()
    {
        var users = await _users.GetAllAsync();
        var result = new List<AdminUserDto>();

        foreach (var u in users)
        {
            var roles = await _userManager.GetRolesAsync(u);
            result.Add(new AdminUserDto(
                u.Id, u.UserName ?? "", u.DisplayName,
                u.IsBanned, u.BanReason,
                u.PresenceStatus.ToString(),
                u.LastSeenUtc,
                roles.Contains("Admin"),
                u.AvatarUrl));
        }

        return result;
    }
}
