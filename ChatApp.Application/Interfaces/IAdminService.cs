using ChatApp.Application.DTOs;

namespace ChatApp.Application.Interfaces;

public interface IAdminService
{
    Task<IReadOnlyList<AdminUserDto>> GetAllUsersAsync();
}
