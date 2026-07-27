let currentUser = null;
let currentProfile = null;
let divisionsFilter = 'all';
let divisionsStageFilter = 'all';

async function initAdmin() {
  if (!auth.isAuthenticated()) {
    window.location.href = './admin.html';
    return;
  }

  let attempts = 0;
  while (!auth.profile && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }

  currentUser = auth.user;
  currentProfile = auth.profile;

  const adminLevel = currentProfile.admin_level || 0;

  if (adminLevel === 0) {
    window.location.href = './admin.html';
    return;
  }

  setupUI(adminLevel);
  setupEventListeners(adminLevel);
  loadDashboard(adminLevel);
  touchLastSeen();
  setInterval(touchLastSeen, 120000);
}

function setupUI(level) {
  const levelNames = {
    1: 'Level 1 Admin',
    4: 'Level 4 Admin',
    7: 'Level 7 Admin',
    9: 'Super Admin'
  };

  const initial = currentProfile.name ? currentProfile.name.charAt(0).toUpperCase() : 'A';

  document.getElementById('sidebarUserName').textContent = currentProfile.name || 'Admin';
  document.getElementById('sidebarUserLevel').textContent = levelNames[level] || `Level ${level}`;
  document.getElementById('adminLevel').textContent = levelNames[level] || `Level ${level}`;
  document.getElementById('welcomeMsg').textContent = `Thank you, ${currentProfile.name || 'Admin'}`;
  const heroCopy = document.querySelector('.hero-content p');
  if (heroCopy) {
    heroCopy.textContent = 'Thank you for everything you do for Super League. The work you put in behind the scenes is what has made this league what it is today.';
  }
  document.getElementById('headerUserName').textContent = currentProfile.name || 'Admin';
  document.getElementById('yourLevel').textContent = levelNames[level] || `Level ${level}`;
  document.querySelector('.user-avatar').textContent = initial;
}

function setupEventListeners(level) {
  document.querySelectorAll('.nav-link').forEach(link => {
    const section = link.dataset.section;
    if (section === 'users' && level < 4) link.style.display = 'none';
    if (section === 'admin-manage' && level < 7) link.style.display = 'none';
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      const section = link.dataset.section;
      
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      
      link.classList.add('active');
      document.getElementById(section).classList.add('active');
      
      const titles = {
        dashboard: 'Dashboard',
        users: 'Users',
        leagues: 'Leagues',
        'admin-manage': 'Admin Management'
      };
      document.getElementById('pageTitle').textContent = titles[section] || 'Dashboard';

      if (section === 'users') {
        loadAllUsers();
      } else if (section === 'leagues') {
        loadLeagues();
      } else if (section === 'admin-manage') {
        loadAdminManagement();
      }
    });
  });

  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  function closeDrawer() {
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  }

  if (menuToggle && sidebar && overlay) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', closeDrawer);
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', closeDrawer);
    });
  }

  document.getElementById('sidebarLogout').addEventListener('click', logout);
  document.getElementById('headerLogout').addEventListener('click', logout);

  async function logout() {
    await auth.logout();
    window.location.href = './admin.html';
  }
}

async function touchLastSeen() {
  if (!currentProfile) return;
  const token = localStorage.getItem('sb-auth-token');
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${currentProfile.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ last_seen_at: new Date().toISOString() })
    });
  } catch (err) {
    console.error('Heartbeat failed:', err);
  }
}

function timeAgo(value) {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 300000;
}

async function fetchAdminActivity() {
  const token = localStorage.getItem('sb-auth-token');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_admin_activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    },
    body: '{}'
  });

  if (!res.ok) throw new Error(`Could not load admin activity (${res.status})`);
  return res.json();
}

function renderAdminActivityTable(admins) {
  return `
    <div class="divisions-table-wrapper">
      <table class="divisions-table">
        <thead>
          <tr>
            <th>Status</th>
            <th>Name</th>
            <th>Email</th>
            <th>Level</th>
            <th>Last Login</th>
            <th>Last Active</th>
          </tr>
        </thead>
        <tbody>
          ${admins.map(a => `
            <tr>
              <td><span class="online-dot ${isOnline(a.last_seen_at) ? 'on' : 'off'}"></span>${isOnline(a.last_seen_at) ? 'Online' : 'Offline'}</td>
              <td><strong>${a.name || '(not set)'}</strong></td>
              <td>${a.email || '-'}</td>
              <td><span class="badge active">${a.admin_level}</span> ${adminLevelName(a.admin_level)}</td>
              <td>${timeAgo(a.last_sign_in_at)}</td>
              <td>${timeAgo(a.last_seen_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function loadDashboardActivity() {
  const panel = document.getElementById('dashboardActivity');
  if (!panel) return;

  try {
    const admins = await fetchAdminActivity();
    panel.innerHTML = `
      <h3>Admin Activity (${admins.length})</h3>
      ${renderAdminActivityTable(admins)}
    `;
  } catch (err) {
    panel.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function loadDashboard(level) {
  const cards = [];

  cards.push(`
    <div class="dashboard-card" onclick="navigateTo('leagues')">
      <div class="card-icon">🏆</div>
      <h3 class="card-title">Leagues</h3>
      <p class="card-description">${level >= 7 ? 'Manage leagues, divisions and assignments' : level >= 4 ? 'View divisions and update member details' : 'View leagues and divisions'}</p>
      <button class="card-button">${level >= 7 ? 'Manage Leagues' : 'View Leagues'}</button>
    </div>
  `);

  if (level >= 4) {
    cards.push(`
      <div class="dashboard-card" onclick="navigateTo('users')">
        <div class="card-icon">👥</div>
        <h3 class="card-title">Users</h3>
        <p class="card-description">${level >= 7 ? 'View, create and edit user profiles' : 'View all user profiles'}</p>
        <button class="card-button">${level >= 7 ? 'Manage Users' : 'View Users'}</button>
      </div>
    `);
  }

  if (level >= 7) {
    cards.push(`
      <div class="dashboard-card" onclick="navigateTo('admin-manage')">
        <div class="card-icon">⚙️</div>
        <h3 class="card-title">Admin Management</h3>
        <p class="card-description">${level >= 9 ? 'Adjust admin levels and permissions' : 'View admins and grant Viewer or Junior Admin access'}</p>
        <button class="card-button">Manage Admins</button>
      </div>
    `);
  }

  cards.push(`
    <div class="dashboard-card site-card" onclick="window.open('https://superleagueff.org', '_blank')">
      <div class="card-icon">🌐</div>
      <h3 class="card-title">superleagueff.org</h3>
      <p class="card-description">Visit the public Super League site</p>
      <button class="card-button">Open Site</button>
    </div>
  `);

  document.getElementById('dashboardCards').innerHTML = cards.join('');

  if (level >= 7) {
    const section = document.getElementById('dashboard');
    if (section && !document.getElementById('dashboardActivity')) {
      const panel = document.createElement('div');
      panel.id = 'dashboardActivity';
      panel.className = 'dashboard-activity';
      panel.innerHTML = '<div class="loading">Loading admin activity...</div>';
      section.appendChild(panel);
    }
    loadDashboardActivity();
  }
}

function navigateTo(section) {
  document.querySelector(`[data-section="${section}"]`).click();
}
let allUsersCache = [];
let userHistoryCache = {};
async function loadAllUsers() {
  document.getElementById('usersContent').innerHTML = '<div class="loading">Loading users...</div>';
  
  try {
    const token = localStorage.getItem('sb-auth-token');
    const adminLevel = currentProfile.admin_level || 0;
    
    if (!token) {
      throw new Error('No auth token found');
    }

    if (adminLevel < 4) {
      document.getElementById('usersContent').innerHTML = '<div class="error">You do not have permission to view users.</div>';
      return;
    }

    console.log('Fetching users...');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to load users: ${res.status} ${error}`);
    }

    let users = await res.json();
    console.log('Users loaded:', users);

    if (!users || users.length === 0) {
      document.getElementById('usersContent').innerHTML = '<div class="loading">No users found</div>';
      return;
    }

    const historyMap = await fetchLeagueHistory(users.map(u => u.id));

    allUsersCache = users;
    userHistoryCache = historyMap;

    const html = `
      <div class="users-toolbar">
        <input type="text" id="userSearchInput" class="user-search-input" placeholder="Search by name, email, handle, or division..." oninput="filterUsers(this.value)">
        <span id="usersCount" class="users-count">${users.length} of ${users.length}</span>
      </div>
      <table class="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Division</th>
            <th>SLFF History</th>
            <th>Sleeper Handle</th>
            <th>MFL Handle</th>
          </tr>
        </thead>
        <tbody id="usersTableBody">
          ${renderUserRows(users)}
        </tbody>
      </table>
    `;
    
    document.getElementById('usersContent').innerHTML = html;
  } catch (err) {
    console.error('Error loading users:', err);
    document.getElementById('usersContent').innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
}
function renderUserRows(users) {
  const adminLevel = currentProfile.admin_level || 0;
  if (!users.length) {
    return `<tr><td colspan="6" class="users-empty">No matching users</td></tr>`;
  }
  return users.map(u => `
    <tr ${adminLevel >= 7 ? `onclick="viewUserProfile('${u.id}')"` : ''}>
      <td>${adminLevel >= 7 ? `<a class="user-link">${u.name || '(not set)'}</a>` : (u.name || '(not set)')}</td>
      <td>${u.email}</td>
      <td>${u.assigned_division || '-'}</td>
      <td>${formatLeagueHistory(userHistoryCache[u.id])}</td>
      <td>${u.sleeper_handle || '-'}</td>
      <td>${u.mfl_handle || '-'}</td>
    </tr>
  `).join('');
}

function filterUsers(query) {
  const q = query.trim().toLowerCase();
  const filtered = !q ? allUsersCache : allUsersCache.filter(u =>
    (u.name || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.sleeper_handle || '').toLowerCase().includes(q) ||
    (u.mfl_handle || '').toLowerCase().includes(q) ||
    (u.assigned_division || '').toLowerCase().includes(q)
  );
  const tbody = document.getElementById('usersTableBody');
  if (tbody) tbody.innerHTML = renderUserRows(filtered);
  const count = document.getElementById('usersCount');
  if (count) count.textContent = `${filtered.length} of ${allUsersCache.length}`;
}
async function fetchLeagueHistory(userIds) {
  if (!userIds || userIds.length === 0) return {};

  const token = localStorage.getItem('sb-auth-token');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/league_history?user_id=in.(${userIds.join(',')})&select=user_id,status,leagues(id,league_name,year)`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) {
      console.error('Failed to load league history:', res.status, await res.text());
      return {};
    }

    const rows = await res.json();
    const map = {};

    rows.forEach(row => {
      if (!row.leagues) return;
      if (!map[row.user_id]) map[row.user_id] = [];
      map[row.user_id].push({
        id: row.leagues.id,
        league_name: row.leagues.league_name,
        year: row.leagues.year,
        status: row.status
      });
    });

    Object.keys(map).forEach(userId => {
      map[userId].sort((a, b) => (b.year || 0) - (a.year || 0));
    });

    return map;
  } catch (err) {
    console.error('Error loading league history:', err);
    return {};
  }
}

function formatLeagueHistory(entries) {
  if (!entries || entries.length === 0) return '-';

  return `<div class="history-cell">${entries.map(e => {
    const rostered = e.status === 'rostered';
    const title = rostered ? 'Rostered in a division' : 'Registered, no division';
    return `<span class="badge history ${rostered ? 'rostered' : 'waitlist'}" title="${title}">${e.league_name}</span>`;
  }).join('')}</div>`;
}

async function recordLeagueHistory(userId, leagueId, status, resolution) {
  if (!userId || !leagueId) return;

  const token = localStorage.getItem('sb-auth-token');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/league_history?on_conflict=user_id,league_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': `resolution=${resolution || 'merge-duplicates'},return=minimal`
    },
    body: JSON.stringify({
      user_id: userId,
      league_id: leagueId,
      status: status || 'rostered'
    })
  });

  if (!res.ok) {
    throw new Error(`League history update failed (${res.status}): ${await res.text()}`);
  }
}

async function setLeagueHistoryStatus(userId, leagueId, status) {
  const token = localStorage.getItem('sb-auth-token');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/league_history?user_id=eq.${userId}&league_id=eq.${leagueId}&select=id`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ status })
  });

  if (!res.ok) {
    throw new Error(`League history status change failed (${res.status}): ${await res.text()}`);
  }
}

async function userStillInLeague(userId, leagueId) {
  const token = localStorage.getItem('sb-auth-token');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?user_id=eq.${userId}&select=id,divisions(league_id)`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    }
  });

  if (!res.ok) {
    console.error('Failed to check remaining divisions:', res.status, await res.text());
    return true;
  }

  const rows = await res.json();
  return rows.some(r => r.divisions && r.divisions.league_id === leagueId);
}

async function viewUserProfile(userId) {
  const adminLevel = currentProfile.admin_level || 0;
  
  if (adminLevel < 7) {
    alert('You do not have permission to view user details.');
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) {
      throw new Error('Failed to load user profile');
    }

    const data = await res.json();
    if (!data || data.length === 0) {
      alert('User not found');
      return;
    }

    const user = data[0];
    const historyMap = await fetchLeagueHistory([userId]);
    showUserDetailModal(user, historyMap[userId]);
  } catch (err) {
    alert('Error loading profile: ' + err.message);
  }
}

function showUserDetailModal(user, leagueHistory) {
  const adminLevel = currentProfile.admin_level || 0;
  const canEdit = adminLevel >= 7;
  
  const modal = document.createElement('div');
  modal.className = 'user-detail-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.user-detail-modal').remove()">✕</button>
      
      <h2>${user.name || 'User Profile'}</h2>
      <p class="modal-subtitle">${user.email}</p>
      
      <div class="profile-grid" id="profileGrid">
        <div class="profile-item">
          <label>Full Name</label>
          <p data-field="name">${user.name || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Email</label>
          <p>${user.email}</p>
        </div>
        <div class="profile-item">
          <label>Cell Phone</label>
          <p data-field="cell_phone">${user.cell_phone || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Location</label>
          <p data-field="location">${user.location || '-'}</p>
        </div>
        
        <div class="profile-item">
          <label>X (Twitter)</label>
          <p data-field="x_handle">${user.x_handle || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Bluesky</label>
          <p data-field="bluesky_handle">${user.bluesky_handle || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Discord</label>
          <p data-field="discord_handle">${user.discord_handle || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Sleeper Handle</label>
          <p data-field="sleeper_handle">${user.sleeper_handle || '-'}</p>
        </div>
        
        <div class="profile-item">
          <label>MFL Handle</label>
          <p data-field="mfl_handle">${user.mfl_handle || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Assigned Division</label>
          <p data-field="assigned_division">${user.assigned_division || '-'}</p>
        </div>
        <div class="profile-item profile-item-wide">
          <label>SLFF History</label>
          <p>${formatLeagueHistory(leagueHistory)}</p>
        </div>
        <div class="profile-item">
          <label>Draft Spot</label>
          <p data-field="draft_spot">${user.draft_spot || '-'}</p>
        </div>
        <div class="profile-item">
          <label>Verified</label>
          <p data-field="is_verified">${user.is_verified ? '✓ Yes' : '✗ No'}</p>
        </div>
        
        <div class="profile-item">
          <label>Admin Level</label>
          <p data-field="admin_level">${user.admin_level || 0}</p>
        </div>
        <div class="profile-item">
          <label>Created</label>
          <p>${new Date(user.created_at).toLocaleDateString()}</p>
        </div>
        <div class="profile-item">
          <label>Last Updated</label>
          <p>${new Date(user.updated_at).toLocaleDateString()}</p>
        </div>
      </div>
      
      <div class="modal-actions" id="modalActions">
        ${canEdit ? `<button class="modal-button" onclick="editUserProfile('${user.id}')">Edit Profile</button>` : ''}
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

function editUserProfile(userId) {
  const modal = document.querySelector('.user-detail-modal');
  const profileGrid = modal.querySelector('#profileGrid');
  
  const allFields = {
    name: 'Full Name',
    cell_phone: 'Cell Phone',
    location: 'Location',
    x_handle: 'X (Twitter)',
    bluesky_handle: 'Bluesky',
    discord_handle: 'Discord',
    sleeper_handle: 'Sleeper Handle',
    mfl_handle: 'MFL Handle',
    draft_spot: 'Draft Spot',
    admin_level: 'Admin Level',
    is_verified: 'Verified'
  };

  const user = {};
  modal.querySelectorAll('[data-field]').forEach(el => {
    const field = el.getAttribute('data-field');
    if (field === 'is_verified') {
      user[field] = el.textContent.includes('Yes');
    } else if (field === 'admin_level' || field === 'draft_spot') {
      user[field] = parseInt(el.textContent) || 0;
    } else {
      user[field] = el.textContent === '-' ? '' : el.textContent;
    }
  });

  let editHTML = '<div class="edit-form">';
  
  Object.entries(allFields).forEach(([field, label]) => {
    if (field === 'is_verified') {
      editHTML += `
        <div class="form-group">
          <label for="edit-${field}">${label}</label>
          <select id="edit-${field}">
            <option value="false" ${!user[field] ? 'selected' : ''}>No</option>
            <option value="true" ${user[field] ? 'selected' : ''}>Yes</option>
          </select>
        </div>
      `;
    } else if (field === 'admin_level' || field === 'draft_spot') {
      editHTML += `
        <div class="form-group">
          <label for="edit-${field}">${label}</label>
          <input type="number" id="edit-${field}" value="${user[field] || 0}">
        </div>
      `;
    } else {
      editHTML += `
        <div class="form-group">
          <label for="edit-${field}">${label}</label>
          <input type="text" id="edit-${field}" value="${user[field] || ''}">
        </div>
      `;
    }
  });

  editHTML += '</div>';

  profileGrid.innerHTML = editHTML;
  
  const modalActions = modal.querySelector('#modalActions');
  modalActions.innerHTML = `
    <button class="modal-button" onclick="saveUserChanges('${userId}')">Save Changes</button>
    <button class="modal-button cancel-btn" onclick="location.reload()">Cancel</button>
    <div id="edit-message"></div>
  `;
}

async function saveUserChanges(userId) {
  const adminLevel = currentProfile.admin_level || 0;
  
  if (adminLevel < 7) {
    alert('You do not have permission to edit users.');
    return;
  }

  const updates = {};
  const fields = ['name', 'cell_phone', 'location', 'x_handle', 'bluesky_handle', 'discord_handle', 'sleeper_handle', 'mfl_handle', 'draft_spot', 'admin_level', 'is_verified'];

  fields.forEach(field => {
    const input = document.getElementById(`edit-${field}`);
    if (input) {
      if (field === 'is_verified') {
        updates[field] = input.value === 'true';
      } else if (field === 'admin_level' || field === 'draft_spot') {
        updates[field] = parseInt(input.value) || null;
      } else {
        updates[field] = input.value || null;
      }
    }
  });

  const button = document.querySelector('.modal-actions .modal-button:not(.cancel-btn)');
  button.disabled = true;
  button.style.opacity = '0.6';

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    console.log('Saving user changes:', { userId, updates });
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
    });

    console.log('Response status:', res.status);

    if (!res.ok) {
      const error = await res.text();
      console.error('Supabase error:', error);
      throw new Error(`Failed to update profile: ${error}`);
    }

    console.log('Update successful');
    
    const messageEl = document.getElementById('edit-message');
    messageEl.textContent = 'Changes saved successfully!';
    messageEl.style.color = '#16a34a';
    messageEl.style.marginTop = '10px';

    setTimeout(() => {
      document.querySelector('.user-detail-modal').remove();
      loadAllUsers();
    }, 1500);
  } catch (err) {
    console.error('Error saving changes:', err);
    button.disabled = false;
    button.style.opacity = '1';
    const messageEl = document.getElementById('edit-message');
    messageEl.textContent = 'Error: ' + err.message;
    messageEl.style.color = '#dc2626';
    messageEl.style.marginTop = '10px';
  }
}

async function loadLeagues() {
  document.getElementById('leaguesContent').innerHTML = '<div class="loading">Loading leagues...</div>';
  
  const adminLevel = currentProfile.admin_level || 0;
  
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leagues?order=created_at.desc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load leagues');

    const leagues = await res.json();

    let html = '';
    
    if (adminLevel === 9) {
      html += `<button class="section-button" onclick="showCreateLeagueModal()">+ Create New League</button>`;
    }

    if (!leagues || leagues.length === 0) {
      html += '<div class="empty-state">No leagues found</div>';
    } else {
      const activeLeague = leagues.find(l => l.is_active) || leagues[0];
      
      html += `
        <div class="league-filter">
          <label for="leagueSelect">Select League:</label>
          <select id="leagueSelect" onchange="filterLeagueDisplay(this.value)">
            ${leagues.map(l => `<option value="${l.id}" ${l.id === activeLeague.id ? 'selected' : ''}>${l.league_name} (${l.year})</option>`).join('')}
          </select>
        </div>
        
        <div class="divisions-view" id="divisionsView">
        </div>
      `;
    }

    document.getElementById('leaguesContent').innerHTML = html;
    
    if (leagues && leagues.length > 0) {
      const activeLeague = leagues.find(l => l.is_active) || leagues[0];
      window.allLeagues = leagues;
      await displayLeagueDivisions(activeLeague.id, activeLeague.league_name);
    }
  } catch (err) {
    console.error('Error loading leagues:', err);
    document.getElementById('leaguesContent').innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
}

async function filterLeagueDisplay(leagueId) {
  const league = window.allLeagues.find(l => l.id === leagueId);
  if (league) {
    await displayLeagueDivisions(leagueId, league.league_name);
  }
}

const STAGE_NAMES = {
  0: 'Pre-Draft',
  1: 'League Filled',
  2: 'League Linked',
  3: 'Round 2',
  4: 'Draft Completed'
};

function getHostPlatform(division) {
  return division.mfl_id ? 'MFL' : division.sleeper_id ? 'Sleeper' : '-';
}

async function displayLeagueDivisions(leagueId, leagueName) {
  try {
    const token = localStorage.getItem('sb-auth-token');

    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?league_id=eq.${leagueId}&order=division_name.asc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load divisions');

    window.currentDivisions = await res.json();
    window.currentLeagueId = leagueId;
    window.currentLeagueName = leagueName;

    renderDivisionsView();
  } catch (err) {
    console.error('Error loading divisions:', err);
    document.getElementById('divisionsView').innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
}

function filterDivisions(divisions) {
  return divisions.filter(d => {
    if (divisionsFilter === 'active' && !d.is_active) return false;
    if (divisionsFilter === 'inactive' && d.is_active) return false;
    if (divisionsFilter === 'sleeper' && getHostPlatform(d) !== 'Sleeper') return false;
    if (divisionsFilter === 'mfl' && getHostPlatform(d) !== 'MFL') return false;
    if (divisionsFilter === 'notlinked') return true;
    if (divisionsStageFilter !== 'all' && d.league_stage !== parseInt(divisionsStageFilter)) return false;
    return true;
  });
}

const sleeperUserCache = new Map();

async function fetchSleeperUsernames(sleeperLeagueId) {
  if (!sleeperLeagueId) return null;

  const key = String(sleeperLeagueId).trim();
  if (sleeperUserCache.has(key)) return sleeperUserCache.get(key);

  try {
    const res = await fetch(`https://api.sleeper.app/v1/league/${key}/users`);

    if (!res.ok) {
      console.error('Sleeper API error for league', key, res.status);
      sleeperUserCache.set(key, null);
      return null;
    }

    const users = await res.json();
    const names = new Set(
      (users || [])
        .flatMap(u => [u.username, u.display_name])
        .map(v => (v || '').trim().toLowerCase())
        .filter(Boolean)
    );

    sleeperUserCache.set(key, names);
    return names;
  } catch (err) {
    console.error('Failed to reach Sleeper API for league', key, err);
    sleeperUserCache.set(key, null);
    return null;
  }
}

async function loadDivisionCounts(divisions) {
  if (!divisions || divisions.length === 0) return;

  const token = localStorage.getItem('sb-auth-token');
  const ids = divisions.map(d => d.id);

  let byDivision = {};

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?division_id=in.(${ids.join(',')})&select=division_id,linked,linked_at,profiles(sleeper_handle)`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error(`Failed to load division members (${res.status})`);

    const rows = await res.json();
    rows.forEach(r => {
      if (!byDivision[r.division_id]) byDivision[r.division_id] = [];
      byDivision[r.division_id].push(r);
    });
  } catch (err) {
    console.error('Error loading division counts:', err);
    divisions.forEach(d => {
      const cell = document.getElementById(`entrants-${d.id}`);
      if (cell) cell.textContent = '?';
      const linkedCell = document.getElementById(`loggedin-${d.id}`);
      if (linkedCell) linkedCell.textContent = '?';
    });
    return;
  }

  divisions.forEach(d => {
    const handles = byDivision[d.id] || [];
    const cell = document.getElementById(`entrants-${d.id}`);
    if (cell) cell.textContent = handles.length;
  });

  for (const d of divisions) {
    const cell = document.getElementById(`loggedin-${d.id}`);
    if (!cell) continue;

    const rows = byDivision[d.id] || [];
    const isMfl = !!d.mfl_id;

    if (!isMfl && !d.sleeper_id) {
      cell.textContent = '-';
      cell.title = 'No host league linked';
      continue;
    }

    if (isMfl) {
      const checked = rows.filter(r => r.linked_at).length;
      if (checked === 0 && rows.length > 0) {
        cell.textContent = '?';
        cell.title = 'MFL sync has not run for this division yet';
        continue;
      }
      const matched = rows.filter(r => r.linked).length;
      cell.textContent = `${matched} / ${rows.length}`;
      cell.title = `${matched} of ${rows.length} matched to an MFL franchise`;
      continue;
    }

    const pool = await fetchSleeperUsernames(d.sleeper_id);

    if (!pool) {
      cell.textContent = '?';
      cell.title = 'Could not reach Sleeper for this league';
      continue;
    }

    const matched = rows.filter(r => {
      const h = r.profiles && r.profiles.sleeper_handle;
      return h && pool.has(h.trim().toLowerCase());
    }).length;

    cell.textContent = `${matched} / ${rows.length}`;
    cell.title = `${matched} of ${rows.length} have joined on Sleeper with their profile username`;
  }
}

async function syncSleeperData() {
  const adminLevel = currentProfile.admin_level || 0;

  if (adminLevel < 9) {
    alert('Only Super Admins can sync Sleeper data.');
    return;
  }

  const button = document.getElementById('syncSleeperBtn');
  const originalText = button ? button.textContent : '';

  if (button) {
    button.disabled = true;
    button.textContent = 'Syncing...';
  }

  sleeperUserCache.clear();

  try {
    await loadDivisionCounts(filterDivisions(window.currentDivisions || []));

    if (button) {
      button.textContent = 'Synced';
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, 1500);
    }
  } catch (err) {
    console.error('Sleeper sync failed:', err);
    if (button) {
      button.textContent = originalText;
      button.disabled = false;
    }
    alert('Sync failed: ' + err.message);
  }
}

function renderFilterBar(adminLevel, statusFilters, stageFilters, heading) {
  return `
    <div class="divisions-header">
      <div>
        <h2>${window.currentLeagueName} Divisions</h2>
        <p>${heading}</p>
      </div>
      ${adminLevel >= 7 ? `
        <div class="divisions-header-actions">
        ${adminLevel >= 9 ? `<button class="section-button" id="syncSleeperBtn" onclick="syncSleeperData()">Sync Sleeper</button>` : ''}
          <button class="section-button" onclick="showWaitlistModal()">Waitlist</button>
          <button class="section-button" onclick="showCreateDivisionModal()">+ Create New Division</button>
        </div>
      ` : ''}
    </div>

    <div class="division-filters">
      ${statusFilters.map(([value, label]) => `
        <button class="filter-btn ${divisionsFilter === value ? 'active' : ''}" onclick="applyDivisionsFilter('${value}')">${label}</button>
      `).join('')}
    </div>

    <div class="division-filters">
      ${stageFilters.map(([value, label]) => `
        <button class="filter-btn ${divisionsStageFilter === value ? 'active' : ''}" onclick="applyStageFilter('${value}')">${label}</button>
      `).join('')}
    </div>
  `;
}

function renderNotLoggedInView(adminLevel, statusFilters, stageFilters) {
  document.getElementById('divisionsView').innerHTML =
    renderFilterBar(adminLevel, statusFilters, stageFilters, 'Members not yet linked to their host league') +
    '<div id="notLinkedTable"><div class="loading">Loading...</div></div>';
  loadNotLoggedIn();
}

async function loadNotLoggedIn() {
  const container = document.getElementById('notLinkedTable');
  if (!container) return;

  const divisions = window.currentDivisions || [];
  const byId = {};
  divisions.forEach(d => byId[d.id] = d);

  const ids = divisions
    .filter(d => divisionsStageFilter === 'all' || d.league_stage === parseInt(divisionsStageFilter))
    .map(d => d.id);

  if (ids.length === 0) {
    container.innerHTML = '<div class="empty-state">No divisions match these filters</div>';
    return;
  }

  const token = localStorage.getItem('sb-auth-token');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?division_id=in.(${ids.join(',')})&linked=is.false&select=id,division_id,draft_spot,profiles(name,email,sleeper_handle,mfl_handle)`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error(`Failed to load (${res.status})`);

    const rows = await res.json();

    if (rows.length === 0) {
      container.innerHTML = '<div class="empty-state">Everyone in this league is linked</div>';
      return;
    }

    rows.sort((a, b) => {
      const da = byId[a.division_id] ? byId[a.division_id].division_name : '';
      const db = byId[b.division_id] ? byId[b.division_id].division_name : '';
      if (da !== db) return da.localeCompare(db);
      return (a.draft_spot || 0) - (b.draft_spot || 0);
    });

    container.innerHTML = `
      <div class="not-linked-head">
        <p class="not-linked-count">${rows.length} not logged in</p>
        ${(currentProfile.admin_level || 0) >= 7 ? `<div class="not-linked-actions"><button class="section-button" id="refreshLinkedBtn" onclick="refreshLinkStatus()">Refresh Link Status</button><button class="section-button" onclick="sendAllInvites()">Send All Invites</button></div>` : ''}
      </div>
      <div class="divisions-table-wrapper">
        <table class="divisions-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Username</th>
              <th>Division</th>
              <th>Invite Link</th>
              <th>Send Invite</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const p = r.profiles || {};
              const d = byId[r.division_id] || {};
              const isMfl = !!d.mfl_id;
              const username = isMfl ? p.mfl_handle : p.sleeper_handle;
              const canInvite = (currentProfile.admin_level || 0) >= 4 && p.email && d.invite_link;
              return `
              <tr id="invite-row-${r.id}">
                <td>${p.name || '(not set)'}</td>
                <td>${p.email || '-'}</td>
                <td>${username || '<span class="missing-handle">not set</span>'}</td>
                <td>${d.division_name || '-'} <span class="platform-tag">${isMfl ? 'MFL' : 'Sleeper'}</span></td>
                <td>${d.invite_link ? `<a href="${d.invite_link}" target="_blank">Join</a>` : '-'}</td>
                <td>${canInvite ? `<button class="btn-action" onclick="sendInvite('${r.id}', this)">Send</button>` : '<span class="platform-tag">-</span>'}</td>
              </tr>
            `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function callInviteFunction(memberIds) {
  const token = localStorage.getItem('sb-auth-token');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ member_ids: memberIds })
  });
  const result = await res.json();
  if (!res.ok || result.error) throw new Error(result.error || `Failed (${res.status})`);
  return result;
}

async function sendInvite(memberId, btn) {
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    const result = await callInviteFunction([memberId]);
    const r = result.results[0];
    if (r && r.ok) {
      btn.textContent = 'Sent ✓';
      btn.style.opacity = '0.6';
    } else {
      btn.disabled = false;
      btn.textContent = 'Retry';
      alert('Could not send: ' + (r ? r.error : 'unknown error'));
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Retry';
    alert('Error: ' + err.message);
  }
}

async function refreshLinkStatus() {
  const btn = document.getElementById('refreshLinkedBtn');
  if (!btn) return;

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Refreshing...';

  try {
    const token = localStorage.getItem('sb-auth-token');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/trigger-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      },
      body: '{}'
    });

    const result = await res.json();
    if (!res.ok || result.error) throw new Error(result.error || `Failed (${res.status})`);

    btn.textContent = 'Sync started...';

    setTimeout(() => {
      btn.textContent = 'Reloading...';
      loadNotLoggedIn();
    }, 45000);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = original;
    alert('Could not start sync: ' + err.message);
  }
}

async function sendAllInvites() {
  const buttons = [...document.querySelectorAll('[id^="invite-row-"] .btn-action')]
    .filter(b => b.textContent === 'Send' || b.textContent === 'Retry');

  if (buttons.length === 0) {
    alert('No pending invites to send.');
    return;
  }
  if (!confirm(`Send invites to ${buttons.length} member(s)?`)) return;

  for (const btn of buttons) {
    const row = btn.closest('[id^="invite-row-"]');
    const memberId = row.id.replace('invite-row-', '');
    await sendInvite(memberId, btn);
    await new Promise(r => setTimeout(r, 400));
  }
}

function renderDivisionsView() {
  const adminLevel = currentProfile.admin_level || 0;
  const divisions = window.currentDivisions || [];
  const visible = filterDivisions(divisions);

  const statusFilters = [
    ['all', 'All Divisions'],
    ['active', 'Active'],
    ['inactive', 'Not Active'],
    ['sleeper', 'Sleeper'],
    ['mfl', 'MFL'],
    ['notlinked', 'Not Logged In']
  ];

  const stageFilters = [
    ['all', 'All Stages'],
    ['0', 'Stage 0'],
    ['1', 'Stage 1'],
    ['2', 'Stage 2'],
    ['3', 'Stage 3'],
    ['4', 'Stage 4']
  ];

  if (divisionsFilter === 'notlinked') {
    renderNotLoggedInView(adminLevel, statusFilters, stageFilters);
    return;
  }

  const countText = visible.length === divisions.length
    ? `${divisions.length} divisions`
    : `${visible.length} of ${divisions.length} divisions`;

  let html = `
    <div class="divisions-header">
      <div>
        <h2>${window.currentLeagueName} Divisions</h2>
        <p>${countText}</p>
      </div>
      ${adminLevel >= 7 ? `
        <div class="divisions-header-actions">
        ${adminLevel >= 9 ? `<button class="section-button" id="syncSleeperBtn" onclick="syncSleeperData()">Sync Sleeper</button>` : ''}
          <button class="section-button" onclick="showWaitlistModal()">Waitlist</button>
          <button class="section-button" onclick="showCreateDivisionModal()">+ Create New Division</button>
        </div>
      ` : ''}
    </div>

    <div class="division-filters">
      ${statusFilters.map(([value, label]) => `
        <button class="filter-btn ${divisionsFilter === value ? 'active' : ''}" onclick="applyDivisionsFilter('${value}')">${label}</button>
      `).join('')}
    </div>

    <div class="division-filters">
      ${stageFilters.map(([value, label]) => `
        <button class="filter-btn ${divisionsStageFilter === value ? 'active' : ''}" onclick="applyStageFilter('${value}')">${label}</button>
      `).join('')}
    </div>
  `;

  if (visible.length === 0) {
    html += divisions.length === 0
      ? '<div class="empty-state">No divisions in this league yet</div>'
      : '<div class="empty-state">No divisions match these filters</div>';
    document.getElementById('divisionsView').innerHTML = html;
    return;
  }

  html += `
    <div class="divisions-table-wrapper">
      <table class="divisions-table">
        <thead>
          <tr>
            <th>Division Name</th>
            <th>MFLID</th>
            <th>SLEEPER ID</th>
            <th>Draftboard</th>
            <th>Active</th>
            <th>Host</th>
            <th>Entrants</th>
            <th>Logged In</th>
            <th>Stage</th>
            <th>Invite Link</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${visible.map(d => {
            const stageName = STAGE_NAMES[d.league_stage] || `Stage ${d.league_stage}`;
            return `
            <tr>
              <td><strong>${adminLevel >= 4 ? `<a class="division-link" onclick="viewDivisionDetails('${d.id}')">${d.division_name}</a>` : d.division_name}</strong></td>
              <td>${d.mfl_id || '-'}</td>
              <td>${d.sleeper_id || '-'}</td>
              <td>${d.draftboard_url ? `<a href="${d.draftboard_url}" target="_blank">View</a>` : '-'}</td>
              <td><span class="badge ${d.is_active ? 'active' : 'inactive'}">${d.is_active ? 'Active' : 'Inactive'}</span></td>
              <td>${getHostPlatform(d)}</td>
              <td id="entrants-${d.id}">…</td>
              <td id="loggedin-${d.id}">…</td>
              <td>${stageName}</td>
              <td>${d.invite_link ? `<a href="${d.invite_link}" target="_blank">Join</a>` : '-'}</td>
              <td><button class="btn-action" onclick="editDivisionModal('${d.id}')">Edit</button></td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById('divisionsView').innerHTML = html;
  loadDivisionCounts(visible);
}

function applyDivisionsFilter(filter) {
  divisionsFilter = filter;
  renderDivisionsView();
}

function applyStageFilter(stage) {
  divisionsStageFilter = stage;
  renderDivisionsView();
}

async function viewDivisionDetails(divisionId) {
  const token = localStorage.getItem('sb-auth-token');
  
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load division');

    const data = await res.json();
    if (!data || data.length === 0) {
      alert('Division not found');
      return;
    }

    const division = data[0];
    showDivisionDetailView(division);
  } catch (err) {
    alert('Error loading division: ' + err.message);
  }
}

function showDivisionDetailView(division) {
  const stageNames = {
    0: 'Pre-Draft',
    1: 'League Filled',
    2: 'League Linked',
    3: 'Round 2',
    4: 'Draft Completed'
  };
  
  const stageName = stageNames[division.league_stage] || `Stage ${division.league_stage}`;
  
  let html = `
    <div class="division-detail-view">
      <button class="back-button" onclick="backToDivisionsList()">← Back to Divisions</button>
      
      <div class="division-detail-header">
        <div>
          <h2>${division.division_name}</h2>
          <div class="division-meta">
            <span class="badge ${division.is_active ? 'active' : 'inactive'}">${division.is_active ? 'Active' : 'Inactive'}</span>
            <span class="stage-badge">${stageName}</span>
          </div>
        </div>
        <div class="header-actions">
          <button class="edit-division-btn" onclick="editDivisionFromDetail('${division.id}')">Edit Division</button>
          <button class="add-users-btn" onclick="showAddUsersModal('${division.id}')">+ Add Users</button>
        </div>
      </div>
      
      <div class="division-info-grid">
        <div class="info-item">
          <label>MFL ID</label>
          <p>${division.mfl_id || '-'}</p>
        </div>
        <div class="info-item">
          <label>Sleeper ID</label>
          <p>${division.sleeper_id || '-'}</p>
        </div>
        <div class="info-item">
          <label>Draftboard</label>
          <p>${division.draftboard_url ? `<a href="${division.draftboard_url}" target="_blank" class="url-link">${division.draftboard_url}</a>` : '-'}</p>
        </div>
        <div class="info-item">
          <label>Invite Link</label>
          <p>${division.invite_link ? `<a href="${division.invite_link}" target="_blank" class="url-link">${division.invite_link}</a>` : '-'}</p>
        </div>
      </div>
      
      <div class="division-teams">
        <h3>Teams in Division</h3>
        <div id="teams-table-container"></div>
      </div>
    </div>
  `;
  
  document.getElementById('divisionsView').innerHTML = html;
  loadDivisionTeams(division.id);
}

async function loadDivisionTeams(divisionId) {
  const token = localStorage.getItem('sb-auth-token');
  const adminLevel = currentProfile.admin_level || 0;
  
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?division_id=eq.${divisionId}&order=draft_spot.asc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load teams');

    const members = await res.json();
    
    if (!members || members.length === 0) {
      document.getElementById('teams-table-container').innerHTML = '<p class="empty">No teams assigned to this division yet</p>';
      return;
    }

    let profileIds = members.map(m => m.user_id);
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=in.(${profileIds.join(',')})`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!profileRes.ok) throw new Error('Failed to load profiles');

    const profiles = await profileRes.json();
    const profileMap = {};
    profiles.forEach(p => profileMap[p.id] = p);

    let sleeperUsernames = null;
    const divRes = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}&select=sleeper_id,mfl_id`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    let isMfl = false;

    if (divRes.ok) {
      const divRows = await divRes.json();
      if (divRows.length > 0) {
        isMfl = !!divRows[0].mfl_id;
        if (!isMfl && divRows[0].sleeper_id) {
          sleeperUsernames = await fetchSleeperUsernames(divRows[0].sleeper_id);
        }
      }
    }

    let html = `
      <table class="teams-table">
        <thead>
          <tr>
            <th>Draft Slot</th>
            <th>Name</th>
            <th>Email</th>
            <th>SLFF ID</th>
            <th>Roster ID</th>
            <th>${isMfl ? 'Team Name' : 'Sleeper Username'}</th>
            <th>Status</th>
            ${adminLevel >= 7 ? '<th>Actions</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${members.map(member => {
            const profile = profileMap[member.user_id];
            if (!profile) return '';
            
            const slffid = profile.slffid || profile.id.substring(0, 8);
            
            const draftSpotCell = adminLevel >= 4
              ? `<div class="editable-cell"><span class="editable-spot" onclick="updateDraftSpot('${member.id}', '${divisionId}', '${member.user_id}', ${member.draft_spot || 'null'})">${member.draft_spot || '-'}</span><button class="btn-inline-update" onclick="updateDraftSpot('${member.id}', '${divisionId}', '${member.user_id}', ${member.draft_spot || 'null'})">✎</button></div>`
              : `<strong>${member.draft_spot || '-'}</strong>`;
            
            const handleField = isMfl ? 'mfl_handle' : 'sleeper_handle';
            const handle = profile[handleField] ? profile[handleField].trim() : '';
            const checkFailed = isMfl ? !member.linked_at : !sleeperUsernames;
            const linked = isMfl
              ? !!member.linked
              : !!(sleeperUsernames && handle && sleeperUsernames.has(handle.toLowerCase()));
            const statusDisplay = checkFailed ? 'Unknown' : (linked ? 'LINKED' : 'Not Logged In');
            const statusBadgeClass = linked ? 'active' : 'inactive';
            
            return `
              <tr>
                <td>${draftSpotCell}</td>
                <td>${profile.name || '-'}</td>
                <td>${profile.email}</td>
                <td>${slffid}</td>
                <td>${member.roster_id || '-'}</td>
                <td>
                  <div class="sleeper-cell">
                    <span id="sleeper-${member.id}">${isMfl ? (member.team_name || '-') : (handle || '-')}</span>
                    ${!isMfl && adminLevel >= 4 ? `<button class="btn-inline-update" onclick="updateSleeperHandle('${member.id}', '${profile.id}', '${handleField}')">✎</button>` : ''}
                  </div>
                </td>
                <td>
                  <span class="badge ${statusBadgeClass}">
                    ${statusDisplay}
                  </span>
                </td>
                ${adminLevel >= 7 ? `<td><button class="btn-remove" onclick="removeUserFromDivision('${member.id}', '${divisionId}', '${profile.name || profile.email}', '${member.user_id}')">Remove</button></td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    
    document.getElementById('teams-table-container').innerHTML = html;
  } catch (err) {
    console.error('Error loading teams:', err);
    document.getElementById('teams-table-container').innerHTML = `<div class="error">Error loading teams: ${err.message}</div>`;
  }
}

function backToDivisionsList() {
  const leagueSelect = document.getElementById('leagueSelect');
  if (leagueSelect) {
    filterLeagueDisplay(leagueSelect.value);
  }
}

async function editDivisionFromDetail(divisionId) {
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load division');

    const data = await res.json();
    if (!data || data.length === 0) {
      alert('Division not found');
      return;
    }

    showEditDivisionModal(data[0]);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function showAddUsersModal(divisionId) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content add-users-modal">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Add Users to Division</h3>
      
      <div class="form-group">
        <label for="user-search">Search Users</label>
        <input type="text" id="user-search" placeholder="Search by name or email...">
      </div>
      
      <div id="user-search-results" class="user-search-results"></div>
      
      <div id="selected-users" class="selected-users">
        <h4>Selected Users</h4>
        <div id="selected-list"></div>
      </div>
      
      <div class="modal-actions">
        <button class="modal-button" onclick="addSelectedUsersToDiv('${divisionId}')">Add to Division</button>
        <button class="modal-button cancel-btn" onclick="this.closest('.modal').remove()">Cancel</button>
        <div id="add-users-message"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const searchInput = document.getElementById('user-search');
  searchInput.addEventListener('input', () => searchUsers(searchInput.value));
}

async function searchUsers(query) {
  if (!query || query.length < 2) {
    document.getElementById('user-search-results').innerHTML = '';
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    const searchTerm = `%${query}%`;
    
    const nameUrl = `${SUPABASE_URL}/rest/v1/profiles?name=ilike.${encodeURIComponent(searchTerm)}&select=id,name,email&limit=50`;
    const emailUrl = `${SUPABASE_URL}/rest/v1/profiles?email=ilike.${encodeURIComponent(searchTerm)}&select=id,name,email&limit=50`;
    
    let users = [];
    const userMap = new Map();
    
    try {
      const nameRes = await fetch(nameUrl, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        }
      });

      if (nameRes.ok) {
        const nameUsers = await nameRes.json();
        nameUsers.forEach(u => {
          if (!userMap.has(u.id)) {
            userMap.set(u.id, u);
            users.push(u);
          }
        });
      }
    } catch (err) {
      console.error('Name search error:', err);
    }
    
    try {
      const emailRes = await fetch(emailUrl, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
        }
      });

      if (emailRes.ok) {
        const emailUsers = await emailRes.json();
        emailUsers.forEach(u => {
          if (!userMap.has(u.id)) {
            userMap.set(u.id, u);
            users.push(u);
          }
        });
      }
    } catch (err) {
      console.error('Email search error:', err);
    }
    
    let html = '<div class="user-list">';
    if (users.length === 0) {
      html += '<p class="no-results">No users found</p>';
    } else {
      html += users.map(u => `
        <div class="user-item" onclick="toggleUserSelection('${u.id}', '${(u.name || u.email).replace(/'/g, "\\'")}')">
          <input type="checkbox" id="user-${u.id}" class="user-checkbox">
          <label for="user-${u.id}">
            <strong>${u.name || u.email}</strong>
            <span class="user-email">${u.email}</span>
          </label>
        </div>
      `).join('');
    }
    html += '</div>';
    
    document.getElementById('user-search-results').innerHTML = html;
  } catch (err) {
    console.error('Search error:', err);
    document.getElementById('user-search-results').innerHTML = `<div class="error">Error searching users: ${err.message}</div>`;
  }
}

const selectedUsers = new Map();

function toggleUserSelection(userId, userName) {
  const checkbox = document.getElementById(`user-${userId}`);
  checkbox.checked = !checkbox.checked;
  
  if (checkbox.checked) {
    selectedUsers.set(userId, userName);
  } else {
    selectedUsers.delete(userId);
  }
  
  updateSelectedList();
}

function updateSelectedList() {
  const list = document.getElementById('selected-list');
  if (selectedUsers.size === 0) {
    list.innerHTML = '<p class="no-selection">No users selected</p>';
  } else {
    list.innerHTML = Array.from(selectedUsers.entries()).map(([id, name]) => `
      <div class="selected-item">
        <span>${name}</span>
        <button class="remove-btn" onclick="toggleUserSelection('${id}', '${name}')">Remove</button>
      </div>
    `).join('');
  }
}

async function addSelectedUsersToDiv(divisionId) {
  if (selectedUsers.size === 0) {
    alert('Please select at least one user');
    return;
  }

  const button = document.querySelector('.add-users-modal .modal-button:not(.cancel-btn)');
  button.disabled = true;
  button.style.opacity = '0.6';

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    let successCount = 0;
    let errorDetails = [];
    const successfulUserIds = [];
    
    for (const [userId, userName] of selectedUsers.entries()) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            division_id: divisionId,
            user_id: userId
          })
        });

        if (!res.ok) {
          const error = await res.text();
          console.error(`Error adding ${userName}:`, res.status, error);
          
          if (error.includes('duplicate key') || error.includes('violates unique constraint')) {
            errorDetails.push(`${userName} is already in this division`);
          } else {
            errorDetails.push(`Failed to add ${userName}`);
          }
        } else {
          successCount++;
          successfulUserIds.push(userId);
        }
      } catch (err) {
        console.error(`Error adding ${userName}:`, err);
        errorDetails.push(`Error adding ${userName}`);
      }
    }

    if (successfulUserIds.length > 0) {
      for (const userId of successfulUserIds) {
        try {
          await syncProfileWithDivision(userId, divisionId, null);
        } catch (err) {
          console.error('Profile sync failed for', userId, err);
          errorDetails.push(`${selectedUsers.get(userId)} was added, but their profile did not update: ${err.message}`);
        }
      }
    }

    const messageEl = document.getElementById('add-users-message');
    
    if (successCount > 0 && errorDetails.length === 0) {
      messageEl.textContent = `Successfully added ${successCount} user(s)!`;
      messageEl.style.color = '#16a34a';
      
      setTimeout(() => {
        document.querySelector('.modal').remove();
        selectedUsers.clear();
        loadDivisionTeams(divisionId);
      }, 1500);
    } else if (successCount > 0) {
      messageEl.textContent = `Added ${successCount} user(s). Issues: ${errorDetails.join(', ')}`;
      messageEl.style.color = '#f59e0b';
      messageEl.style.marginTop = '10px';
      button.disabled = false;
      button.style.opacity = '1';
      
      setTimeout(() => {
        document.querySelector('.modal').remove();
        selectedUsers.clear();
        loadDivisionTeams(divisionId);
      }, 2000);
    } else {
      messageEl.textContent = errorDetails.length > 0 ? errorDetails[0] : 'Failed to add users';
      messageEl.style.color = '#dc2626';
      messageEl.style.marginTop = '10px';
      button.disabled = false;
      button.style.opacity = '1';
    }
  } catch (err) {
    console.error('Error in addSelectedUsersToDiv:', err);
    button.disabled = false;
    button.style.opacity = '1';
    const messageEl = document.getElementById('add-users-message');
    messageEl.textContent = 'Error: ' + err.message;
    messageEl.style.color = '#dc2626';
    messageEl.style.marginTop = '10px';
  }
}

async function updateDraftSpot(memberId, divisionId, userId, currentSpot) {
  const newSpot = prompt(`Enter draft spot (1-12, or leave blank for none):`, currentSpot || '');
  
  if (newSpot === null) return;
  
  const draftSpot = newSpot.trim() === '' ? null : parseInt(newSpot);
  
  if (draftSpot && (draftSpot < 1 || draftSpot > 12 || isNaN(draftSpot))) {
    alert('Draft spot must be between 1 and 12, or leave blank');
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?id=eq.${memberId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        draft_spot: draftSpot,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) throw new Error('Failed to update draft spot');

    try {
      await syncProfileWithDivision(userId, divisionId, draftSpot);
      alert('Draft spot updated!');
    } catch (err) {
      alert(`Draft spot saved on the roster, but the profile did not sync: ${err.message}`);
    }
    loadDivisionTeams(divisionId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function syncProfileWithDivision(userId, divisionId, draftSpot) {
  const token = localStorage.getItem('sb-auth-token');

  const divRes = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}&select=id,division_name,league_id,leagues(id,league_name)`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    }
  });

  if (!divRes.ok) throw new Error(`Division lookup failed (${divRes.status}): ${await divRes.text()}`);

  const divData = await divRes.json();
  const division = divData[0];
  if (!division) throw new Error(`Division ${divisionId} not found`);

  const payload = {
    assigned_league_id: division.league_id,
    assigned_league: division.leagues ? division.leagues.league_name : null,
    assigned_division_id: division.id,
    assigned_division: division.division_name || null,
    draft_spot: draftSpot,
    updated_at: new Date().toISOString()
  };

  const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(payload)
  });

  if (!profileRes.ok) throw new Error(`Profile update failed (${profileRes.status}): ${await profileRes.text()}`);

  const rows = await profileRes.json();
  if (rows.length === 0) throw new Error('Profile update affected 0 rows — RLS is blocking the write.');

  await recordLeagueHistory(userId, division.league_id, 'rostered', 'merge-duplicates');

  return rows[0];
}

async function removeUserFromDivision(memberId, divisionId, userName, userId) {
  if (!confirm(`Remove ${userName} from this division?`)) {
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');

    let leagueId = null;
    const divLookup = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}&select=league_id`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (divLookup.ok) {
      const divRows = await divLookup.json();
      if (divRows.length > 0) leagueId = divRows[0].league_id;
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?id=eq.${memberId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to remove user: ${error}`);
    }

    if (leagueId) {
      try {
        const stillIn = await userStillInLeague(userId, leagueId);
        if (!stillIn) {
          await setLeagueHistoryStatus(userId, leagueId, 'waitlist');
        }
      } catch (err) {
        console.error('Failed to downgrade league history to waitlist:', err);
      }
    }

    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        assigned_league_id: null,
        assigned_league: null,
        assigned_division_id: null,
        assigned_division: null,
        draft_spot: null,
        updated_at: new Date().toISOString()
      })
    });

    if (!profileRes.ok) {
      const error = await profileRes.text();
      console.error('Failed to clear profile assignment', profileRes.status, error);
      alert(`${userName} was removed from the division, but their profile did not clear (${profileRes.status}): ${error}`);
      loadDivisionTeams(divisionId);
      return;
    }

    const clearedRows = await profileRes.json();
    if (clearedRows.length === 0) {
      console.error('Profile clear affected 0 rows — RLS is blocking the write.');
      alert(`${userName} was removed from the division, but their profile did not clear — RLS is blocking the write.`);
      loadDivisionTeams(divisionId);
      return;
    }

    alert(`${userName} has been removed from the division`);
    loadDivisionTeams(divisionId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function updateSleeperHandle(memberId, userId, field) {
  const handleField = field === 'mfl_handle' ? 'mfl_handle' : 'sleeper_handle';
  const label = handleField === 'mfl_handle' ? 'MFL' : 'Sleeper';
  const newHandle = prompt(`Enter new ${label} username:`);
  if (!newHandle) return;

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        [handleField]: newHandle,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) throw new Error('Failed to update');

    document.getElementById(`sleeper-${memberId}`).textContent = newHandle;
    alert(`${label} username updated!`);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function editDivisionModal(divisionId) {
  const adminLevel = currentProfile.admin_level || 0;
  
  if (adminLevel < 7) {
    alert('You do not have permission to edit divisions.');
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load division');

    const data = await res.json();
    if (!data || data.length === 0) {
      alert('Division not found');
      return;
    }

    const division = data[0];
    showEditDivisionModal(division);
  } catch (err) {
    alert('Error loading division: ' + err.message);
  }
}

function showEditDivisionModal(division) {
  const hostPlatform = division.mfl_id ? 'MFL' : division.sleeper_id ? 'Sleeper' : 'Not Set';
  
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content division-modal">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Edit Division: ${division.division_name}</h3>
      
      <div class="form-group">
        <label for="div-name">Division Name</label>
        <input type="text" id="div-name" value="${division.division_name || ''}">
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="div-mfl">MFL ID</label>
          <input type="text" id="div-mfl" value="${division.mfl_id || ''}">
        </div>
        
        <div class="form-group">
          <label for="div-sleeper">Sleeper ID</label>
          <input type="text" id="div-sleeper" value="${division.sleeper_id || ''}">
        </div>
      </div>
      
      <div class="form-group">
        <label>Host Platform</label>
        <div class="host-badge">${hostPlatform}</div>
        <p class="host-note">Automatically detected from IDs above</p>
      </div>
      
      <div class="form-group">
        <label for="div-draftboard">Draftboard URL</label>
        <input type="url" id="div-draftboard" placeholder="https://..." value="${division.draftboard_url || ''}">
      </div>
      
      <div class="form-group">
        <label for="div-invite">Invite Link</label>
        <input type="url" id="div-invite" placeholder="https://..." value="${division.invite_link || ''}">
      </div>
      
      <div class="form-row">
        <div class="form-group">
          <label for="div-active">Status</label>
          <select id="div-active">
            <option value="false" ${!division.is_active ? 'selected' : ''}>Inactive</option>
            <option value="true" ${division.is_active ? 'selected' : ''}>Active</option>
          </select>
        </div>
        
        <div class="form-group">
          <label for="div-stage">League Stage</label>
          <select id="div-stage">
            <option value="0" ${division.league_stage === 0 ? 'selected' : ''}>Stage 0 - Pre-Draft</option>
            <option value="1" ${division.league_stage === 1 ? 'selected' : ''}>Stage 1 - League Filled</option>
            <option value="2" ${division.league_stage === 2 ? 'selected' : ''}>Stage 2 - League Linked</option>
            <option value="3" ${division.league_stage === 3 ? 'selected' : ''}>Stage 3 - Round 2</option>
            <option value="4" ${division.league_stage === 4 ? 'selected' : ''}>Stage 4 - Draft Completed</option>
          </select>
        </div>
      </div>
      
      <div class="modal-actions">
        <button class="modal-button" onclick="saveDivisionChanges('${division.id}')">Save Changes</button>
        <button class="modal-button cancel-btn" onclick="this.closest('.modal').remove()">Cancel</button>
        <div id="division-edit-message"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function saveDivisionChanges(divisionId) {
  const adminLevel = currentProfile.admin_level || 0;
  
  if (adminLevel < 7) {
    alert('You do not have permission to edit divisions.');
    return;
  }

  const updates = {
    division_name: document.getElementById('div-name').value.trim(),
    mfl_id: document.getElementById('div-mfl').value.trim() || null,
    sleeper_id: document.getElementById('div-sleeper').value.trim() || null,
    draftboard_url: document.getElementById('div-draftboard').value.trim() || null,
    invite_link: document.getElementById('div-invite').value.trim() || null,
    is_active: document.getElementById('div-active').value === 'true',
    league_stage: parseInt(document.getElementById('div-stage').value),
    updated_at: new Date().toISOString()
  };

  if (!updates.division_name) {
    alert('Division name is required');
    return;
  }

  const button = document.querySelector('.modal-actions .modal-button:not(.cancel-btn)');
  button.disabled = true;
  button.style.opacity = '0.6';

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(updates)
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Failed to update division: ${error}`);
    }

    const messageEl = document.getElementById('division-edit-message');
    messageEl.textContent = 'Changes saved successfully!';
    messageEl.style.color = '#16a34a';
    messageEl.style.marginTop = '10px';

    setTimeout(() => {
      document.querySelector('.modal').remove();
      loadLeagues();
    }, 1500);
  } catch (err) {
    console.error('Error saving changes:', err);
    button.disabled = false;
    button.style.opacity = '1';
    const messageEl = document.getElementById('division-edit-message');
    messageEl.textContent = 'Error: ' + err.message;
    messageEl.style.color = '#dc2626';
    messageEl.style.marginTop = '10px';
  }
}

function showWaitlistModal() {
  const adminLevel = currentProfile.admin_level || 0;

  if (adminLevel < 7) {
    alert('You do not have permission to manage the waitlist.');
    return;
  }

  if (!window.currentLeagueId) {
    alert('Select a league first.');
    return;
  }

  selectedUsers.clear();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content add-users-modal">
      <button class="modal-close" onclick="closeWaitlistModal()">✕</button>
      <h3>${window.currentLeagueName} Waitlist</h3>
      <p class="host-note">Registered for this season but not rostered in a division</p>

      <div id="waitlist-current" class="waitlist-current"><div class="loading">Loading waitlist...</div></div>

      <div class="form-group">
        <label for="user-search">Add Users to Waitlist</label>
        <input type="text" id="user-search" placeholder="Search by name or email...">
      </div>

      <div id="user-search-results" class="user-search-results"></div>

      <div id="selected-users" class="selected-users">
        <h4>Selected Users</h4>
        <div id="selected-list"></div>
      </div>

      <div class="modal-actions">
        <button class="modal-button" onclick="addSelectedUsersToWaitlist()">Add to Waitlist</button>
        <button class="modal-button cancel-btn" onclick="closeWaitlistModal()">Close</button>
        <div id="add-users-message"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const searchInput = document.getElementById('user-search');
  searchInput.addEventListener('input', () => searchUsers(searchInput.value));

  loadWaitlist();
}

function closeWaitlistModal() {
  selectedUsers.clear();
  const modal = document.querySelector('.modal');
  if (modal) modal.remove();
}

async function loadWaitlist() {
  const container = document.getElementById('waitlist-current');
  if (!container) return;

  const token = localStorage.getItem('sb-auth-token');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/league_history?league_id=eq.${window.currentLeagueId}&status=eq.waitlist&select=id,profiles(id,name,email)`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error(`Failed to load waitlist (${res.status})`);

    const rows = await res.json();

    if (rows.length === 0) {
      container.innerHTML = '<p class="empty">Nobody is waitlisted for this league</p>';
      return;
    }

    container.innerHTML = `
      <h4>Currently Waitlisted (${rows.length})</h4>
      ${rows.map(r => `
        <div class="waitlist-row">
          <span>${r.profiles ? (r.profiles.name || r.profiles.email) : 'Unknown user'}</span>
          <button class="btn-remove" onclick="removeFromWaitlist('${r.id}')">Remove</button>
        </div>
      `).join('')}
    `;
  } catch (err) {
    container.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function removeFromWaitlist(historyId) {
  const token = localStorage.getItem('sb-auth-token');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/league_history?id=eq.${historyId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error(`Failed to remove (${res.status}): ${await res.text()}`);

    loadWaitlist();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function addSelectedUsersToWaitlist() {
  if (selectedUsers.size === 0) {
    alert('Please select at least one user');
    return;
  }

  const button = document.querySelector('.modal-actions .modal-button:not(.cancel-btn)');
  button.disabled = true;
  button.style.opacity = '0.6';

  const messageEl = document.getElementById('add-users-message');
  const errors = [];
  let successCount = 0;

  for (const [userId, userName] of selectedUsers.entries()) {
    try {
      await recordLeagueHistory(userId, window.currentLeagueId, 'waitlist', 'ignore-duplicates');
      successCount++;
    } catch (err) {
      console.error('Waitlist add failed for', userName, err);
      errors.push(`${userName}: ${err.message}`);
    }
  }

  button.disabled = false;
  button.style.opacity = '1';

  messageEl.style.marginTop = '10px';

  if (errors.length === 0) {
    messageEl.textContent = `Added ${successCount} user(s) to the waitlist`;
    messageEl.style.color = '#16a34a';
  } else {
    messageEl.textContent = `Added ${successCount}. Issues: ${errors.join(', ')}`;
    messageEl.style.color = '#f59e0b';
  }

  selectedUsers.clear();
  updateSelectedList();
  document.getElementById('user-search').value = '';
  document.getElementById('user-search-results').innerHTML = '';
  loadWaitlist();
}

function showCreateDivisionModal() {
  const adminLevel = currentProfile.admin_level || 0;

  if (adminLevel < 7) {
    alert('You do not have permission to create divisions.');
    return;
  }

  if (!window.currentLeagueId) {
    alert('Select a league first.');
    return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content division-modal">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Create Division in ${window.currentLeagueName}</h3>

      <div class="form-group">
        <label for="new-div-name">Division Name</label>
        <input type="text" id="new-div-name" placeholder="e.g. Division 5">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-div-mfl">MFL ID</label>
          <input type="text" id="new-div-mfl">
        </div>

        <div class="form-group">
          <label for="new-div-sleeper">Sleeper ID</label>
          <input type="text" id="new-div-sleeper">
        </div>
      </div>

      <div class="form-group">
        <label for="new-div-draftboard">Draftboard URL</label>
        <input type="url" id="new-div-draftboard" placeholder="https://...">
      </div>

      <div class="form-group">
        <label for="new-div-invite">Invite Link</label>
        <input type="url" id="new-div-invite" placeholder="https://...">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-div-active">Status</label>
          <select id="new-div-active">
            <option value="true" selected>Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div class="form-group">
          <label for="new-div-stage">League Stage</label>
          <select id="new-div-stage">
            <option value="0" selected>Stage 0 - Pre-Draft</option>
            <option value="1">Stage 1 - League Filled</option>
            <option value="2">Stage 2 - League Linked</option>
            <option value="3">Stage 3 - Round 2</option>
            <option value="4">Stage 4 - Draft Completed</option>
          </select>
        </div>
      </div>

      <div class="modal-actions">
        <button class="modal-button" onclick="saveNewDivision()">Create Division</button>
        <button class="modal-button cancel-btn" onclick="this.closest('.modal').remove()">Cancel</button>
        <div id="division-create-message"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function saveNewDivision() {
  const adminLevel = currentProfile.admin_level || 0;

  if (adminLevel < 7) {
    alert('You do not have permission to create divisions.');
    return;
  }

  const division = {
    league_id: window.currentLeagueId,
    division_name: document.getElementById('new-div-name').value.trim(),
    mfl_id: document.getElementById('new-div-mfl').value.trim() || null,
    sleeper_id: document.getElementById('new-div-sleeper').value.trim() || null,
    draftboard_url: document.getElementById('new-div-draftboard').value.trim() || null,
    invite_link: document.getElementById('new-div-invite').value.trim() || null,
    is_active: document.getElementById('new-div-active').value === 'true',
    league_stage: parseInt(document.getElementById('new-div-stage').value)
  };

  if (!division.division_name) {
    alert('Division name is required');
    return;
  }

  const button = document.querySelector('.modal-actions .modal-button:not(.cancel-btn)');
  button.disabled = true;
  button.style.opacity = '0.6';

  const messageEl = document.getElementById('division-create-message');

  try {
    const token = localStorage.getItem('sb-auth-token');

    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(division)
    });

    if (!res.ok) {
      throw new Error(`Failed to create division (${res.status}): ${await res.text()}`);
    }

    const created = await res.json();
    if (created.length === 0) {
      throw new Error('Division insert affected 0 rows — RLS is blocking the write.');
    }

    messageEl.textContent = 'Division created!';
    messageEl.style.color = '#16a34a';
    messageEl.style.marginTop = '10px';

    setTimeout(() => {
      document.querySelector('.modal').remove();
      displayLeagueDivisions(window.currentLeagueId, window.currentLeagueName);
    }, 1200);
  } catch (err) {
    console.error('Error creating division:', err);
    button.disabled = false;
    button.style.opacity = '1';
    messageEl.textContent = 'Error: ' + err.message;
    messageEl.style.color = '#dc2626';
    messageEl.style.marginTop = '10px';
  }
}

function showCreateLeagueModal() {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Create New League</h3>
      
      <div class="form-group">
        <label for="leagueName">League Name</label>
        <input type="text" id="leagueName" placeholder="e.g., SLFF4">
      </div>
      
      <div class="form-group">
        <label for="leagueYear">Year</label>
        <input type="number" id="leagueYear" placeholder="2024" value="${new Date().getFullYear()}">
      </div>
      
      <button class="modal-button" onclick="saveNewLeague()">Create League</button>
      <div id="createLeagueMessage"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function saveNewLeague() {
  const name = document.getElementById('leagueName').value.trim();
  const year = parseInt(document.getElementById('leagueYear').value);
  
  if (!name || !year) {
    alert('Please fill in all fields');
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leagues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        league_name: name,
        year: year,
        created_by: currentUser.id
      })
    });

    if (!res.ok) throw new Error('Failed to create league');

    document.querySelector('.modal').remove();
    loadLeagues();
  } catch (err) {
    document.getElementById('createLeagueMessage').innerHTML = `<div class="error">${err.message}</div>`;
  }
}

const ADMIN_LEVELS = [
  { value: 9, name: 'Super Admin', desc: 'Everything, including managing admins and creating leagues' },
  { value: 7, name: 'Manager', desc: 'Create and edit divisions, add and remove members, edit profiles' },
  { value: 4, name: 'Editor', desc: 'View members and update handles' },
  { value: 1, name: 'Viewer', desc: 'View division members only' }
];

function adminLevelName(level) {
  const match = ADMIN_LEVELS.find(l => l.value === level);
  return match ? match.name : `Level ${level}`;
}

async function loadAdminManagement() {
  const container = document.getElementById('adminContent');
  container.innerHTML = '<div class="loading">Loading admin management...</div>';

  const myLevel = currentProfile.admin_level || 0;
  const canManage = myLevel >= 7;
  const isSuper = myLevel >= 9;
  const grantable = isSuper ? ADMIN_LEVELS : ADMIN_LEVELS.filter(l => l.value <= 4);
  const token = localStorage.getItem('sb-auth-token');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?admin_level=gt.0&select=id,name,email,admin_level&order=admin_level.desc,name.asc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error(`Failed to load admins (${res.status})`);

    const admins = await res.json();
    const superAdmins = admins.filter(a => a.admin_level === 9).length;

    container.innerHTML = `
      ${canManage ? `
        <div class="admin-grant">
          <button class="section-button" onclick="showCreateUserModal()">+ Create New User</button>
          <h3>Grant Admin Access</h3>
          <p class="hint">Search for any member, then choose the level to give them.</p>
          <input type="text" id="admin-search" placeholder="Search by name or email...">
          <div id="admin-search-results"></div>
        </div>
      ` : '<div class="access-card"><p>You can view admins but only Super Admins can change levels.</p></div>'}

      <div class="admin-list">
        <h3>Current Admins (${admins.length})</h3>
        <div class="divisions-table-wrapper">
          <table class="divisions-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Level</th>
                <th>Role</th>
                ${canManage ? '<th>Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${admins.map(a => {
                const isSelf = a.id === currentProfile.id;
                const lastSuper = a.admin_level === 9 && superAdmins <= 1;
                const outOfReach = !isSuper && a.admin_level > 4;
                return `
                <tr>
                  <td><strong>${a.name || '(not set)'}</strong>${isSelf ? ' <span class="platform-tag">you</span>' : ''}</td>
                  <td>${a.email || '-'}</td>
                  <td><span class="badge active">${a.admin_level}</span></td>
                  <td>${adminLevelName(a.admin_level)}</td>
                  ${canManage ? `
                    <td>
                      ${isSelf || lastSuper || outOfReach
                        ? `<span class="platform-tag">${isSelf ? 'cannot edit own level' : outOfReach ? 'super admin only' : 'last super admin'}</span>`
                        : `
                          <select class="level-select" onchange="changeAdminLevel('${a.id}', this.value, '${(a.name || a.email || '').replace(/'/g, "\\'")}')">
                            ${grantable.map(l => `<option value="${l.value}" ${l.value === a.admin_level ? 'selected' : ''}>${l.value} - ${l.name}</option>`).join('')}
                            <option value="0">0 - Remove access</option>
                          </select>
                        `}
                    </td>
                  ` : ''}
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="admin-activity-panel" id="adminActivityPanel">
        <h3>Admin Activity</h3>
        <div class="loading">Loading...</div>
      </div>

      <div class="admin-legend">
        <h3>What Each Level Can Do</h3>
        ${ADMIN_LEVELS.map(l => `
          <div class="legend-row">
            <span class="badge active">${l.value}</span>
            <div>
              <strong>${l.name}</strong>
              <p>${l.desc}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    if (canManage) {
      const input = document.getElementById('admin-search');
      input.addEventListener('input', () => searchAdminCandidates(input.value));
    }

    try {
      const activity = await fetchAdminActivity();
      document.getElementById('adminActivityPanel').innerHTML =
        `<h3>Admin Activity</h3>` + renderAdminActivityTable(activity);
    } catch (err) {
      document.getElementById('adminActivityPanel').innerHTML =
        `<h3>Admin Activity</h3><div class="error">${err.message}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function showCreateUserModal() {
  const myLevel = currentProfile.admin_level || 0;
  if (myLevel < 7) {
    alert('You do not have permission to create users.');
    return;
  }

  const isSuper = myLevel >= 9;
  const levels = isSuper ? ADMIN_LEVELS : ADMIN_LEVELS.filter(l => l.value <= 4);

  let nextId = '';
  try {
    const token = localStorage.getItem('sb-auth-token');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=slffid&order=slffid.desc&limit=1`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const rows = await res.json();
      const highest = rows.length && /^\d+$/.test(rows[0].slffid) ? parseInt(rows[0].slffid, 10) : 1000;
      nextId = String(highest + 1);
    }
  } catch (err) {
    console.error('Could not read highest SLFF ID:', err);
  }

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content division-modal">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Create New User</h3>
      <p class="host-note">Creates the login and the profile. Password will be SLFF + their SLFF ID.</p>

      <div class="form-group">
        <label for="new-user-name">Full Name</label>
        <input type="text" id="new-user-name" placeholder="Jane Smith">
      </div>

      <div class="form-group">
        <label for="new-user-email">Email</label>
        <input type="email" id="new-user-email" placeholder="jane@example.com">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="new-user-slffid">SLFF ID</label>
          <input type="text" id="new-user-slffid" value="${nextId}">
        </div>

        <div class="form-group">
          <label for="new-user-level">Admin Level</label>
          <select id="new-user-level">
            <option value="0" selected>0 - User (no dashboard)</option>
            ${levels.map(l => `<option value="${l.value}">${l.value} - ${l.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="modal-actions">
        <button class="modal-button" onclick="saveNewUser()">Create User</button>
        <button class="modal-button cancel-btn" onclick="this.closest('.modal').remove()">Cancel</button>
        <div id="create-user-message"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function saveNewUser() {
  const payload = {
    name: document.getElementById('new-user-name').value.trim(),
    email: document.getElementById('new-user-email').value.trim(),
    slffid: document.getElementById('new-user-slffid').value.trim(),
    admin_level: parseInt(document.getElementById('new-user-level').value, 10)
  };

  const messageEl = document.getElementById('create-user-message');
  messageEl.style.marginTop = '10px';

  if (!payload.name || !payload.email || !payload.slffid) {
    messageEl.textContent = 'Name, email and SLFF ID are all required';
    messageEl.style.color = '#dc2626';
    return;
  }

  const button = document.querySelector('.modal-actions .modal-button:not(.cancel-btn)');
  button.disabled = true;
  button.style.opacity = '0.6';
  messageEl.textContent = 'Creating...';
  messageEl.style.color = '#8fa3b5';

  try {
    const token = localStorage.getItem('sb-auth-token');
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (!res.ok || result.error) {
      throw new Error(result.error || `Failed (${res.status})`);
    }

    messageEl.textContent = `Created. Password is ${result.password}`;
    messageEl.style.color = '#16a34a';

    setTimeout(() => {
      const modal = document.querySelector('.modal');
      if (modal) modal.remove();
      loadAdminManagement();
    }, 2500);
  } catch (err) {
    button.disabled = false;
    button.style.opacity = '1';
    messageEl.textContent = 'Error: ' + err.message;
    messageEl.style.color = '#dc2626';
  }
}

async function searchAdminCandidates(query) {
  const results = document.getElementById('admin-search-results');
  if (!results) return;

  if (!query || query.trim().length < 2) {
    results.innerHTML = '';
    return;
  }

  const token = localStorage.getItem('sb-auth-token');
  const term = encodeURIComponent(`%${query.trim()}%`);

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?or=(name.ilike.${term},email.ilike.${term})&select=id,name,email,admin_level&limit=10`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error(`Search failed (${res.status})`);

    const users = await res.json();

    if (users.length === 0) {
      results.innerHTML = '<p class="empty">No members found</p>';
      return;
    }
    const isSuper = (currentProfile.admin_level || 0) >= 9;
    const grantable = isSuper ? ADMIN_LEVELS : ADMIN_LEVELS.filter(l => l.value <= 4);
    results.innerHTML = users.map(u => `
      <div class="admin-search-row">
        <div>
          <strong>${u.name || '(not set)'}</strong>
          <span class="platform-tag">${u.email || ''}</span>
          ${u.admin_level > 0 ? `<span class="badge active">${u.admin_level}</span>` : ''}
        </div>
        <select class="level-select" id="grant-${u.id}">
          ${grantable.map(l => `<option value="${l.value}">${l.value} - ${l.name}</option>`).join('')}
        </select>
        <button class="btn-action" onclick="grantAdmin('${u.id}', '${(u.name || u.email || '').replace(/'/g, "\\'")}')">Grant</button>
      </div>
    `).join('');
  } catch (err) {
    results.innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function grantAdmin(userId, userName) {
  const select = document.getElementById(`grant-${userId}`);
  if (!select) return;

  const level = parseInt(select.value, 10);
  if (!confirm(`Give ${userName} level ${level} (${adminLevelName(level)}) access?`)) return;

  await writeAdminLevel(userId, level, userName);
}

async function changeAdminLevel(userId, value, userName) {
  const level = parseInt(value, 10);
  const label = level === 0 ? 'remove all admin access from' : `set ${userName} to level ${level} (${adminLevelName(level)})`;

  if (!confirm(level === 0 ? `Remove all admin access from ${userName}?` : `Change: ${label}?`)) {
    loadAdminManagement();
    return;
  }

  await writeAdminLevel(userId, level, userName);
}

async function writeAdminLevel(userId, level, userName) {
  const token = localStorage.getItem('sb-auth-token');

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=id,admin_level`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        admin_level: level,
        updated_at: new Date().toISOString()
      })
    });

    if (!res.ok) {
      throw new Error(`${res.status}: ${await res.text()}`);
    }

    const rows = await res.json();
    if (rows.length === 0) {
      throw new Error('Update affected 0 rows - RLS is blocking the write.');
    }

    alert(`${userName} is now level ${level}`);
    loadAdminManagement();
  } catch (err) {
    alert('Could not change level. ' + err.message);
    loadAdminManagement();
  }
}

initAdmin();
