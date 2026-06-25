using ChatApp.Application.Interfaces;
using ChatApp.Application.Services;
using ChatApp.Domain.Models;
using ChatApp.Domain.Interfaces;
using ChatApp.Infrastructure.Data;
using ChatApp.Infrastructure.Repositories;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ChatApp.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<ChatDbContext>(opts =>
            opts.UseSqlite(configuration.GetConnectionString("DefaultConnection")));

        services.AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            options.Password.RequiredLength = 6;
            options.Password.RequireNonAlphanumeric = false;
            options.Password.RequireUppercase = false;
            options.User.RequireUniqueEmail = false;
        })
        .AddEntityFrameworkStores<ChatDbContext>()
        .AddDefaultTokenProviders();

        // Repositories
        services.AddScoped<IMessageRepository, MessageRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IGroupRepository, GroupRepository>();
        services.AddScoped<IContactRepository, ContactRepository>();
        services.AddScoped<IModerationRepository, ModerationRepository>();

        // Application Services
        services.AddScoped<IMessageService, MessageService>();
        services.AddScoped<IPresenceService, PresenceService>();
        services.AddScoped<IModerationService, ModerationService>();
        services.AddScoped<IContactService, ContactService>();
        services.AddScoped<IAdminService, AdminService>();

        return services;
    }
}
