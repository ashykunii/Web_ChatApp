// ChatApp Frontend — Telegram Light/Dark Mode Hybrid
const API_BASE = window.location.origin;
const HUB_URL  = `${API_BASE}/hubs/chat`;

// State
const state = {
    token: null,
    me: null,                // { userId, userName, displayName, role, avatarUrl }
    connection: null,        // SignalR connection
    contacts: [],            // ContactDto[]
    groups: [],              // GroupDto[]
    activeChat: null,        // { type: 'private'|'group', id, name }
    activeTab: 'contacts',
    messages: [],            // messages for current chat
    oldestCursor: null,
    hasMore: false,
    presenceMap: {},         // userId -> status string
    adminUsers: [],
    pendingAttachment: null, // { url, fileName, attachmentType }
    replyingTo: null,        // { id, senderName, snippet }
    editingMessage: null     // MessageDto currently being edited
};

// Helpers
const $ = id => document.getElementById(id);

function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

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

function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatTime(iso) {
    if (!iso) return '';
    // Ensure the string is treated as UTC (ASP.NET returns datetimes without 'Z')
    const utcStr = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    const d = new Date(utcStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Returns a YYYY-MM-DD string in LOCAL time for day-grouping
function toLocalDateKey(iso) {
    if (!iso) return '';
    const utcStr = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    const d = new Date(utcStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Returns a human-readable label: "Today", "Yesterday", or "Monday, June 23, 2026"
function formatDateLabel(dateKey) {
    const [y, mo, dy] = dateKey.split('-').map(Number);
    const msgDate  = new Date(y, mo - 1, dy);
    const now      = new Date();
    const today    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    if (msgDate.getTime() === today.getTime())     return 'Today';
    if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';

    return msgDate.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function initials(name) {
    return (name || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

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

// Drawer Toggles
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

// Night Mode Toggle Switch
$('nightModeToggle').onchange = (e) => {
    const isDark = e.target.checked;
    if (isDark) {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        localStorage.setItem('night_mode', 'true');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        localStorage.setItem('night_mode', 'false');
    }
};

// Initialize Theme
(function initTheme() {
    const nightMode = localStorage.getItem('night_mode');
    if (nightMode === 'true') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        $('nightModeToggle').checked = true;
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        $('nightModeToggle').checked = false;
    }
})();

// Drawer Menu Routing
$('drawerMenuProfile').onclick = () => { closeDrawer(); showEditProfileModal(); };
$('drawerMenuNewGroup').onclick = () => { closeDrawer(); openNewGroupModal(); };
$('drawerMenuContacts').onclick = () => { closeDrawer(); selectTab('contacts'); };


function selectTab(tab) {
    state.activeTab = tab;
    renderSidebar();
}

// Close Context menus & dropdowns
document.addEventListener('click', () => {
    const drop = $('headerMenuDropdown');
    if (drop) drop.classList.remove('active');
    $('msgContextMenu').classList.remove('active');
});

// Auth Panels switching
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

function logout() {
    if (state.connection) state.connection.stop();
    localStorage.removeItem('chatapp_token');
    location.reload();
}

// Enter App
async function enterApp() {
    $('authScreen').style.display = 'none';
    $('app').classList.add('active');

    updateDrawerProfile();

    await connectHub();
    await loadContacts();
    await loadGroups();
    renderSidebar();
}

// SignalR Connection
async function connectHub() {
    state.connection = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, { accessTokenFactory: () => state.token })
        .withAutomaticReconnect()
        .configureLogging(signalR.LogLevel.Warning)
        .build();

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
                    state.messages[existingIndex].isDeleted = true;
                } else {
                    state.messages[existingIndex].content = msg.content;
                }
            } else {
                state.messages.push(msg);
            }
            renderMessages();
        } else {
            const who = msg.senderDisplayName || 'Someone';
            let cleanContent = msg.content;
            if (cleanContent.startsWith('>>reply:')) {
                cleanContent = cleanContent.split('<<').slice(1).join('<<');
            }
            const contentText = msg.attachmentUrl ? `Sent an attachment: ${msg.attachmentFileName}` : cleanContent;
            toast(`${who}: ${contentText.substring(0, 60)}`);
        }
    });

    state.connection.on('MessageDeleted', (messageId) => {
        const idx = state.messages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
            state.messages[idx].content = '[deleted]';
            state.messages[idx].isDeleted = true;
            renderMessages();
        }
    });

    state.connection.on('MessageEdited', (messageId, newContent) => {
        const idx = state.messages.findIndex(m => m.id === messageId);
        if (idx !== -1) {
            state.messages[idx].content = newContent;
            renderMessages();
        }
    });

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

    state.connection.on('BulkMessageSent', (dtos) => {
        toast(`Bulk message sent to ${dtos.length} recipients.`, 'success');
    });

    state.connection.on('ForceDisconnect', (reason) => {
        toast(`Account banned: ${reason}`, 'error');
        setTimeout(() => logout(), 2000);
    });

    try {
        await state.connection.start();
        toast('Connected.', 'success');
    } catch (err) {
        toast('Connection failed: ' + err.message, 'error');
    }
}

// User Search logic
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

// Data Loading
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

// Sidebar Rendering
function renderSidebar() {
    const list = $('sidebarList');
    list.innerHTML = '';

    if (state.activeTab === 'contacts') {
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

// Group Details Info Modal
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

// Chat Actions
async function openChat(target) {
    state.activeChat = target;
    state.messages = [];
    state.oldestCursor = null;
    state.pendingAttachment = null;
    state.replyingTo = null;
    state.editingMessage = null;

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
                    ${target.type === 'private' ? `
                        <a id="menuBlock">Block User</a>
                        <a id="menuUnblock">Unblock User</a>
                    ` : `
                        <a id="menuGroupInfo">Group Details</a>
                    `}
                    <a id="menuSettings">My settings</a>
                    <a id="menuLogout" class="danger">Logout</a>
                </div>
            </div>
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
                    <span class="attachment-preview-icon">📎</span>
                    <span class="attachment-preview-name" id="attachmentPreviewName"></span>
                    <button class="attachment-preview-remove" id="btnRemoveAttachment">Remove</button>
                </div>
                
                <div class="chat-input-row">
                    <input type="file" id="fileAttachmentInput" style="display:none;" />
                    <label class="upload-btn-label" for="fileAttachmentInput" title="Attach file">
                        <svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                    </label>
                    <textarea id="msgInput" placeholder="Write a message..."></textarea>
                    <button class="btn-send-msg" id="btnSend">
                        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Dynamic presence/member count status inside chat header
    if (target.type === 'private') {
        const presence = state.presenceMap[target.id] || 'Offline';
        $('chatHeaderStatus').textContent = presence;
        
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
        try {
            const g = await api(`/api/groups/${target.id}`);
            $('chatHeaderStatus').textContent = `${g.members.length} members`;
        } catch {
            $('chatHeaderStatus').textContent = 'Group';
        }
        $('menuGroupInfo').onclick = (e) => {
            e.stopPropagation();
            $('headerMenuDropdown').classList.remove('active');
            showGroupInfoModal(target.id);
        };
    }

    $('menuSettings').onclick = (e) => {
        e.stopPropagation();
        $('headerMenuDropdown').classList.remove('active');
        showEditProfileModal();
    };

    $('menuLogout').onclick = (e) => {
        e.stopPropagation();
        logout();
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
    renderSidebar();
}

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
        // ── Date separator ────────────────────────────────────────────────
        const dateKey = toLocalDateKey(m.sentAtUtc);
        if (dateKey && dateKey !== lastDateKey) {
            lastDateKey = dateKey;
            const sep = document.createElement('div');
            sep.className = 'date-separator';
            sep.innerHTML = `<span>${formatDateLabel(dateKey)}</span>`;
            area.appendChild(sep);
        }
        // ── Message row ───────────────────────────────────────────────────
        const row = document.createElement('div');
        const isMine = m.senderId === state.me.userId;
        row.className = 'message-row ' + (isMine ? 'outgoing' : 'incoming');
        row.id = `msgrow-${m.id}`;

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
                            <span class="file-icon">📄</span>
                            <div class="file-info">
                                <div class="file-name">${escapeHtml(m.attachmentFileName)}</div>
                                <div class="file-size">Download file</div>
                            </div>
                        </a>
                    </div>
                `;
            }
        }

        // Avatar column
        if (!isMine && state.activeChat?.type === 'group') {
            const avatarDiv = document.createElement('div');
            avatarDiv.className = 'message-avatar';
            renderAvatarEl(avatarDiv, m.senderDisplayName, m.senderAvatarUrl);
            row.appendChild(avatarDiv);
        }

        // Bubble wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'message-bubble-wrapper';

        // Telegram Bubble
        const bubble = document.createElement('div');
        bubble.className = 'telegram-bubble';

        // Parse reply prefix format: >>reply:id:sender:snippet<<ActualText
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

        bubble.innerHTML = `
            ${!isMine && state.activeChat?.type === 'group' ? `<div class="bubble-sender">${escapeHtml(m.senderDisplayName)}</div>` : ''}
            ${replyRefHtml}
            <div class="bubble-text">
                ${textContent ? `<div>${escapeHtml(textContent)}</div>` : ''}
                ${attachmentHtml}
            </div>
            <div class="bubble-meta">${formatTime(m.sentAtUtc)}</div>
        `;
        wrapper.appendChild(bubble);

        // Three-dot Action Trigger Button (on the right of message bubble)
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

function showContextMenu(e, m) {
    const menu = $('msgContextMenu');
    menu.classList.add('active');
    
    // Position menu near cursor
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${e.clientX}px`;

    // Bind action callbacks
    $('msgCtxReply').onclick = () => { initiateReply(m); menu.classList.remove('active'); };
    
    // Copy Text Option
    $('msgCtxCopy').onclick = () => {
        let textToCopy = m.content;
        if (textToCopy.startsWith('>>reply:')) {
            textToCopy = textToCopy.split('<<').slice(1).join('<<');
        }
        navigator.clipboard.writeText(textToCopy);
        toast('Message copied to clipboard.', 'success');
        menu.classList.remove('active');
    };

    // Pin Message Option
    $('msgCtxPin').onclick = () => {
        toast('Message pinned to top.', 'success');
        menu.classList.remove('active');
    };

    // Edit message Option (only if ours and not deleted)
    const isMine = m.senderId === state.me.userId;
    if (isMine && !m.isDeleted) {
        $('msgCtxEdit').style.display = 'flex';
        $('msgCtxEdit').onclick = () => { initiateEdit(m); menu.classList.remove('active'); };
    } else {
        $('msgCtxEdit').style.display = 'none';
    }

    // Delete message Option (only if ours)
    if (isMine && !m.isDeleted) {
        $('msgCtxDelete').style.display = 'flex';
        $('msgCtxDelete').onclick = () => { deleteMessage(m.id); menu.classList.remove('active'); };
    } else {
        $('msgCtxDelete').style.display = 'none';
    }
}

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

async function deleteMessage(id) {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
        await state.connection.invoke('DeleteMessage', id);
        toast('Message deleted.', 'success');
    } catch (e) {
        toast(e.message, 'error');
    }
}

async function sendMessage() {
    const input = $('msgInput');
    let content = input.value.trim();
    const attachment = state.pendingAttachment;

    if (!content && !attachment) return;
    if (!state.activeChat) return;

    if (state.editingMessage) {
        // Edit Mode
        try {
            await state.connection.invoke('EditMessage', state.editingMessage.id, content);
            input.value = '';
            state.editingMessage = null;
            $('editPreviewBar').classList.remove('active');
        } catch (e) { toast(e.message, 'error'); }
        return;
    }

    // Normal Send Mode
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
    } catch (e) { toast(e.message, 'error'); }
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

// Group Modals
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

// Admin panel rendering
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

// Modal Close helper
function closeModal() {
    $('modalBackdrop').classList.remove('active');
}
window.closeModal = closeModal;

$('modalBackdrop').onclick = (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
};

// Init application
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
