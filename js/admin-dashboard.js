let currentUser = null;
let currentProfile = null;

async function initAdmin() {
  if (!auth.isAuthenticated()) {
    window.location.href = './login.html';
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
    document.body.innerHTML = '<div style="padding: 40px; text-align: center;"><h1>Access Denied</h1><p>You do not have permission to access the admin dashboard.</p><a href="./profile.html" style="color: #e26f0f;">Go to Profile</a></div>';
    return;
  }

  setupUI(adminLevel);
  setupEventListeners();
  loadDashboard(adminLevel);
}

function setupUI(level) {
  const levelNames = {
    1: 'Level 1',
    4: 'Level 4',
    7: 'Level 7',
    9: 'Super Admin'
  };

  document.getElementById('welcomeMsg').textContent = `Welcome, ${currentProfile.name || 'Admin'}`;
  document.getElementById('adminName').textContent = currentProfile.name || 'Admin';
  document.getElementById('adminLevel').textContent = levelNames[level] || `Level ${level}`;
  document.getElementById('levelBadge').textContent = levelNames[level] || `Level ${level}`;
  document.getElementById('yourLevel').textContent = levelNames[level] || `Level ${level}`;
  document.getElementById('accessLevels').textContent = 'Allowed levels: 1, 4, 7, 9';
}

function setupEventListeners() {
  document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      
      btn.classList.add('active');
      const section = btn.dataset.section;
      document.getElementById(section).classList.add('active');
      document.getElementById('pageTitle').textContent = section.charAt(0).toUpperCase() + section.slice(1);
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
      await auth.logout();
      window.location.href = './admin.html';
    });
  
    document.getElementById('headerLogout').addEventListener('click', async () => {
      await auth.logout();
      window.location.href = './admin.html';
    });
  
    document.getElementById('headerUserName').textContent = currentProfile.name || 'Admin';
}

async function loadDashboard(level) {
  const cardsHTML = level === 9 ? `
    <div class="card">
      <h3>👥 All Users</h3>
      <p>View and manage all user profiles</p>
      <button class="card-button" onclick="loadAllUsers()">View Users</button>
    </div>
    <div class="card">
      <h3>⚙️ Manage Admins</h3>
      <p>Adjust admin levels and permissions</p>
      <button class="card-button" onclick="loadAdminManagement()">Manage</button>
    </div>
    <div class="card">
      <h3>✓ Verification</h3>
      <p>Verify user information</p>
      <button class="card-button" onclick="loadVerification()">Verify</button>
    </div>
  ` : level === 7 ? `
    <div class="card">
      <h3>👥 All Users</h3>
      <p>View and manage all user profiles</p>
      <button class="card-button" onclick="loadAllUsers()">View Users</button>
    </div>
    <div class="card">
      <h3>✓ Verification</h3>
      <p>Verify user information</p>
      <button class="card-button" onclick="loadVerification()">Verify</button>
    </div>
  ` : level === 4 ? `
    <div class="card">
      <h3>👥 All Users</h3>
      <p>View all user profiles (read-only)</p>
      <button class="card-button" onclick="loadAllUsers()">View Users</button>
    </div>
  ` : `
    <div class="card">
      <h3>⚡ League Management</h3>
      <p>Manage your assigned leagues and users</p>
      <button class="card-button" onclick="loadMyLeagues()">Manage</button>
    </div>
  `;

  document.getElementById('dashboardCards').innerHTML = cardsHTML;
}

async function loadAllUsers() {
  const token = localStorage.getItem('sb-auth-token');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    }
  });

  if (!res.ok) {
    document.getElementById('slffContent').innerHTML = '<div class="error">Failed to load users</div>';
    return;
  }

  const users = await res.json();
  const html = `
    <table class="users-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Sleeper</th>
          <th>MFL</th>
          <th>Verified</th>
          <th>Level</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${u.name || '(not set)'}</td>
            <td>${u.email}</td>
            <td>${u.sleeper_handle || '-'}</td>
            <td>${u.mfl_handle || '-'}</td>
            <td>${u.is_verified ? '✓' : '✗'}</td>
            <td>${u.admin_level}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  document.getElementById('slffContent').innerHTML = html;
  document.getElementById('slff').classList.add('active');
  document.getElementById('dashboard').classList.remove('active');
  document.querySelector('[data-section="slff"]').classList.add('active');
  document.querySelector('[data-section="dashboard"]').classList.remove('active');
}

async function loadMyLeagues() {
  document.getElementById('slffContent').innerHTML = '<div class="loading">Loading leagues...</div>';
}

async function loadAdminManagement() {
  document.getElementById('slffContent').innerHTML = '<div class="loading">Loading admin management...</div>';
}

async function loadVerification() {
  document.getElementById('slffContent').innerHTML = '<div class="loading">Loading verification...</div>';
}

initAdmin();
