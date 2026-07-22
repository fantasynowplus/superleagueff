let currentUser = null;
let currentProfile = null;

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
  document.getElementById('welcomeMsg').textContent = `Welcome, ${currentProfile.name || 'Admin'}`;
  document.getElementById('headerUserName').textContent = currentProfile.name || 'Admin';
  document.getElementById('yourLevel').textContent = levelNames[level] || `Level ${level}`;
  document.querySelector('.user-avatar').textContent = initial;
}

function setupEventListeners(level) {
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

  document.getElementById('sidebarLogout').addEventListener('click', logout);
  document.getElementById('headerLogout').addEventListener('click', logout);

  async function logout() {
    await auth.logout();
    window.location.href = './admin.html';
  }
}

async function loadDashboard(level) {
  const cardsHTML = level === 9 ? `
    <div class="dashboard-card" onclick="navigateTo('users')">
      <div class="card-icon">👥</div>
      <h3 class="card-title">All Users</h3>
      <p class="card-description">View and manage all user profiles</p>
      <button class="card-button">View Users</button>
    </div>
    <div class="dashboard-card" onclick="navigateTo('leagues')">
      <div class="card-icon">🏆</div>
      <h3 class="card-title">Leagues</h3>
      <p class="card-description">Manage leagues and assignments</p>
      <button class="card-button">Manage Leagues</button>
    </div>
    <div class="dashboard-card" onclick="navigateTo('admin-manage')">
      <div class="card-icon">⚙️</div>
      <h3 class="card-title">Admin Management</h3>
      <p class="card-description">Adjust admin levels and permissions</p>
      <button class="card-button">Manage Admins</button>
    </div>
  ` : level === 7 ? `
    <div class="dashboard-card" onclick="navigateTo('users')">
      <div class="card-icon">👥</div>
      <h3 class="card-title">All Users</h3>
      <p class="card-description">View and manage user profiles</p>
      <button class="card-button">View Users</button>
    </div>
    <div class="dashboard-card" onclick="navigateTo('leagues')">
      <div class="card-icon">🏆</div>
      <h3 class="card-title">Leagues</h3>
      <p class="card-description">Manage leagues and assignments</p>
      <button class="card-button">Manage Leagues</button>
    </div>
  ` : level === 4 ? `
    <div class="dashboard-card" onclick="navigateTo('users')">
      <div class="card-icon">👥</div>
      <h3 class="card-title">All Users</h3>
      <p class="card-description">View all user profiles</p>
      <button class="card-button">View Users</button>
    </div>
  ` : `
    <div class="dashboard-card" onclick="navigateTo('leagues')">
      <div class="card-icon">⚡</div>
      <h3 class="card-title">Your Leagues</h3>
      <p class="card-description">Manage your assigned leagues</p>
      <button class="card-button">Manage</button>
    </div>
  `;

  document.getElementById('dashboardCards').innerHTML = cardsHTML;
}

function navigateTo(section) {
  document.querySelector(`[data-section="${section}"]`).click();
}

async function loadAllUsers() {
  document.getElementById('usersContent').innerHTML = '<div class="loading">Loading users...</div>';
  
  try {
    const token = localStorage.getItem('sb-auth-token');
    const adminLevel = currentProfile.admin_level || 0;
    
    if (!token) {
      throw new Error('No auth token found');
    }

    if (adminLevel === 0) {
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

    if (adminLevel === 1) {
      users = users.filter(u => u.assigned_league);
    }

    const html = `
      <table class="users-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>League</th>
            <th>Sleeper Handle</th>
            <th>MFL Handle</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => `
            <tr ${adminLevel >= 7 ? `onclick="viewUserProfile('${u.id}')"` : ''}>
              <td>${adminLevel >= 7 ? `<a class="user-link">${u.name || '(not set)'}</a>` : (u.name || '(not set)')}</td>
              <td>${u.email}</td>
              <td>${u.assigned_league || '-'}</td>
              <td>${u.sleeper_handle || '-'}</td>
              <td>${u.mfl_handle || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    document.getElementById('usersContent').innerHTML = html;
  } catch (err) {
    console.error('Error loading users:', err);
    document.getElementById('usersContent').innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
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
    showUserDetailModal(user);
  } catch (err) {
    alert('Error loading profile: ' + err.message);
  }
}

function showUserDetailModal(user) {
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
          <label>Assigned League</label>
          <p data-field="assigned_league">${user.assigned_league || '-'}</p>
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
    assigned_league: 'Assigned League',
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
  const fields = ['name', 'cell_phone', 'location', 'x_handle', 'bluesky_handle', 'discord_handle', 'sleeper_handle', 'mfl_handle', 'assigned_league', 'draft_spot', 'admin_level', 'is_verified'];

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
      html += '<div class="leagues-container">';
      
      for (const league of leagues) {
        html += `
          <div class="league-card">
            <div class="league-header">
              <div>
                <h3>${league.league_name}</h3>
                <p class="league-year">Year: ${league.year}</p>
              </div>
              <div class="league-status">
                ${league.is_active ? '<span class="badge active">Active</span>' : '<span class="badge">Inactive</span>'}
              </div>
            </div>
            
            <div class="league-actions">
              ${adminLevel >= 7 ? `
                <button class="btn-small" onclick="editLeague('${league.id}')">Edit</button>
                ${!league.is_active && adminLevel >= 7 ? `<button class="btn-small" onclick="setActiveLeague('${league.id}')">Set Active</button>` : ''}
                ${league.is_active && adminLevel >= 7 ? `<button class="btn-small" onclick="deactivateLeague('${league.id}')">Deactivate</button>` : ''}
                ${adminLevel === 9 ? `<button class="btn-small danger" onclick="deleteLeague('${league.id}')">Delete</button>` : ''}
              ` : ''}
            </div>

            <div class="divisions-section">
              <div class="divisions-header">
                <h4>Divisions</h4>
                ${adminLevel >= 7 ? `<button class="btn-small" onclick="showCreateDivisionModal('${league.id}')">+ Add Division</button>` : ''}
              </div>
              <div id="divisions-${league.id}"></div>
            </div>
          </div>
        `;
      }
      
      html += '</div>';
    }

    document.getElementById('leaguesContent').innerHTML = html;
    
    for (const league of leagues) {
      await loadDivisions(league.id);
    }
  } catch (err) {
    console.error('Error loading leagues:', err);
    document.getElementById('leaguesContent').innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
}

async function loadDivisions(leagueId) {
  const adminLevel = currentProfile.admin_level || 0;
  
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?league_id=eq.${leagueId}&order=division_name.asc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load divisions');

    const divisions = await res.json();
    let html = '';

    if (!divisions || divisions.length === 0) {
      html = '<p class="empty">No divisions yet</p>';
    } else {
      html = '<div class="divisions-list">';
      
      for (const division of divisions) {
        html += `
          <div class="division-card">
            <div class="division-header">
              <h5>${division.division_name}</h5>
              <span class="badge ${division.is_active ? 'active' : ''}">
                ${division.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            ${adminLevel >= 7 ? `
              <div class="division-actions">
                <button class="btn-tiny" onclick="editDivision('${division.id}', '${leagueId}')">Edit</button>
                ${!division.is_active && adminLevel >= 7 ? `<button class="btn-tiny" onclick="activateDivision('${division.id}')">Activate</button>` : ''}
                ${division.is_active && adminLevel >= 7 ? `<button class="btn-tiny" onclick="deactivateDivision('${division.id}')">Deactivate</button>` : ''}
                ${adminLevel === 9 ? `<button class="btn-tiny danger" onclick="deleteDivision('${division.id}')">Delete</button>` : ''}
              </div>
            ` : ''}
            
            <div class="draft-grid">
              ${Array.from({length: 12}, (_, i) => i + 1).map(spot => `
                <div class="draft-spot" id="spot-${division.id}-${spot}">
                  <div class="spot-number">#{spot}</div>
                  <div class="spot-member">Loading...</div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
      
      html += '</div>';
    }

    document.getElementById(`divisions-${leagueId}`).innerHTML = html;
    
    for (const division of divisions) {
      await loadDivisionMembers(division.id);
    }
  } catch (err) {
    console.error('Error loading divisions:', err);
    document.getElementById(`divisions-${leagueId}`).innerHTML = `<div class="error">Error: ${err.message}</div>`;
  }
}

async function loadDivisionMembers(divisionId) {
  const adminLevel = currentProfile.admin_level || 0;
  
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?division_id=eq.${divisionId}&order=draft_spot.asc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load members');

    const members = await res.json();
    
    for (let spot = 1; spot <= 12; spot++) {
      const member = members.find(m => m.draft_spot === spot);
      const spotElement = document.getElementById(`spot-${divisionId}-${spot}`);
      
      if (spotElement) {
        if (member) {
          const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${member.user_id}`, {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
            }
          });
          
          const profile = await profileRes.json();
          const name = profile[0]?.name || 'Unknown';
          
          spotElement.innerHTML = `
            <div class="spot-number">#{spot}</div>
            <div class="spot-member">${name}</div>
            ${adminLevel >= 4 ? `<button class="btn-spot" onclick="removeMember('${member.id}', '${divisionId}')">Remove</button>` : ''}
          `;
        } else {
          spotElement.innerHTML = `
            <div class="spot-number">#{spot}</div>
            <div class="spot-member">Empty</div>
            ${adminLevel >= 4 ? `<button class="btn-spot" onclick="showAssignMemberModal('${divisionId}', ${spot})">Assign</button>` : ''}
          `;
        }
      }
    }
  } catch (err) {
    console.error('Error loading division members:', err);
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

function showCreateDivisionModal(leagueId) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Create Division</h3>
      
      <div class="form-group">
        <label for="divisionName">Division Name</label>
        <input type="text" id="divisionName" placeholder="e.g., Division A">
      </div>
      
      <button class="modal-button" onclick="saveNewDivision('${leagueId}')">Create Division</button>
      <div id="createDivisionMessage"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function saveNewDivision(leagueId) {
  const name = document.getElementById('divisionName').value.trim();
  
  if (!name) {
    alert('Please enter a division name');
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        league_id: leagueId,
        division_name: name,
        is_active: false
      })
    });

    if (!res.ok) throw new Error('Failed to create division');

    document.querySelector('.modal').remove();
    loadLeagues();
  } catch (err) {
    document.getElementById('createDivisionMessage').innerHTML = `<div class="error">${err.message}</div>`;
  }
}

function showAssignMemberModal(divisionId, draftSpot) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
      <h3>Assign to Draft Spot #${draftSpot}</h3>
      
      <div class="form-group">
        <label for="memberSelect">Select User</label>
        <select id="memberSelect"></select>
      </div>
      
      <button class="modal-button" onclick="saveAssignMember('${divisionId}', ${draftSpot})">Assign</button>
      <div id="assignMessage"></div>
    </div>
  `;
  
  document.body.appendChild(modal);
  loadUnassignedUsers(divisionId);
}

async function loadUnassignedUsers(divisionId) {
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to load users');

    const users = await res.json();
    const select = document.getElementById('memberSelect');
    
    select.innerHTML = users.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('');
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

async function saveAssignMember(divisionId, draftSpot) {
  const userId = document.getElementById('memberSelect').value;
  
  if (!userId) {
    alert('Please select a user');
    return;
  }

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        division_id: divisionId,
        user_id: userId,
        draft_spot: draftSpot
      })
    });

    if (!res.ok) throw new Error('Failed to assign member');

    document.querySelector('.modal').remove();
    loadLeagues();
  } catch (err) {
    document.getElementById('assignMessage').innerHTML = `<div class="error">${err.message}</div>`;
  }
}

async function removeMember(memberId, divisionId) {
  if (!confirm('Remove this member?')) return;

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/division_members?id=eq.${memberId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to remove member');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function setActiveLeague(leagueId) {
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    await fetch(`${SUPABASE_URL}/rest/v1/leagues`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_active: false })
    });
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leagues?id=eq.${leagueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_active: true })
    });

    if (!res.ok) throw new Error('Failed to set active league');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deactivateLeague(leagueId) {
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leagues?id=eq.${leagueId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_active: false })
    });

    if (!res.ok) throw new Error('Failed to deactivate league');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteLeague(leagueId) {
  if (!confirm('Delete this league and all its divisions? This cannot be undone!')) return;

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/leagues?id=eq.${leagueId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to delete league');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function activateDivision(divisionId) {
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_active: true })
    });

    if (!res.ok) throw new Error('Failed to activate division');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deactivateDivision(divisionId) {
  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ is_active: false })
    });

    if (!res.ok) throw new Error('Failed to deactivate division');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function deleteDivision(divisionId) {
  if (!confirm('Delete this division and all its members? This cannot be undone!')) return;

  try {
    const token = localStorage.getItem('sb-auth-token');
    
    const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!res.ok) throw new Error('Failed to delete division');

    loadLeagues();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function editLeague(leagueId) {
  alert('League editing coming soon');
}

function editDivision(divisionId, leagueId) {
  alert('Division editing coming soon');
}

async function loadAdminManagement() {
  document.getElementById('adminContent').innerHTML = '<div class="loading">Loading admin management...</div>';
}

initAdmin();
