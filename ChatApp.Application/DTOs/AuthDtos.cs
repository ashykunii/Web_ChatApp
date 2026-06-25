namespace ChatApp.Application.DTOs;

public record RegisterRequest(string UserName, string DisplayName, string Email, string Password);

public record LoginRequest(string UserName, string Password);

public record AuthResponse(string Token, string UserId, string UserName, string DisplayName, string Role, string? AvatarUrl = null);

public record UpdateProfileRequest(string DisplayName, string Email, string? Password = null, string? AvatarUrl = null);
