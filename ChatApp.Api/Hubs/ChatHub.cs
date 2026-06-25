using System.Collections.Concurrent;
using System.Security.Claims;
using ChatApp.Application.Interfaces;
using ChatApp.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace ChatApp.Api.Hubs;

[Authorize]
public class ChatHub : Hub
{
    private readonly IMessageService _messages;
    private readonly IModerationService _moderation;
    private readonly IPresenceService _presence;

    // userId -> set of connectionIds (handles multi-tab / multi-device)
    private static readonly ConcurrentDictionary<string, HashSet<string>> _userConnections = new();

    public ChatHub(
        IMessageService messages,
        IModerationService moderation,
        IPresenceService presence)
    {
        _messages = messages;
        _moderation = moderation;
        _presence = presence;
    }

    private string UserId => Context.User!.FindFirst(ClaimTypes.NameIdentifier)!.Value;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    public override async Task OnConnectedAsync()
    {
        if (await _moderation.IsBannedAsync(UserId))
        {
            Context.Abort();
            return;
        }

        var connections = _userConnections.GetOrAdd(UserId, _ => new HashSet<string>());
        bool wasOffline;
        lock (connections)
        {
            wasOffline = connections.Count == 0;
            connections.Add(Context.ConnectionId);
        }

        // Re-join this connection into all group channels the user belongs to
        foreach (var groupId in await _messages.GetUserGroupIdsAsync(UserId))
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(groupId));

        if (wasOffline)
        {
            await _presence.SetStatusAsync(UserId, PresenceStatus.Online);
            await BroadcastPresenceAsync(UserId, PresenceStatus.Online);
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (_userConnections.TryGetValue(UserId, out var connections))
        {
            bool nowOffline;
            lock (connections)
            {
                connections.Remove(Context.ConnectionId);
                nowOffline = connections.Count == 0;
            }

            if (nowOffline)
            {
                _userConnections.TryRemove(UserId, out _);
                await _presence.SetStatusAsync(UserId, PresenceStatus.Offline);
                await BroadcastPresenceAsync(UserId, PresenceStatus.Offline);
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    // ── Messaging ─────────────────────────────────────────────────────────────

    public async Task SendPrivateMessage(string recipientId, string content, string? attachmentUrl = null, string? attachmentFileName = null, string? attachmentType = null)
    {
        await EnsureNotBannedAsync();

        // Respect both directions of blocking
        if (await _moderation.IsBlockedAsync(recipientId, UserId))
            throw new HubException("You cannot message this user.");
        if (await _moderation.IsBlockedAsync(UserId, recipientId))
            throw new HubException("You have blocked this user.");

        var dto = await _messages.SaveAndCreatePrivateMessageAsync(UserId, recipientId, content, attachmentUrl, attachmentFileName, attachmentType);

        // Echo to sender's other tabs + push to recipient
        await Clients.User(UserId).SendAsync("ReceiveMessage", dto);
        await Clients.User(recipientId).SendAsync("ReceiveMessage", dto);
    }

    public async Task SendGroupMessage(int groupId, string content, string? attachmentUrl = null, string? attachmentFileName = null, string? attachmentType = null)
    {
        await EnsureNotBannedAsync();

        var dto = await _messages.SaveAndCreateGroupMessageAsync(UserId, groupId, content, attachmentUrl, attachmentFileName, attachmentType);
        await Clients.Group(GroupName(groupId)).SendAsync("ReceiveMessage", dto);
    }

    public async Task SendBulkMessage(List<string> recipientIds, string content)
    {
        await EnsureNotBannedAsync();

        // Filter out users who have blocked the sender or been blocked
        var validRecipients = new List<string>();
        foreach (var rid in recipientIds.Distinct())
        {
            if (!await _moderation.IsBlockedAsync(rid, UserId) &&
                !await _moderation.IsBlockedAsync(UserId, rid))
                validRecipients.Add(rid);
        }

        if (validRecipients.Count == 0)
            throw new HubException("No valid recipients.");

        var dtos = await _messages.SaveAndCreateBulkMessagesAsync(UserId, validRecipients, content);

        foreach (var dto in dtos)
            await Clients.User(dto.RecipientId!).SendAsync("ReceiveMessage", dto);

        await Clients.User(UserId).SendAsync("BulkMessageSent", dtos);
    }

    public async Task DeleteMessage(long messageId)
    {
        await EnsureNotBannedAsync();
        var ok = await _messages.DeleteMessageAsync(messageId, UserId);
        if (ok)
        {
            await Clients.All.SendAsync("MessageDeleted", messageId);
        }
    }

    public async Task EditMessage(long messageId, string newContent)
    {
        await EnsureNotBannedAsync();
        var ok = await _messages.UpdateMessageAsync(messageId, UserId, newContent);
        if (ok)
        {
            await Clients.All.SendAsync("MessageEdited", messageId, newContent);
        }
    }

    // ── Presence ──────────────────────────────────────────────────────────────

    public async Task SetPresence(PresenceStatus status)
    {
        // Server is the only authority for Offline status
        if (status == PresenceStatus.Offline) return;

        await _presence.SetStatusAsync(UserId, status);
        await BroadcastPresenceAsync(UserId, status);
    }

    // ── Group SignalR membership (called when REST creates/joins a group) ──────

    public async Task JoinGroupChannel(int groupId)
    {
        await EnsureNotBannedAsync();
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(groupId));
    }

    public async Task LeaveGroupChannel(int groupId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(groupId));
    }

    // ── Static helper: called from AdminController to force-disconnect ─────────

    public static IReadOnlyList<string> GetConnectionIds(string userId)
    {
        if (_userConnections.TryGetValue(userId, out var connections))
            lock (connections) return connections.ToList();
        return Array.Empty<string>();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task BroadcastPresenceAsync(string userId, PresenceStatus status)
    {
        var blockers = await _moderation.GetUsersWhoBlockedAsync(userId);
        var excludedConnIds = blockers
            .SelectMany(id => _userConnections.TryGetValue(id, out var c)
                ? (IEnumerable<string>)c
                : Array.Empty<string>())
            .ToList();

        if (excludedConnIds.Count > 0)
            await Clients.AllExcept(excludedConnIds)
                .SendAsync("PresenceChanged", userId, status.ToString());
        else
            await Clients.All.SendAsync("PresenceChanged", userId, status.ToString());
    }

    private async Task EnsureNotBannedAsync()
    {
        if (await _moderation.IsBannedAsync(UserId))
        {
            Context.Abort();
            throw new HubException("Your account has been banned.");
        }
    }

    private static string GroupName(int groupId) => $"group-{groupId}";
}
