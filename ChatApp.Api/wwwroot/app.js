/* ==========================================================================
   1. GLOBAL CONSTANTS & APP STATE
   ========================================================================== */

const API_BASE = window.location.origin;
const HUB_URL  = `${API_BASE}/hubs/chat`;

// Global Application State Caching
const state = {
    token: null,             // JWT Auth Token
    me: null,                // Logged-in User Info: { userId, userName, displayName, role, avatarUrl }
    connection: null,        // SignalR Connection instance
    contacts: [],            // List of contact objects
    groups: [],              // List of group objects
    activeChat: null,        // Currently opened chat room: { type: 'private'|'group', id, name }
    activeTab: 'chats',      // Current sidebar tab: 'chats' (combined), 'contacts' (contacts only), 'groups', 'admin'
    messages: [],            // Messages loaded in the current active chat room
    oldestCursor: null,      // Cursor pointer for paginated historical message loading
    hasMore: false,          // Boolean flag indicating if older messages exist on server
    presenceMap: {},         // Presence map caching user presence status: userId -> status string
    adminUsers: [],          // Cache of all users for admin management panel
    pendingAttachment: null, // Temporary attachment storage before sending: { url, fileName, attachmentType }
    replyingTo: null,        // Message reference information when replying: { id, senderName, snippet }
    editingMessage: null,    // Message reference information when editing: MessageDto
    pinnedMessages: JSON.parse(localStorage.getItem('chatapp_pinned') || '{}') // Pinned messages cache
};

/* ==========================================================================
   2. COMMON UTILITY & FORMATTING FUNCTIONS
   ========================================================================== */

// DOM Selector Helper
const $ = id => document.getElementById(id);

// Toast Notification Engine
function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

// Wrapper for API HTTP Requests
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...opts.headers };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
        let err;
        try { err = await res.json(); } catch { err = { error: res.statusText }; }
        throw new Error(err.error || JSON.stringify(err));
    }
    return res.status === 204 ? null : res.json();
}

// HTML Special Character Escaping
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Time Formatter for ISO string to Local Time (HH:MM)
function formatTime(iso) {
    if (!iso) return '';
    // Ensure the string is treated as UTC (ASP.NET returns datetimes without 'Z')
    const utcStr = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    const d = new Date(utcStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Date Grouping Helper (returns YYYY-MM-DD in local time)
function toLocalDateKey(iso) {
    if (!iso) return '';
    const utcStr = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    const d = new Date(utcStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Day separation label formatter
function formatDateLabel(dateKey) {
    const [y, mo, dy] = dateKey.split('-').map(Number);
    const msgDate   = new Date(y, mo - 1, dy);
    const now       = new Date();
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    if (msgDate.getTime() === today.getTime())     return 'Today';
    if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';

    return msgDate.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// Generates avatar initials for text-based avatars
function initials(name) {
    return (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

// Renders User Avatars or falls back to initials
function renderAvatarEl(el, displayName, avatarUrl) {
    if (!el) return;
    if (avatarUrl) {
        el.style.backgroundImage = `url(${avatarUrl})`;
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.textContent = '';
    } else {
        el.style.backgroundImage = 'none';
        el.textContent = initials(displayName);
    }
}

/* ==========================================================================
   3. DRAWER & SIDEBAR EVENT LISTENERS
   ========================================================================== */

// Drawer Control Operations
$('btnHamburger').onclick = (e) => {
    e.stopPropagation();
    $('drawer').classList.add('active');
    $('drawerOverlay').classList.add('active');
    updateDrawerProfile();
};

$('drawerOverlay').onclick = () => {
    closeDrawer();
};

function closeDrawer() {
    $('drawer').classList.remove('active');
    $('drawerOverlay').classList.remove('active');
}

function updateDrawerProfile() {
    if (!state.me) return;
    $('drawerDisplayName').textContent = state.me.displayName;
    const currentStatus = state.presenceMap[state.me.userId] || 'Online';
    $('drawerPresenceStatus').textContent = currentStatus;
    renderAvatarEl($('drawerAvatar'), state.me.displayName, state.me.avatarUrl);
}


// Initial Theme & Configuration Sync
(function initTheme() {
    const nightMode = localStorage.getItem('night_mode');
    if (nightMode === 'true') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
    const savedSize = localStorage.getItem('msg_font_size');
    if (savedSize) {
        document.documentElement.style.setProperty('--msg-font-size', savedSize);
    }
})();

// Drawer Action Triggers
$('drawerMenuProfile').onclick  = () => { closeDrawer(); showProfilePanel(); };
$('drawerMenuNewGroup').onclick = () => { closeDrawer(); openNewGroupModal(); };
$('drawerMenuContacts').onclick = () => { closeDrawer(); selectTab('contacts'); };
$('drawerMenuBulkMessage').onclick = () => { closeDrawer(); openBulkMsgModal(); };
$('drawerMenuSettings').onclick = () => { closeDrawer(); showSettingsModal(); };
$('menuLogout').onclick          = () => { logout(); };

function selectTab(tab) {
    state.activeTab = tab;
    renderSidebar();
}

// Close Dropdowns on Click Outside
document.addEventListener('click', (e) => {
    const drop = $('headerMenuDropdown');
    if (drop && !e.target.closest('.header-actions')) drop.classList.remove('active');
    
    const emojiPicker = $('emojiPickerPopup');
    if (emojiPicker && !e.target.closest('#emojiPickerPopup') && !e.target.closest('#btnEmojiTrigger')) {
        emojiPicker.classList.remove('active');
    }
    
    const ctx = $('msgContextMenu');
    if (ctx) ctx.classList.remove('active');
});

/* ==========================================================================
   4. USER AUTHENTICATION & LOGIN FLOW
   ========================================================================== */

// Auth Screen Toggle Tabs
$('tabLogin').onclick = () => {
    $('tabLogin').classList.add('active');
    $('tabRegister').classList.remove('active');
    $('loginForm').style.display = '';
    $('registerForm').style.display = 'none';
};

$('tabRegister').onclick = () => {
    $('tabRegister').classList.add('active');
    $('tabLogin').classList.remove('active');
    $('registerForm').style.display = '';
    $('loginForm').style.display = 'none';
};

// Login Form Submit Event
$('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    $('loginError').textContent = '';
    try {
        const data = await api('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                userName: $('loginUserName').value,
                password: $('loginPassword').value
            })
        });
        state.token = data.token;
        state.me = data;
        localStorage.setItem('chatapp_token', data.token);
        await enterApp();
    } catch (err) {
        $('loginError').textContent = err.message;
    }
};

// Register Form Submit Event
$('registerForm').onsubmit = async (e) => {
    e.preventDefault();
    $('regError').textContent = '';
    $('regSuccess').textContent = '';
    try {
        await api('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify({
                userName: $('regUserName').value,
                displayName: $('regDisplayName').value,
                email: $('regEmail').value,
                password: $('regPassword').value
            })
        });
        $('regSuccess').textContent = 'Registered successfully. You can log in now.';
    } catch (err) {
        $('regError').textContent = err.message;
    }
};

// Logout Functionality
function logout() {
    if (state.connection) {
        state.connection.stop().catch(err => console.error(err));
    }
    localStorage.removeItem('chatapp_token');
    state.token = null;
    state.me = null;
    window.location.reload();
}

// Application Landing Entry Setup
async function enterApp() {
    $('authScreen').style.display = 'none';
    $('app').classList.add('active');
    updateDrawerProfile();
    await connectHub();
    await loadContacts();
    await loadGroups();
    renderSidebar();

    const infoClose = $('infoPanelClose');
    if (infoClose) infoClose.onclick = closeInfoPanel;
    const infoOverlay = $('infoPanelOverlay');
    if (infoOverlay) infoOverlay.onclick = closeInfoPanel;

    const searchInput = $('chatSearchInput');
    if (searchInput) searchInput.addEventListener('input', runMessageSearch);
    const searchPrev = $('chatSearchPrev');
    if (searchPrev) searchPrev.onclick = () => searchNavigate('prev');
    const searchNext = $('chatSearchNext');
    if (searchNext) searchNext.onclick = () => searchNavigate('next');
    const searchClose = $('chatSearchClose');
    if (searchClose) searchClose.onclick = toggleSearchOverlay;

    initEmojiPicker();
}

/* ==========================================================================
   5. SIGNALR HUB CLIENT CONNECTION & EVENT BINDINGS
   ========================================================================== */

async function connectHub() {
    state.connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, { accessTokenFactory: () => state.token })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();

    // Message Received Handling
    state.connection.on('ReceiveMessage', (msg) => {
        const chat = state.activeChat;
        const isCurrent =
            (chat?.type === 'private' &&
                (msg.recipientId === chat.id && msg.senderId === state.me.userId
              || msg.senderId === chat.id && msg.recipientId === state.me.userId))
            || (chat?.type === 'group' && msg.groupId === chat.id);

        if (isCurrent) {
            const existingIndex = state.messages.findIndex(m => m.id === msg.id);
            if (existingIndex !== -1) {
                if (msg.isDeleted) {
                    state.messages[existingIndex].content = '[deleted]';
                    state.messages[existingIndex].attachmentType = '';
                    state.messages[existingIndex].attachmentUrl = '';
                    state.messages[existingIndex].attachmentFileName = '';
                    state.messages[existingIndex].isDeleted = true;
                } else {
                    state.messages[existingIndex].content = msg.content;
                }
            } else {
                state.messages.push(msg);
                // If this is an incoming private message, mark it as seen immediately
                if (msg.senderId !== state.me.userId && msg.recipientId === state.me.userId) {
                    console.log("Incoming message - invoking MarkSeen for messageId:", msg.id);
                    state.connection.invoke('MarkSeen', msg.id).catch(err => console.error("MarkSeen error:", err));
                }
            }
            renderMessages();
        } else {
            // If this is a private message sent to me, increment the unread count for this contact
            if (msg.recipientId === state.me.userId) {
                const contact = state.contacts.find(c => c.userId === msg.senderId);
                if (contact) {
                    contact.unreadCount = (contact.unreadCount || 0) + 1;
                    renderSidebar();
                }
            }
            const who = msg.senderDisplayName || 'Someone';
            let cleanContent = msg.content;
            if (cleanContent.startsWith('>>reply:')) {
                cleanContent = cleanContent.split('<<').slice(1).join('<<');
            }
            const contentText = msg.attachmentUrl ? `Sent an attachment: ${msg.attachmentFileName}` : cleanContent;
            toast(`${who}: ${contentText.substring(0, 60)}`);
        }
    });

    // Message Deleted Notification
    state.connection.on('MessageDeleted', (messageId) => {
        const idx = state.messages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
            state.messages[idx].content = '[deleted]';
            state.messages[idx].isDeleted = true;
            renderMessages();
        }
    });

    // Message Edited Notification
    state.connection.on('MessageEdited', (messageId, newContent) => {
        const idx = state.messages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
            state.messages[idx].content = newContent;
            state.messages[idx].isEdited = true;
            renderMessages();
        }
    });

    // Message Read Confirmation Receipt
    state.connection.on('MessageSeen', (messageId) => {
        console.log("Client received MessageSeen event for messageId:", messageId);
        const idx = state.messages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
            state.messages[idx].isSeen = true;
            renderMessages();
        }
    });

    // User Status Presence Changes
    state.connection.on('PresenceChanged', (userId, status) => {
        state.presenceMap[userId] = status;
        if (state.me && userId === state.me.userId) {
            updateDrawerProfile();
        }
        renderSidebar();
        if (state.activeChat && state.activeChat.type === 'private' && state.activeChat.id === userId) {
            $('chatHeaderStatus').textContent = status;
        }
    });

    // Bulk Message Sent Complete Notification
    state.connection.on('BulkMessageSent', (dtos) => {
        toast(`Bulk message sent to ${dtos.length} recipients.`, 'success');
    });

    // Banned Disconnection Handling
    state.connection.on('ForceDisconnect', (reason) => {
        toast(`Account banned: ${reason}`, 'error');
        setTimeout(() => logout(), 2000);
    });

    // User Typing Notification Handler
    state.connection.on('UserTyping', (typingUserId, targetType, targetId, isTyping) => {
        if (state.activeChat && 
            ((state.activeChat.type === 'private' && targetType === 'private' && typingUserId === state.activeChat.id) ||
             (state.activeChat.type === 'group' && targetType === 'group' && targetId === state.activeChat.id.toString() && typingUserId !== state.me.userId))) {
            showTypingStatus(typingUserId, isTyping);
        }
    });

    // Chat History Cleared Handler
    state.connection.on('HistoryCleared', (chatType, chatId) => {
        if (state.activeChat && state.activeChat.type === chatType && state.activeChat.id.toString() === chatId.toString()) {
            state.messages = [];
            renderMessages();
            toast('Chat history cleared.', 'success');
        }
    });

    try {
        await state.connection.start();
        toast('Connected.', 'success');
    } catch (err) {
        toast('Connection failed: ' + err.message, 'error');
    }
}

/* ==========================================================================
   6. CONTACT SEARCH & SIDEBAR LIST RENDERING
   ========================================================================== */

// Debounced Contact Search logic
let searchTimer;
$('userSearch').oninput = () => {
    clearTimeout(searchTimer);
    const q = $('userSearch').value.trim();
    if (q.length < 2) { renderSidebar(); return; }
    searchTimer = setTimeout(async () => {
        try {
            const results = await api(`/api/contacts/search?q=${encodeURIComponent(q)}`);
            renderSearchResults(results);
        } catch (e) { toast(e.message, 'error'); }
    }, 250);
};

// Initial Data Pulling
async function loadContacts() {
    try {
        state.contacts = await api('/api/contacts');
        state.contacts.forEach(c => state.presenceMap[c.userId] = c.presenceStatus);
    } catch (e) { toast(e.message, 'error'); }
}

async function loadGroups() {
    try {
        state.groups = await api('/api/groups');
    } catch (e) { toast(e.message, 'error'); }
}

// Sidepane Navigation Lists Renderer
function renderSidebar() {
    const list = $('sidebarList');
    list.innerHTML = '';

    if (state.activeTab === 'chats') {
        const combined = [];
        state.contacts.forEach(c => combined.push({ type: 'private', data: c, name: c.displayName }));
        state.groups.forEach(g => combined.push({ type: 'group', data: g, name: g.name }));
        
        combined.sort((a, b) => a.name.localeCompare(b.name));
        

        combined.forEach(item => {
            const div = document.createElement('div');
            if (item.type === 'private') {
                const c = item.data;
                const status = state.presenceMap[c.userId] || c.presenceStatus;
                div.className = 'list-item' + (state.activeChat?.type === 'private' && state.activeChat?.id === c.userId ? ' active' : '');
                
                const avatarDiv = document.createElement('div');
                avatarDiv.className = 'avatar';
                renderAvatarEl(avatarDiv, c.displayName, c.avatarUrl);
                div.appendChild(avatarDiv);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'info';
                infoDiv.innerHTML = `
                    <div class="name">${escapeHtml(c.displayName)}</div>
                    <div class="sub"><span class="presence-dot presence-${status}"></span>${status}</div>
                `;
                div.appendChild(infoDiv);

                if (c.unreadCount && c.unreadCount > 0) {
                    const badgeDiv = document.createElement('div');
                    badgeDiv.className = 'unread-badge';
                    badgeDiv.textContent = c.unreadCount;
                    div.appendChild(badgeDiv);
                }

                div.onclick = () => openChat({ type: 'private', id: c.userId, name: c.displayName });
            } else {
                const g = item.data;
                div.className = 'list-item' + (state.activeChat?.type === 'group' && state.activeChat?.id === g.id ? ' active' : '');
                div.innerHTML = `
                    <div class="avatar">#</div>
                    <div class="info">
                        <div class="name">${escapeHtml(g.name)}</div>
                        <div class="sub">${g.memberCount} members</div>
                    </div>
                `;
                div.onclick = () => openChat({ type: 'group', id: g.id, name: g.name });
            }
            list.appendChild(div);
        });
        if (combined.length === 0) {
            list.innerHTML = '<div style="padding:16px;color:var(--text-sub);font-size:13px;text-align:center;">No chats or groups found.</div>';
        }
    } else if (state.activeTab === 'contacts') {
        state.contacts.forEach(c => {
            const status = state.presenceMap[c.userId] || c.presenceStatus;
            const div = document.createElement('div');
            div.className = 'list-item' + (state.activeChat?.type === 'private' && state.activeChat?.id === c.userId ? ' active' : '');
            
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'avatar';
            renderAvatarEl(avatarDiv, c.displayName, c.avatarUrl);
            div.appendChild(avatarDiv);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'info';
            infoDiv.innerHTML = `
                <div class="name">${escapeHtml(c.displayName)}</div>
                <div class="sub"><span class="presence-dot presence-${status}"></span>${status}</div>
            `;
            div.appendChild(infoDiv);

            if (c.unreadCount && c.unreadCount > 0) {
                const badgeDiv = document.createElement('div');
                badgeDiv.className = 'unread-badge';
                badgeDiv.textContent = c.unreadCount;
                div.appendChild(badgeDiv);
            }

            div.onclick = () => openChat({ type: 'private', id: c.userId, name: c.displayName });
            list.appendChild(div);
        });
        if (state.contacts.length === 0) {
            list.innerHTML = '<div style="padding:16px;color:var(--text-sub);font-size:13px;text-align:center;">No contacts found. Use Search to add some.</div>';
        }
    } else if (state.activeTab === 'groups') {
        state.groups.forEach(g => {
            const div = document.createElement('div');
            div.className = 'list-item' + (state.activeChat?.type === 'group' && state.activeChat?.id === g.id ? ' active' : '');
            div.innerHTML = `
                <div class="avatar">#</div>
                <div class="info">
                    <div class="name">${escapeHtml(g.name)}</div>
                    <div class="sub">${g.memberCount} members</div>
                </div>
            `;
            div.onclick = () => openChat({ type: 'group', id: g.id, name: g.name });
            list.appendChild(div);
        });
        if (state.groups.length === 0) {
            list.innerHTML = '<div style="padding:16px;color:var(--text-sub);font-size:13px;text-align:center;">No groups created.</div>';
        }
    } else if (state.activeTab === 'admin') {
        renderAdminPanel();
    }
}

// Search Results Rendering
function renderSearchResults(results) {
    const list = $('sidebarList');
    list.innerHTML = '';
    results.forEach(u => {
        const div = document.createElement('div');
        div.className = 'list-item';

        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'avatar';
        renderAvatarEl(avatarDiv, u.displayName, u.avatarUrl);
        div.appendChild(avatarDiv);

        const infoDiv = document.createElement('div');
        infoDiv.className = 'info';
        infoDiv.innerHTML = `
            <div class="name">${escapeHtml(u.displayName)}</div>
            <div class="sub">@${escapeHtml(u.userName)} ${u.isContact ? '· contact' : ''} ${u.isBlocked ? '· blocked' : ''}</div>
        `;
        div.appendChild(infoDiv);

        const actBtn = document.createElement('button');
        actBtn.className = 'btn btn-sm';
        actBtn.textContent = u.isContact ? 'Added' : 'Add';
        if (u.isContact) actBtn.disabled = true;

        actBtn.onclick = async (e) => {
            e.stopPropagation();
            if (u.isContact) return;
            try {
                await api(`/api/contacts/${u.userId}`, { method: 'POST' });
                toast('Contact added.', 'success');
                $('userSearch').value = '';
                await loadContacts();
                renderSidebar();
            } catch (err) { toast(err.message, 'error'); }
        };
        div.appendChild(actBtn);

        div.onclick = () => openChat({ type: 'private', id: u.userId, name: u.displayName });
        list.appendChild(div);
    });
}

/* ==========================================================================
   7. CHAT FLOW & CONVERSATION ROOM MANAGEMENT
   ========================================================================== */

// Open Chat conversation window
async function openChat(target) {
    state.activeChat = target;
    state.messages = [];
    state.oldestCursor = null;
    state.pendingAttachment = null;
    state.replyingTo = null;
    state.editingMessage = null;

    if (target.type === 'private') {
        const contact = state.contacts.find(c => c.userId === target.id);
        if (contact && contact.unreadCount > 0) {
            contact.unreadCount = 0;
            renderSidebar();
        }
    }

    const pane = $('chatPane');
    pane.innerHTML = `
        <div class="chat-header">
            <div class="chat-header-info">
                <h2>${escapeHtml(target.name)}</h2>
                <div class="chat-header-status" id="chatHeaderStatus">loading details...</div>
            </div>
            <div class="header-actions">
                <button class="header-menu-trigger" id="btnHeaderMenu" title="More Options">
                    <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
                <div class="header-menu-dropdown" id="headerMenuDropdown">
                    <a id="menuViewInfo">View Info</a>
                    <a id="menuSearchMessages">Search Messages</a>
                    ${target.type === 'private' ? `
                        <a id="menuBlock">Block User</a>
                        <a id="menuUnblock">Unblock User</a>
                    ` : ''}
                    <a id="menuClearHistory">Clear History</a>
                    <a id="menuDeleteChat" class="danger">Delete Chat</a>
                </div>
            </div>
        </div>

        <!-- Pinned Message Bar -->
        <div class="pinned-message-bar" id="pinnedMessageBar">
            <div class="pinned-border"></div>
            <div class="pinned-content" id="pinnedContent">
                <div class="pinned-title">Pinned Message</div>
                <div class="pinned-text" id="pinnedText"></div>
            </div>
            <button class="pinned-close" id="btnUnpinMsg" title="Unpin message">&times;</button>
        </div>

        <div class="messages" id="messagesArea"></div>
        
        <div class="chat-input-container">
            <div class="chat-input-wrapper">
                <!-- Replying preview bar -->
                <div class="reply-preview-bar" id="replyPreviewBar">
                    <div class="reply-preview-border"></div>
                    <div class="reply-preview-content">
                        <div class="reply-preview-title" id="replyPreviewTitle">Replying to User</div>
                        <div class="reply-preview-text" id="replyPreviewText">Hello...</div>
                    </div>
                    <button class="reply-preview-close" id="btnCancelReply">&times;</button>
                </div>

                <!-- Editing preview bar -->
                <div class="reply-preview-bar" id="editPreviewBar">
                    <div class="reply-preview-border" style="background-color: #2ecc71;"></div>
                    <div class="reply-preview-content">
                        <div class="reply-preview-title" style="color: #2ecc71;">Editing Message</div>
                        <div class="reply-preview-text" id="editPreviewText">Hello...</div>
                    </div>
                    <button class="reply-preview-close" id="btnCancelEdit">&times;</button>
                </div>

                <!-- Attachment preview bar -->
                <div class="attachment-preview-bar" id="attachmentPreviewBar">
                    <span class="attachment-preview-icon"></span>
                    <span class="attachment-preview-name" id="attachmentPreviewName"></span>
                    <button class="attachment-preview-remove" id="btnRemoveAttachment">Remove</button>
                </div>
                
                <div class="chat-input-row">
                    <input type="file" id="fileAttachmentInput" style="display:none;" />
                    <label class="upload-btn-label" for="fileAttachmentInput" title="Attach file">
                        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </label>
                    <button class="emoji-trigger-btn" id="btnEmojiTrigger" type="button" title="Emojis" onclick="toggleEmojiPicker(event)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor" class="bi bi-emoji-smile-fill" viewBox="0 0 16 16">
                    <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16M7 6.5C7 7.328 6.552 8 6 8s-1-.672-1-1.5S5.448 5 6 5s1 .672 1 1.5M4.285 9.567a.5.5 0 0 1 .683.183A3.5 3.5 0 0 0 8 11.5a3.5 3.5 0 0 0 3.032-1.75.5.5 0 1 1 .866.5A4.5 4.5 0 0 1 8 12.5a4.5 4.5 0 0 1-3.898-2.25.5.5 0 0 1 .183-.683M10 8c-.552 0-1-.672-1-1.5S9.448 5 10 5s1 .672 1 1.5S10.552 8 10 8"/></svg>
                </button>
                    <textarea id="msgInput" placeholder="Write a message..."></textarea>
                    <button class="btn-send-msg" id="btnSend">
                        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Setup Header Action Dropdowns
    const presence = target.type === 'private' ? (state.presenceMap[target.id] || 'Offline') : 'Group';
    $('chatHeaderStatus').textContent = target.type === 'private' ? presence : 'loading details...';

    if (target.type === 'private') {
        $('menuBlock').onclick = async (e) => {
            e.stopPropagation();
            $('headerMenuDropdown').classList.remove('active');
            try {
                await api(`/api/contacts/block/${target.id}`, { method: 'POST' });
                toast('User blocked.', 'success');
            } catch (e) { toast(e.message, 'error'); }
        };
        $('menuUnblock').onclick = async (e) => {
            e.stopPropagation();
            $('headerMenuDropdown').classList.remove('active');
            try {
                await api(`/api/contacts/block/${target.id}`, { method: 'DELETE' });
                toast('User unblocked.', 'success');
            } catch (e) { toast(e.message, 'error'); }
        };
    } else {
        api(`/api/groups/${target.id}`).then(g => {
            $('chatHeaderStatus').textContent = `${g.members.length} members`;
        }).catch(() => {
            $('chatHeaderStatus').textContent = 'Group';
        });
    }

    $('menuViewInfo').onclick = (e) => {
        e.stopPropagation();
        $('headerMenuDropdown').classList.remove('active');
        openInfoPanel(target);
    };

    $('menuSearchMessages').onclick = (e) => {
        e.stopPropagation();
        $('headerMenuDropdown').classList.remove('active');
        toggleSearchOverlay();
    };

    $('menuClearHistory').onclick = (e) => {
        e.stopPropagation();
        $('headerMenuDropdown').classList.remove('active');
        clearChatHistory(target);
    };

    $('menuDeleteChat').onclick = (e) => {
        e.stopPropagation();
        $('headerMenuDropdown').classList.remove('active');
        deleteChat(target);
    };

    $('btnHeaderMenu').onclick = (e) => {
        e.stopPropagation();
        $('headerMenuDropdown').classList.toggle('active');
    };

    $('btnSend').onclick = sendMessage;
    
    $('msgInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    $('msgInput').addEventListener('input', handleInputTyping);

    $('fileAttachmentInput').onchange = uploadAttachment;
    $('btnRemoveAttachment').onclick = () => {
        state.pendingAttachment = null;
        $('attachmentPreviewBar').classList.remove('active');
        $('fileAttachmentInput').value = '';
    };

    $('btnCancelReply').onclick = () => {
        state.replyingTo = null;
        $('replyPreviewBar').classList.remove('active');
    };

    $('btnCancelEdit').onclick = () => {
        state.editingMessage = null;
        $('editPreviewBar').classList.remove('active');
        $('msgInput').value = '';
    };

    await loadMessageHistory();
    markIncomingMessagesAsSeen();
    updatePinnedMessageBar();
    renderSidebar();
}

// Fetch historical messages from backend paginated cursors
async function loadMessageHistory() {
    const t = state.activeChat;
    if (!t) return;
    const path = t.type === 'private'
        ? `/api/messages/private/${t.id}${state.oldestCursor ? `?cursor=${state.oldestCursor}` : ''}`
        : `/api/messages/group/${t.id}${state.oldestCursor ? `?cursor=${state.oldestCursor}` : ''}`;

    try {
        const page = await api(path);
        state.hasMore = page.nextCursor !== null;
        state.oldestCursor = page.nextCursor;
        state.messages = [...page.items, ...state.messages];
        renderMessages(true);
    } catch (e) { toast(e.message, 'error'); }
}

// Mark all unread incoming private messages in the current chat as seen
function markIncomingMessagesAsSeen() {
    const chat = state.activeChat;
    if (!chat || chat.type !== 'private' || !state.connection) return;

    state.messages.forEach(m => {
        // Only mark messages sent TO me that haven't been seen yet
        if (m.senderId !== state.me.userId && m.recipientId === state.me.userId && !m.isSeen) {
            console.log("History loaded - invoking MarkSeen for messageId:", m.id);
            state.connection.invoke('MarkSeen', m.id).catch(err => console.error("MarkSeen error:", err));
        }
    });
}

/* ==========================================================================
   8. CHAT MESSAGE RENDERING & MESSAGE ACTIONS
   ========================================================================== */

// Renders the messages in the main messages window pane
function renderMessages(scrollToBottom = true) {
    const area = $('messagesArea');
    if (!area) return;
    const prevScrollHeight = area.scrollHeight;
    area.innerHTML = '';

    if (state.hasMore) {
        const btn = document.createElement('button');
        btn.className = 'load-older';
        btn.textContent = 'Load older messages';
        btn.onclick = loadMessageHistory;
        area.appendChild(btn);
    }

    let lastDateKey = null;

    state.messages.forEach(m => {
        // Date separations
        const dateKey = toLocalDateKey(m.sentAtUtc);
        if (dateKey && dateKey !== lastDateKey) {
            lastDateKey = dateKey;
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.innerHTML = `<span>${formatDateLabel(dateKey)}</span>`;
            area.appendChild(sep);
        }
        
        // Message line row wrapper
        const row = document.createElement('div');
        const isMine = m.senderId === state.me.userId;
        row.className = 'message-row ' + (isMine ? 'outgoing' : 'incoming');
        row.id = `msgrow-${m.id}`;

        // File attachments layout
        let attachmentHtml = '';
        if (m.attachmentUrl) {
            if (m.attachmentType === 'image') {
                attachmentHtml = `
                    <div class="attachment-container">
                        <img src="${m.attachmentUrl}" class="image-attachment" alt="Attached photo" onclick="window.open('${m.attachmentUrl}', '_blank')" />
                    </div>
                `;
            } else {
                attachmentHtml = `
                    <div class="attachment-container">
                        <a href="${m.attachmentUrl}" class="file-attachment" download="${escapeHtml(m.attachmentFileName)}">
                            <span class="file-icon"></span>
                            <div class="file-info">
                                <div class="file-name">${escapeHtml(m.attachmentFileName)}</div>
                                <div class="file-size">Download file</div>
                            </div>
                        </a>
                    </div>
                `;
            }
        }

        // Display sender profile photo for group incoming rows
        if (!isMine && state.activeChat?.type === 'group') {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'message-avatar';
            renderAvatarEl(avatarDiv, m.senderDisplayName, m.senderAvatarUrl);
            row.appendChild(avatarDiv);
        }

        // Bubble structure wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'message-bubble-wrapper';

        const bubble = document.createElement('div');
        bubble.className = 'msgchat-bubble';

        // Parse reply notation prefix >>reply:id:sender:snippet<<ActualText
        let textContent = m.content;
        let replyRefHtml = '';
        const replyRegex = /^>>reply:(\d+):([^:]+):([^<]*)<<([\s\S]*)$/;
        const match = textContent.match(replyRegex);
        if (match) {
            const parentId = match[1];
            const parentSender = match[2];
            const parentSnippet = match[3];
            textContent = match[4];

            replyRefHtml = `
                <div class="bubble-reply-ref" onclick="scrollToMessage(${parentId})">
                    <div class="reply-sender">${escapeHtml(parentSender)}</div>
                    <div>${escapeHtml(parentSnippet)}</div>
                </div>
            `;
        }

        const editedBadge = m.isEdited ? `<span class="edited-badge">edited</span>` : '';
        const seenMark = isMine
            ? `<span class="seen-check ${m.isSeen ? 'seen' : ''}" title="${m.isSeen ? 'Seen' : 'Sent'}">
                <svg viewBox="0 0 18 18" width="14" height="14"><path fill="currentColor" d="M17.394 5.035l-.57-.444a.434.434 0 00-.609.076L8.97 15.239l-3.838-4.84a.434.434 0 00-.609-.076l-.57.444a.434.434 0 00-.076.609l4.53 5.713a.435.435 0 00.683 0L17.47 5.644a.434.434 0 00-.076-.609z"/></svg>
              </span>`
            : '';
            
        const senderLabel = isMine ? 'You' : (m.senderDisplayName || 'Unknown');
        bubble.innerHTML = `
            <div class="bubble-sender">${escapeHtml(senderLabel)}</div>
            ${replyRefHtml}
            <div class="bubble-text">
                ${textContent ? `<div>${escapeHtml(textContent)}</div>` : ''}
                ${attachmentHtml}
            </div>
            <div class="bubble-meta">${editedBadge}${formatTime(m.sentAtUtc)}${seenMark}</div>
        `;
        wrapper.appendChild(bubble);

        // Right-Click Context Menu Button
        const menuBtn = document.createElement('button');
        menuBtn.className = 'msg-menu-btn';
        menuBtn.title = 'Message Actions';
        menuBtn.innerHTML = `
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        `;
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            showContextMenu(e, m);
        };
        wrapper.appendChild(menuBtn);

        row.appendChild(wrapper);
        area.appendChild(row);
    });

    if (scrollToBottom && state.oldestCursor === null) {
        area.scrollTop = area.scrollHeight;
    } else {
        area.scrollTop = area.scrollHeight - prevScrollHeight;
    }
}

// Right-click menu position clamp calculations
function showContextMenu(e, m) {
    const menu = $('msgContextMenu');
    menu.classList.add('active');

    // Bind action events
    $('msgCtxReply').onclick = () => { initiateReply(m); menu.classList.remove('active'); };

    $('msgCtxCopy').onclick = () => {
        let textToCopy = m.content;
        if (textToCopy.startsWith('>>reply:')) {
            textToCopy = textToCopy.split('<<').slice(1).join('<<');
        }
        navigator.clipboard.writeText(textToCopy);
        toast('Message copied to clipboard.', 'success');
        menu.classList.remove('active');
    };

    $('msgCtxPin').onclick = () => {
        pinMessage(m);
        menu.classList.remove('active');
    };

    const isMine = m.senderId === state.me.userId;
    if (isMine && !m.isDeleted) {
        $('msgCtxEdit').style.display = 'flex';
        $('msgCtxEdit').onclick = () => { initiateEdit(m); menu.classList.remove('active'); };
    } else {
        $('msgCtxEdit').style.display = 'none';
    }

    if (isMine && !m.isDeleted) {
        $('msgCtxDelete').style.display = 'flex';
        $('msgCtxDelete').onclick = () => { deleteMessage(m.id); menu.classList.remove('active'); };
    } else {
        $('msgCtxDelete').style.display = 'none';
    }

    // Positions contextual container safely inside window client frames
    const menuRect = menu.getBoundingClientRect();
    const margin = 8;
    let top = e.clientY;
    let left = e.clientX;

    if (left + menuRect.width + margin > window.innerWidth) {
        left = window.innerWidth - menuRect.width - margin;
    }
    if (top + menuRect.height + margin > window.innerHeight) {
        top = window.innerHeight - menuRect.height - margin;
    }
    left = Math.max(margin, left);
    top = Math.max(margin, top);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

// Smooth scroll search highlighting animation
function scrollToMessage(id) {
    const el = $(`msgrow-${id}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background-color 0.5s ease';
        el.style.backgroundColor = 'rgba(82, 136, 193, 0.15)';
        setTimeout(() => {
            el.style.backgroundColor = '';
        }, 1200);
    } else {
        toast('Message not found in loaded history.', 'info');
    }
}

// Local storage pinned message state sync
function updatePinnedMessageBar() {
    const bar = $('pinnedMessageBar');
    if (!bar) return;
    if (!state.activeChat) {
        bar.classList.remove('active');
        return;
    }
    const key = `${state.activeChat.type}:${state.activeChat.id}`;
    const pinned = state.pinnedMessages[key];
    if (pinned) {
        $('pinnedText').textContent = pinned.content;
        bar.classList.add('active');
        $('pinnedContent').onclick = () => scrollToMessage(pinned.id);
        $('btnUnpinMsg').onclick = (e) => {
            e.stopPropagation();
            unpinMessage(key);
        };
    } else {
        bar.classList.remove('active');
    }
}

function pinMessage(m) {
    if (!state.activeChat) return;
    const key = `${state.activeChat.type}:${state.activeChat.id}`;
    let snippet = m.content || '[Attachment]';
    if (snippet.startsWith('>>reply:')) {
        snippet = snippet.split('<<').slice(1).join('<<');
    }
    state.pinnedMessages[key] = {
        id: m.id,
        content: snippet,
        senderName: m.senderDisplayName
    };
    localStorage.setItem('chatapp_pinned', JSON.stringify(state.pinnedMessages));
    updatePinnedMessageBar();
    toast('Message pinned successfully.', 'success');
}

function unpinMessage(key) {
    delete state.pinnedMessages[key];
    localStorage.setItem('chatapp_pinned', JSON.stringify(state.pinnedMessages));
    updatePinnedMessageBar();
    toast('Message unpinned.', 'info');
}

// Initiate Reply Sequence
function initiateReply(m) {
    let snippet = m.content || '[Attachment]';
    if (snippet.startsWith('>>reply:')) {
        snippet = snippet.split('<<').slice(1).join('<<');
    }
    state.replyingTo = {
        id: m.id,
        senderName: m.senderDisplayName,
        snippet: snippet.substring(0, 50)
    };
    state.editingMessage = null;
    $('editPreviewBar').classList.remove('active');

    $('replyPreviewTitle').textContent = `Reply to ${m.senderDisplayName}`;
    $('replyPreviewText').textContent = snippet;
    $('replyPreviewBar').classList.add('active');
    $('msgInput').focus();
}

// Initiate Edit Sequence
function initiateEdit(m) {
    let text = m.content;
    if (text.startsWith('>>reply:')) {
        text = text.split('<<').slice(1).join('<<');
    }
    state.editingMessage = m;
    state.replyingTo = null;
    $('replyPreviewBar').classList.remove('active');

    $('editPreviewText').textContent = text;
    $('editPreviewBar').classList.add('active');
    $('msgInput').value = text;
    $('msgInput').focus();
}

// Delete Message Call
async function deleteMessage(id) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
        await state.connection.invoke('DeleteMessage', id);
        toast('Message deleted.', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

// Send Message Payload
async function sendMessage() {
    const input = $('msgInput');
    let content = input.value.trim();
    const attachment = state.pendingAttachment;

    if (!content && !attachment) return;
    if (!state.activeChat) return;

    if (state.editingMessage) {
        try {
            await state.connection.invoke('EditMessage', state.editingMessage.id, content);
            input.value = '';
            state.editingMessage = null;
            $('editPreviewBar').classList.remove('active');
        } catch (e) { toast(e.message, 'error'); }
        return;
    }

    if (state.replyingTo) {
        content = `>>reply:${state.replyingTo.id}:${state.replyingTo.senderName}:${state.replyingTo.snippet}<<${content}`;
    }

    try {
        const attachmentUrl = attachment ? attachment.url : null;
        const attachmentFileName = attachment ? attachment.fileName : null;
        const attachmentType = attachment ? attachment.attachmentType : null;

        if (state.activeChat.type === 'private') {
            await state.connection.invoke('SendPrivateMessage', state.activeChat.id, content, attachmentUrl, attachmentFileName, attachmentType);
        } else {
            await state.connection.invoke('SendGroupMessage', state.activeChat.id, content, attachmentUrl, attachmentFileName, attachmentType);
        }
        
        input.value = '';
        state.pendingAttachment = null;
        state.replyingTo = null;
        $('replyPreviewBar').classList.remove('active');
        $('attachmentPreviewBar').classList.remove('active');
        $('fileAttachmentInput').value = '';

        if (localIsTyping) {
            localIsTyping = false;
            clearTimeout(stopTypingTimeout);
            state.connection.invoke('SendTyping', state.activeChat.type, state.activeChat.id.toString(), false)
                .catch(err => console.error(err));
        }
    } catch (e) { toast(e.message, 'error'); }
}

/* ==========================================================================
   9. POPUPS, MODALS & SETTINGS PANELS
   ========================================================================== */

// Upload File Attachments
async function uploadAttachment(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
        toast('Uploading file...', 'info');
        const headers = {};
        if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
        
        const res = await fetch(`${API_BASE}/api/messages/upload`, {
            method: 'POST',
            headers,
            body: formData
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Upload failed');
        }

        const data = await res.json();
        state.pendingAttachment = data; // { url, fileName, attachmentType }
        
        $('attachmentPreviewName').textContent = file.name;
        $('attachmentPreviewBar').classList.add('active');
        toast('File uploaded.', 'success');
    } catch (err) {
        toast(err.message, 'error');
        $('fileAttachmentInput').value = '';
    }
}

// Edit Profile settings modal
function showEditProfileModal() {
    const content = $('modalContent');
    content.innerHTML = `
        <h2>Profile Settings</h2>
        
        <div class="profile-avatar-upload">
            <div class="avatar profile-avatar-preview" id="profileAvatarPreview"></div>
            <input type="file" id="profileAvatarFileInput" style="display:none;" />
            <button class="btn btn-secondary btn-sm" onclick="$('profileAvatarFileInput').click()">Upload Photo</button>
        </div>

        <div class="form-group">
            <label>Display Name</label>
            <input type="text" id="profileDisplayName" value="${escapeHtml(state.me.displayName)}" required />
        </div>
        
        <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="profileEmail" value="${escapeHtml(state.me.email || '')}" required />
        </div>

        <div class="form-group">
            <label>New Password (leave blank to keep current)</label>
            <input type="password" id="profilePassword" placeholder="Minimum 6 characters" />
        </div>

        <div class="form-group">
            <label>Presence Status</label>
            <select id="presenceSelect">
                <option value="Online">Online</option>
                <option value="Away">Away</option>
                <option value="DoNotDisturb">Do Not Disturb</option>
            </select>
        </div>

        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn" id="btnSaveProfile">Save Changes</button>
        </div>
    `;

    let selectedAvatarUrl = state.me.avatarUrl || null;
    renderAvatarEl($('profileAvatarPreview'), state.me.displayName, selectedAvatarUrl);

    const activeStatus = state.presenceMap[state.me.userId] || 'Online';
    $('presenceSelect').value = activeStatus;

    if (!state.me.email) {
        api('/api/auth/me').then(me => {
            state.me.email = me.email;
            $('profileEmail').value = me.email || '';
        }).catch(() => {});
    }

    $('profileAvatarFileInput').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            toast('Uploading avatar...', 'info');
            const headers = {};
            if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
            
            const res = await fetch(`${API_BASE}/api/messages/upload`, {
                method: 'POST',
                headers,
                body: formData
            });

            if (!res.ok) throw new Error('Avatar upload failed');
            const data = await res.json();
            
            selectedAvatarUrl = data.url;
            renderAvatarEl($('profileAvatarPreview'), $('profileDisplayName').value, selectedAvatarUrl);
            toast('Avatar updated.', 'success');
        } catch (err) {
            toast(err.message, 'error');
        }
    };

    $('btnSaveProfile').onclick = async () => {
        const displayName = $('profileDisplayName').value.trim();
        const email = $('profileEmail').value.trim();
        const password = $('profilePassword').value;
        const statusVal = $('presenceSelect').value;

        if (!displayName || !email) {
            return toast('Name and email are required.', 'error');
        }

        try {
            const updated = await api('/api/auth/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    displayName,
                    email,
                    password: password || null,
                    avatarUrl: selectedAvatarUrl
                })
            });

            state.me.displayName = updated.displayName;
            state.me.email = updated.email;
            state.me.avatarUrl = updated.avatarUrl;

            const valMap = { 'Offline': 0, 'Online': 1, 'Away': 2, 'DoNotDisturb': 3 };
            await state.connection.invoke('SetPresence', valMap[statusVal]);

            toast('Profile updated successfully.', 'success');
            closeModal();
            updateDrawerProfile();
            renderSidebar();
        } catch (err) {
            toast(err.message, 'error');
        }
    };

    $('modalBackdrop').classList.add('active');
}

// Read-only My Profile Panel
function showProfilePanel() {
    const m = state.me;
    if (!m) return;
    const content = $('modalContent');
    const avatarHtml = m.avatarUrl ? `background-image:url(${m.avatarUrl});background-size:cover;background-position:center;` : '';
    const initLetter = initials(m.displayName);
    const status = state.presenceMap[m.userId] || 'Online';
    
    content.innerHTML = `
        <h2>My Profile</h2>
        
        <div class="profile-avatar-upload">
            <div class="avatar profile-avatar-preview" id="profileAvatarPreview" style="${avatarHtml}">${m.avatarUrl ? '' : initLetter}</div>
        </div>

        <div class="form-group">
            <label>Display Name</label>
            <input type="text" value="${escapeHtml(m.displayName)}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
        </div>
        
        <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="profileEmailReadOnly" value="${escapeHtml(m.email || '—')}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
        </div>

        <div class="form-group">
            <label>Username</label>
            <input type="text" value="@${escapeHtml(m.userName)}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
        </div>

        <div class="form-group">
            <label>Presence Status</label>
            <select disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;">
                <option value="${status}">${status}</option>
            </select>
        </div>

        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            <button class="btn" onclick="closeModal(); showEditProfileModal();">Edit Profile</button>
        </div>
    `;
    if (!m.email) {
        api('/api/auth/me').then(me => {
            state.me.email = me.email;
            const el = $('profileEmailReadOnly');
            if (el) el.value = me.email || '—';
        }).catch(() => {});
    }
    $('modalBackdrop').classList.add('active');
}

// Side Info Chat/Contact Settings modal panel
function showChatSettingsPanel(target) {
    const content = $('modalContent');
    if (target.type === 'private') {
        const contact = state.contacts.find(c => c.userId === target.id) || {};
        const status = state.presenceMap[target.id] || 'Offline';
        const avatarHtml = contact.avatarUrl ? `background-image:url(${contact.avatarUrl});background-size:cover;background-position:center;` : '';
        
        content.innerHTML = `
            <h2>Contact Settings</h2>
            
            <div class="profile-avatar-upload">
                <div class="avatar profile-avatar-preview" id="contactAvatarPreview" style="${avatarHtml}">${contact.avatarUrl ? '' : initials(target.name)}</div>
            </div>

            <div class="form-group">
                <label>Display Name</label>
                <input type="text" value="${escapeHtml(target.name)}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
            </div>

            <div class="form-group">
                <label>Username</label>
                <input type="text" value="@${escapeHtml(contact.userName || '—')}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
            </div>

            <div class="form-group">
                <label>Presence Status</label>
                <select disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;">
                    <option value="${status}">${status}</option>
                </select>
            </div>

            <div class="form-group">
                <label>Contact Since</label>
                <input type="text" value="${contact.addedAtUtc ? new Date(contact.addedAtUtc + 'Z').toLocaleDateString() : '—'}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
            </div>

            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `;
    } else {
        api(`/api/groups/${target.id}`).then(g => {
            content.innerHTML = `
                <h2>Group Settings</h2>
                
                <div class="profile-avatar-upload">
                    <div class="avatar profile-avatar-preview" style="font-size:28px;">#</div>
                </div>

                <div class="form-group">
                    <label>Group Name</label>
                    <input type="text" value="${escapeHtml(g.name)}" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
                </div>

                <div class="form-group">
                    <label>Member Count</label>
                    <input type="text" value="${g.memberCount} members" disabled style="background-color: var(--input-bg); opacity: 0.8; cursor: not-allowed;" />
                </div>

                <div class="form-group">
                    <label>Members (First 5)</label>
                    <div style="background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px;">
                        ${g.members.slice(0, 5).map(m => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                                <span style="font-size:13px; color:var(--text-main); font-weight:500;">${escapeHtml(m.displayName)}${m.isAdmin ? ' <span class="badge badge-admin" style="margin-left:4px;">Admin</span>' : ''}</span>
                                <span style="font-size:11px; color:var(--text-sub);">${m.presenceStatus || 'Offline'}</span>
                            </div>
                        `).join('')}
                        ${g.memberCount > 5 ? `<div style="font-size:12px; color:var(--text-sub); margin-top: 6px;">+ ${g.memberCount - 5} more members</div>` : ''}
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                    <button class="btn" id="btnManageMembersGroup" style="background-color: var(--msgchat-dark);">Manage Members</button>
                    <button class="btn btn-danger" id="btnLeaveGroupPanel">Leave Group</button>
                </div>
            `;
            
            $('btnManageMembersGroup').onclick = () => {
                closeModal();
                showGroupInfoModal(target.id);
            };
            
            $('btnLeaveGroupPanel').onclick = async () => {
                try {
                    await api(`/api/groups/${target.id}/members/${state.me.userId}`, { method: 'DELETE' });
                    toast('Left group.', 'success');
                    closeModal();
                    await loadGroups();
                    state.activeChat = null;
                    $('chatPane').innerHTML = '<div class="empty-state">Select a contact or group to start chatting.</div>';
                    renderSidebar();
                } catch (e) { toast(e.message, 'error'); }
            };
        }).catch(e => toast(e.message, 'error'));
        content.innerHTML = `<div class="profile-panel"><div style="padding:40px;text-align:center;color:var(--text-sub);">Loading...</div></div>`;
    }
    $('modalBackdrop').classList.add('active');
}

// Application settings modal panel
function showSettingsModal() {
    const content = $('modalContent');
    const isDark = document.body.classList.contains('dark-theme');
    content.innerHTML = `
        <h2>Settings</h2>
        <div class="settings-section">
            <div class="settings-section-title">Appearance</div>
            <div class="form-group">
                <label>Theme</label>
                <select id="settingsTheme">
                    <option value="light" ${!isDark ? 'selected' : ''}>Light</option>
                    <option value="dark" ${isDark ? 'selected' : ''}>Dark</option>
                </select>
            </div>
            <div class="form-group">
                <label>Message Font Size</label>
                <select id="settingsFontSize">
                    <option value="13px">Small</option>
                    <option value="14px" selected>Medium</option>
                    <option value="16px">Large</option>
                </select>
            </div>
        </div>
        <div class="settings-section">
            <div class="settings-section-title">Account</div>
            <div class="form-group">
                <label>Presence Status</label>
                <select id="settingsPresence">
                    <option value="Online">Online</option>
                    <option value="Away">Away</option>
                    <option value="DoNotDisturb">Do Not Disturb</option>
                </select>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn" id="btnSaveSettings">Save Settings</button>
        </div>
    `;
    const activeStatus = state.presenceMap[state.me?.userId] || 'Online';
    $('settingsPresence').value = activeStatus;
    const savedSize = localStorage.getItem('msg_font_size') || '14px';
    $('settingsFontSize').value = savedSize;
    
    $('btnSaveSettings').onclick = async () => {
        const theme = $('settingsTheme').value;
        const fontSize = $('settingsFontSize').value;
        const presence = $('settingsPresence').value;
        
        if (theme === 'dark') {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            localStorage.setItem('night_mode', 'true');
        } else {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            localStorage.setItem('night_mode', 'false');
        }
        document.documentElement.style.setProperty('--msg-font-size', fontSize);
        localStorage.setItem('msg_font_size', fontSize);
        if (state.connection && state.me) {
            const valMap = { 'Offline': 0, 'Online': 1, 'Away': 2, 'DoNotDisturb': 3 };
            try { await state.connection.invoke('SetPresence', valMap[presence]); } catch {}
        }
        toast('Settings saved.', 'success');
        closeModal();
    };
    $('modalBackdrop').classList.add('active');
}

// Render Group Details and Member Management Modal
async function showGroupInfoModal(groupId) {
    try {
        const g = await api(`/api/groups/${groupId}`);
        const content = $('modalContent');
        content.innerHTML = `
            <h2>${escapeHtml(g.name)}</h2>
            <div style="margin-bottom:20px; max-height: 250px; overflow-y: auto;">
                ${g.members.map(m => `
                    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-color);">
                        <div class="avatar" id="membAvatar-${m.userId}" style="width:30px;height:30px;font-size:11px;"></div>
                        <div style="flex:1;">
                            ${escapeHtml(m.displayName)} 
                            ${m.isAdmin ? '<span class="badge badge-admin">Admin</span>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="form-group">
                <label>Add Member</label>
                <select id="addMemberSelect">
                    <option value="">-- select contact --</option>
                    ${state.contacts.filter(c => !g.members.some(m => m.userId === c.userId)).map(c => `
                        <option value="${c.userId}">${escapeHtml(c.displayName)}</option>
                    `).join('')}
                </select>
            </div>
            <div class="modal-actions">
                <button class="btn btn-danger" id="btnLeaveGroup">Leave Group</button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
                <button class="btn" id="btnAddMember">Add</button>
            </div>
        `;

        g.members.forEach(m => {
            renderAvatarEl($(`membAvatar-${m.userId}`), m.displayName, m.avatarUrl);
        });

        $('modalBackdrop').classList.add('active');

        $('btnAddMember').onclick = async () => {
            const userId = $('addMemberSelect').value;
            if (!userId) return;
            try {
                await api(`/api/groups/${groupId}/members`, {
                    method: 'POST',
                    body: JSON.stringify({ userId })
                });
                toast('Member added.', 'success');
                closeModal();
            } catch (e) { toast(e.message, 'error'); }
        };

        $('btnLeaveGroup').onclick = async () => {
            try {
                await api(`/api/groups/${groupId}/members/${state.me.userId}`, { method: 'DELETE' });
                toast('Left group.', 'success');
                closeModal();
                await loadGroups();
                state.activeChat = null;
                $('chatPane').innerHTML = '<div class="empty-state">Select a contact or group to start chatting.</div>';
                renderSidebar();
            } catch (e) { toast(e.message, 'error'); }
        };
    } catch (e) { toast(e.message, 'error'); }
}

// Create Group Modal
function openNewGroupModal() {
    const content = $('modalContent');
    content.innerHTML = `
        <h2>Create Group</h2>
        <div class="form-group">
            <label>Group Name</label>
            <input type="text" id="newGroupName" required />
        </div>
        <div class="form-group">
            <label>Select Members</label>
            <div class="checkbox-list" id="memberCheckList">
                ${state.contacts.map(c => `
                    <label>
                        <input type="checkbox" value="${c.userId}" />
                        ${escapeHtml(c.displayName)}
                    </label>
                `).join('') || '<div style="color:var(--text-sub);font-size:13px;">No contacts to add.</div>'}
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn" id="btnCreateGroup">Create</button>
        </div>
    `;
    $('modalBackdrop').classList.add('active');

    $('btnCreateGroup').onclick = async () => {
        const name = $('newGroupName').value.trim();
        if (!name) return toast('Name required', 'error');
        const ids = [...document.querySelectorAll('#memberCheckList input:checked')].map(i => i.value);
        try {
            await api('/api/groups', {
                method: 'POST',
                body: JSON.stringify({ name, initialMemberIds: ids })
            });
            toast('Group created.', 'success');
            closeModal();
            await loadGroups();
            renderSidebar();
        } catch (e) { toast(e.message, 'error'); }
    };
}

// Bulk messaging modal panel
function openBulkMsgModal() {
    const content = $('modalContent');
    content.innerHTML = `
        <h2>Bulk Message</h2>
        <p style="font-size:12px;color:var(--text-sub);margin-bottom:16px;">Each recipient receives this as a separate private message thread.</p>
        <div class="form-group">
            <label>Recipients</label>
            <div class="checkbox-list" id="bulkCheckList">
                ${state.contacts.map(c => `
                    <label>
                        <input type="checkbox" value="${c.userId}" />
                        ${escapeHtml(c.displayName)}
                    </label>
                `).join('') || '<div style="color:var(--text-sub);font-size:13px;">No contacts available.</div>'}
            </div>
        </div>
        <div class="form-group">
            <label>Message Content</label>
            <textarea id="bulkContent" rows="3" required></textarea>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            <button class="btn" id="btnSendBulk">Send Bulk</button>
        </div>
    `;
    $('modalBackdrop').classList.add('active');

    $('btnSendBulk').onclick = async () => {
        const ids = [...document.querySelectorAll('#bulkCheckList input:checked')].map(i => i.value);
        const content = $('bulkContent').value.trim();
        if (ids.length === 0 || !content) return toast('Recipients and message content are required.', 'error');
        try {
            await state.connection.invoke('SendBulkMessage', ids, content);
            closeModal();
        } catch (e) { toast(e.message, 'error'); }
    };
}

/* ==========================================================================
   10. ADMINISTRATIVE CONTROL PANEL
   ========================================================================== */

// Render admin panel user dashboard list
async function renderAdminPanel() {
    try {
        state.adminUsers = await api('/api/admin/users');
        const list = $('sidebarList');
        list.innerHTML = '<div style="padding:8px 12px 16px;color:var(--text-sub);font-size:12px;">Click a user to manage account status.</div>';
        
        state.adminUsers.forEach(u => {
            const div = document.createElement('div');
            div.className = 'list-item';
            
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'avatar';
            renderAvatarEl(avatarDiv, u.displayName, u.avatarUrl);
            div.appendChild(avatarDiv);

            const infoDiv = document.createElement('div');
            infoDiv.className = 'info';
            infoDiv.innerHTML = `
                <div class="name">${escapeHtml(u.displayName)}
                    ${u.isBanned ? '<span class="badge badge-banned">Banned</span>' : ''}
                    ${u.isAdmin ? '<span class="badge badge-admin">Admin</span>' : ''}
                </div>
                <div class="sub"><span class="presence-dot presence-${u.presenceStatus}"></span>@${escapeHtml(u.userName)}</div>
            `;
            div.appendChild(infoDiv);

            div.onclick = () => showAdminUserModal(u);
            list.appendChild(div);
        });
    } catch (e) { toast(e.message, 'error'); }
}

// User ban/suspension popup details modal
function showAdminUserModal(user) {
    const content = $('modalContent');
    content.innerHTML = `
        <h2>Manage User Account</h2>
        <p style="font-size:13px;color:var(--text-sub);margin-bottom:16px;line-height:1.6;">
            Username: @${escapeHtml(user.userName)}<br>
            Current Status: ${user.presenceStatus}<br>
            Banned Status: ${user.isBanned ? 'Banned - ' + escapeHtml(user.banReason || '') : 'Active'}
        </p>
        ${!user.isBanned ? `
            <div class="form-group">
                <label>Ban Reason</label>
                <input type="text" id="banReason" placeholder="Enter reason for suspension" />
            </div>
            <div class="form-group">
                <label>Suspension Expiry (leave blank for permanent)</label>
                <input type="datetime-local" id="banExpiry" />
            </div>
        ` : ''}
        <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
            ${user.isBanned
                ? `<button class="btn" id="btnUnban">Unban Account</button>`
                : `<button class="btn btn-danger" id="btnBan">Ban Account</button>`}
        </div>
    `;
    $('modalBackdrop').classList.add('active');

    if (user.isBanned) {
        $('btnUnban').onclick = async () => {
            try {
                await api(`/api/admin/unban/${user.userId}`, { method: 'POST' });
                toast('User account reinstated.', 'success');
                closeModal();
                renderAdminPanel();
            } catch (e) { toast(e.message, 'error'); }
        };
    } else {
        $('btnBan').onclick = async () => {
            const reason = $('banReason').value.trim() || 'Terms violation';
            const exp = $('banExpiry').value;
            try {
                await api(`/api/admin/ban/${user.userId}`, {
                    method: 'POST',
                    body: JSON.stringify({
                        reason,
                        expiresAtUtc: exp ? new Date(exp).toISOString() : null
                    })
                });
                toast('User account suspended and disconnected.', 'success');
                closeModal();
                renderAdminPanel();
            } catch (e) { toast(e.message, 'error'); }
        };
    }
}

/* ==========================================================================
   11. SYSTEM INITIALIZATION SETUP
   ========================================================================== */

function closeModal() {
    $('modalBackdrop').classList.remove('active');
}
window.closeModal = closeModal;

$('modalBackdrop').onclick = (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
};

// Auto-Login and Application Initialize
(async function init() {
    const saved = localStorage.getItem('chatapp_token');
    if (saved) {
        state.token = saved;
        try {
            const me = await api('/api/auth/me');
            state.me = me;
            await enterApp();
        } catch {
            localStorage.removeItem('chatapp_token');
            state.token = null;
        }
    }
})();

/* ==========================================================================
   12. MODERN FRONTEND FEATURES IMPLEMENTATIONS
   ========================================================================== */

// ── Contact / Group Details Slide-out Panel ──
async function openInfoPanel(target) {
    const overlay = $('infoPanelOverlay');
    const panel = $('infoPanel');
    const body = $('infoPanelBody');
    if (!overlay || !panel || !body) return;

    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-sub);">Loading details...</div>';
    overlay.classList.add('active');
    panel.classList.add('active');

    try {
        if (target.type === 'private') {
            const contact = state.contacts.find(c => c.userId === target.id) || {};
            const status = state.presenceMap[target.id] || 'Offline';
            const statusColor = status === 'Online' ? '#4cd48a' : status === 'Away' ? '#f1c40f' : '#95a5a6';
            const avatarBg = contact.avatarUrl
                ? `background-image:url(${contact.avatarUrl});background-size:cover;background-position:center;`
                : '';
            const msgCount = state.messages.filter(m =>
                (m.senderId === target.id || m.recipientId === target.id) && m.attachmentType === 'image'
            ).length;
            const fileCount = state.messages.filter(m =>
                (m.senderId === target.id || m.recipientId === target.id) && m.attachmentUrl && m.attachmentType !== 'image'
            ).length;
            const totalMsgs = state.messages.length;

            body.innerHTML = `
                <!-- Avatar / Identity -->
                <div class="info-panel-section">
                    <div class="info-panel-avatar" style="${avatarBg}">${contact.avatarUrl ? '' : initials(target.name)}</div>
                    <div class="info-panel-name">${escapeHtml(target.name)}</div>
                    <div class="info-panel-status" style="color:${statusColor}">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${statusColor};margin-right:5px;"></span>${status}
                    </div>
                    <div class="info-actions">
                        <button class="info-action-btn" onclick="closeInfoPanel()" title="Go to chat">Message</button>
                        <button class="info-action-btn" id="infoPanelBlockBtn" title="Block/Unblock">Block</button>
                    </div>
                </div>

                <!-- Contact Details -->
                <div class="info-panel-section" style="align-items: flex-start; text-align: left;">
                    <div class="info-panel-label">Username</div>
                    <div class="info-panel-value">@${escapeHtml(contact.userName || '—')}</div>
                    <div class="info-panel-label">Contact Since</div>
                    <div class="info-panel-value" style="margin-bottom: 0;">${contact.addedAtUtc ? new Date(contact.addedAtUtc + 'Z').toLocaleDateString() : '—'}</div>
                </div>

                <!-- Shared Media Stats -->
                <div class="info-panel-section" style="align-items: flex-start; text-align: left; border-bottom: none;">
                    <div class="info-panel-label">Shared Media</div>
                    <div class="info-media-grid">
                        <div class="info-media-stat">
                            <div class="info-media-num">${msgCount}</div>
                            <div class="info-media-lbl">Photos</div>
                        </div>
                        <div class="info-media-stat">
                            <div class="info-media-num">${fileCount}</div>
                            <div class="info-media-lbl">Files</div>
                        </div>
                        <div class="info-media-stat">
                            <div class="info-media-num">${totalMsgs}</div>
                            <div class="info-media-lbl">Messages</div>
                        </div>
                    </div>
                </div>
            `;

            $('infoPanelBlockBtn').onclick = async () => {
                try {
                    await api(`/api/contacts/block/${target.id}`, { method: 'POST' });
                    toast('User blocked.', 'success');
                } catch (e) {
                    try {
                        await api(`/api/contacts/block/${target.id}`, { method: 'DELETE' });
                        toast('User unblocked.', 'success');
                    } catch (err) { toast(err.message, 'error'); }
                }
            };

        } else {
            const g = await api(`/api/groups/${target.id}`);
            const isMeAdmin = g.members.some(m => m.userId === state.me.userId && m.isAdmin);
            const groupMsgCount = state.messages.filter(m => m.groupId === target.id && m.attachmentType === 'image').length;
            const groupFileCount = state.messages.filter(m => m.groupId === target.id && m.attachmentUrl && m.attachmentType !== 'image').length;
            const groupTotalMsgs = state.messages.filter(m => m.groupId === target.id).length;

            body.innerHTML = `
                <div class="info-panel-section">
                    <div class="info-panel-avatar">#</div>
                    <div class="info-panel-name">${escapeHtml(g.name)}</div>
                    <div class="info-panel-status">${g.memberCount} members</div>
                </div>
                <div class="info-panel-section" style="align-items: flex-start; text-align: left;">
                    <div class="info-panel-label">Shared Media</div>
                    <div class="info-media-grid">
                        <div class="info-media-stat">
                            <div class="info-media-num">${groupMsgCount}</div>
                            <div class="info-media-lbl">Photos</div>
                        </div>
                        <div class="info-media-stat">
                            <div class="info-media-num">${groupFileCount}</div>
                            <div class="info-media-lbl">Files</div>
                        </div>
                        <div class="info-media-stat">
                            <div class="info-media-num">${groupTotalMsgs}</div>
                            <div class="info-media-lbl">Messages</div>
                        </div>
                    </div>
                </div>
                <div class="info-panel-section" style="align-items: flex-start; text-align: left;">
                    <div class="info-panel-label">Members</div>
                    <div style="width:100%; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; box-sizing: border-box; max-height: 250px; overflow-y: auto;">
                        ${g.members.map(m => `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
                                <span style="font-size:13px; color:var(--text-main); font-weight:500;">${escapeHtml(m.displayName)}${m.isAdmin ? ' <span class="badge badge-admin" style="margin-left:4px;">Admin</span>' : ''}</span>
                                <span style="font-size:11px; color:var(--text-sub);">${m.presenceStatus || 'Offline'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="info-panel-section" style="border-bottom:none; gap: 8px; width: 100%;">
                    ${isMeAdmin ? `<button class="btn" id="infoPanelManageBtn" style="width: 100%; background-color: var(--msgchat-dark); color: white;">Manage Members</button>` : ''}
                    <button class="btn btn-danger" id="infoPanelLeaveBtn" style="width: 100%;">Leave Group</button>
                </div>
            `;

            if (isMeAdmin) {
                $('infoPanelManageBtn').onclick = () => {
                    closeInfoPanel();
                    showGroupInfoModal(target.id);
                };
            }
            
            $('infoPanelLeaveBtn').onclick = async () => {
                try {
                    await api(`/api/groups/${target.id}/members/${state.me.userId}`, { method: 'DELETE' });
                    toast('Left group.', 'success');
                    closeInfoPanel();
                    await loadGroups();
                    state.activeChat = null;
                    $('chatPane').innerHTML = '<div class="empty-state">Select a contact or group to start chatting.</div>';
                    renderSidebar();
                } catch (e) { toast(e.message, 'error'); }
            };
        }
    } catch (e) {
        body.innerHTML = `<div style="padding:40px;text-align:center;color:red;">Error: ${escapeHtml(e.message)}</div>`;
    }
}

function closeInfoPanel() {
    const overlay = $('infoPanelOverlay');
    const panel = $('infoPanel');
    if (overlay) overlay.classList.remove('active');
    if (panel) panel.classList.remove('active');
}
window.closeInfoPanel = closeInfoPanel;

// ── In-Chat Message Search ──
let searchMatches = [];
let currentSearchIndex = -1;

function toggleSearchOverlay() {
    const overlay = $('chatSearchOverlay');
    if (!overlay) return;
    const isActive = overlay.classList.toggle('active');
    if (isActive) {
        $('chatSearchInput').value = '';
        $('chatSearchCount').textContent = '';
        $('chatSearchInput').focus();
        searchMatches = [];
        currentSearchIndex = -1;
    } else {
        clearSearchHighlighting();
    }
}
window.toggleSearchOverlay = toggleSearchOverlay;

function clearSearchHighlighting() {
    // Target the actual bubble-text divs inside msgchat-bubble elements
    const textEls = document.querySelectorAll('.bubble-text');
    textEls.forEach(el => {
        if (el.dataset.originalContent) {
            el.innerHTML = el.dataset.originalContent;
            delete el.dataset.originalContent;
        }
    });
    searchMatches = [];
    currentSearchIndex = -1;
    if ($('chatSearchCount')) $('chatSearchCount').textContent = '';
}

function runMessageSearch() {
    const query = $('chatSearchInput').value.trim().toLowerCase();
    clearSearchHighlighting();
    if (!query) return;

    // Target .bubble-text divs (actual text containers in renderMessages)
    const textEls = document.querySelectorAll('.msgchat-bubble .bubble-text');
    searchMatches = [];

    textEls.forEach(textEl => {
        const textDiv = textEl.querySelector('div');
        if (!textDiv) return;

        if (!textEl.dataset.originalContent) {
            textEl.dataset.originalContent = textEl.innerHTML;
        }

        const originalText = textDiv.textContent || '';
        if (originalText.toLowerCase().includes(query)) {
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            // Only highlight inside the text div, not attachment HTML
            const safeText = escapeHtml(originalText);
            textDiv.innerHTML = safeText.replace(regex, '<mark class="search-match">$1</mark>');

            const markEls = textDiv.querySelectorAll('mark.search-match');
            markEls.forEach(mark => searchMatches.push(mark));
        }
    });

    if (searchMatches.length > 0) {
        // Start from first (oldest) match
        currentSearchIndex = 0;
        highlightCurrentSearchMatch();
    } else {
        $('chatSearchCount').textContent = '0 of 0';
    }
}

function highlightCurrentSearchMatch() {
    searchMatches.forEach((mark, index) => {
        if (index === currentSearchIndex) {
            mark.classList.add('selected');
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            mark.classList.remove('selected');
        }
    });
    $('chatSearchCount').textContent = `${currentSearchIndex + 1} of ${searchMatches.length}`;
}

function searchNavigate(direction) {
    if (searchMatches.length === 0) return;
    if (direction === 'next') {
        currentSearchIndex = (currentSearchIndex + 1) % searchMatches.length;
    } else {
        currentSearchIndex = (currentSearchIndex - 1 + searchMatches.length) % searchMatches.length;
    }
    highlightCurrentSearchMatch();
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Emoji Picker Popup ──
const EMOJI_GROUPS = {
    Smileys: ['😀', '😁', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '😭', '😡', '🤢', '🥺', '😜', '🤥', '🤧', '🤔', '🤐', '🤨', '🤓', '😴', '😮', '😶'],
    Gestures: ['👍', '👎', '👏', '🙏', '🤝', '👌', '✌️', '🤘', '💪', '👈', '👉', '👆', '👇', '☝️', '🤟', '🤙','👈'],
    Animals: ['🐶', '🐱', '🐭', '🐼', '🦊', '🐯', '🐵', '🐰', '🦁', '🐺', '🐧', '🐥', '🐸', '🐷', '🐼','🐔'],
    Food: ['🍎', '🍔', '🍕', '🍟', '🍩', '🍰', '🍉', '🍓', '🍇', '🍦', '🎂', '🥟'],
    Travel: ['🚗', '✈️', '🚀', '🚲', '🚢', '🌍', '🌏', '🌋'],
    Objects: ['💡', '📱', '💻', '⌚', '📷', '🎁'],
    Symbols: ['❤️', '💙', '💚', '💛', '🔥', '✨', '💯', '🎉', '🎊']
};
function initEmojiPicker() {
    const picker = $('emojiPickerPopup');
    if (!picker) return;

    picker.innerHTML = `
        <div class="emoji-search">
            <input
                id="emojiSearch"
                type="text"
                placeholder="Search emoji..."
            >
        </div>

        <div class="emoji-body" id="emojiBody"></div>
    `;

    renderEmojiGroups("");

    $('emojiSearch').addEventListener('input', e=>{
        renderEmojiGroups(e.target.value.toLowerCase());
    });
}

function renderEmojiGroups(filter){

    const body=$('emojiBody');
    body.innerHTML="";

    Object.entries(EMOJI_GROUPS).forEach(([title,list])=>{

        const filtered=list.filter(e=>e.includes(filter)||filter==="");

        if(filtered.length===0) return;

        const section=document.createElement("div");
        section.className="emoji-category";

        section.innerHTML=`
            <div class="emoji-title">${title}</div>
            <div class="emoji-grid">
                ${filtered.map(e=>`
                    <span class="emoji-item"
                        onclick="insertEmoji('${e}')">${e}</span>
                `).join("")}
            </div>
        `;

        body.appendChild(section);

    });

}

function insertEmoji(emoji) {
    const input = $('msgInput');
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = input.value;
    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
    handleInputTyping();
}
window.insertEmoji = insertEmoji;

function toggleEmojiPicker(e) {
    if (e) e.stopPropagation();
    const picker = $('emojiPickerPopup');
    if (picker) picker.classList.toggle('active');
}
window.toggleEmojiPicker = toggleEmojiPicker;

// ── Typing Indicator ──
const typingUsers = new Set();
let localIsTyping = false;
let stopTypingTimeout = null;

function showTypingStatus(typingUserId, isTyping) {
    const statusEl = $('chatHeaderStatus');
    if (!statusEl) return;

    if (isTyping) {
        typingUsers.add(typingUserId);
    } else {
        typingUsers.delete(typingUserId);
    }

    if (typingUsers.size > 0) {
        if (state.activeChat.type === 'private') {
            statusEl.innerHTML = '<span class="typing-indicator-chat">typing...</span>';
        } else {
            const userIds = Array.from(typingUsers);
            const names = userIds.map(uid => {
                const contact = state.contacts.find(c => c.userId === uid);
                return contact ? contact.displayName : 'Someone';
            });
            statusEl.innerHTML = `<span class="typing-indicator-chat">${names.join(', ')} is typing...</span>`;
        }
    } else {
        if (state.activeChat.type === 'private') {
            statusEl.textContent = state.presenceMap[state.activeChat.id] || 'Offline';
        } else {
            api(`/api/groups/${state.activeChat.id}`).then(g => {
                statusEl.textContent = `${g.members.length} members`;
            }).catch(() => {
                statusEl.textContent = 'Group';
            });
        }
    }
}

function handleInputTyping() {
    if (!state.connection || !state.activeChat) return;

    if (!localIsTyping) {
        localIsTyping = true;
        state.connection.invoke('SendTyping', state.activeChat.type, state.activeChat.id.toString(), true)
            .catch(err => console.error("SendTyping error:", err));
    }

    clearTimeout(stopTypingTimeout);
    stopTypingTimeout = setTimeout(() => {
        localIsTyping = false;
        state.connection.invoke('SendTyping', state.activeChat.type, state.activeChat.id.toString(), false)
            .catch(err => console.error("SendTyping error:", err));
    }, 3000);
}

// ── History Clearing & Chat Deletion ──
async function clearChatHistory(target) {
    if (!confirm('Are you sure you want to clear all message history in this chat? This cannot be undone.')) return;
    try {
        if (target.type === 'private') {
            await state.connection.invoke('ClearPrivateHistory', target.id);
        } else {
            await state.connection.invoke('ClearGroupHistory', parseInt(target.id));
        }
        state.messages = [];
        renderMessages();
        toast('Chat history cleared successfully.', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function deleteChat(target) {
    if (target.type === 'private') {
        if (!confirm('Are you sure you want to delete this chat? This will remove the contact and clear the message history.')) return;
        try {
            await state.connection.invoke('ClearPrivateHistory', target.id);
            await api(`/api/contacts/${target.id}`, { method: 'DELETE' });
            toast('Chat deleted and contact removed.', 'success');
            state.activeChat = null;
            $('chatPane').innerHTML = '<div class="empty-state">Select a contact or group to start chatting.</div>';
            await loadContacts();
            renderSidebar();
        } catch (e) {
            toast(e.message, 'error');
        }
    } else {
        if (!confirm('Are you sure you want to leave this group?')) return;
        try {
            await api(`/api/groups/${target.id}/members/${state.me.userId}`, { method: 'DELETE' });
            toast('Left group successfully.', 'success');
            state.activeChat = null;
            $('chatPane').innerHTML = '<div class="empty-state">Select a contact or group to start chatting.</div>';
            await loadGroups();
            renderSidebar();
        } catch (e) {
            toast(e.message, 'error');
        }
    }
}