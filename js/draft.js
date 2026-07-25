const SUPABASE_URL = 'https://fckobcxprmudfpxdmswi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZja29iY3hwcm11ZGZweGRtc3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTI5MzcsImV4cCI6MjA5OTE4ODkzN30.9wMb0SXAZs-jo1G9xRxk5M47fJIIU7-DTJTl1yFRwFk';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let PICKS = [];   
let ADP = [];     
let DIVISIONS = {}; 

function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function posBadge(pos) {
  const p = (pos || '').toUpperCase();
  return `<span class="pos-badge ${esc(p)}">${esc(p || '—')}</span>`;
}

async function loadData() {
  const [{ data: divs }, { data: picks }, { data: adp }] = await Promise.all([
    db.from('divisions').select('id,division_name,is_active,leagues!inner(league_name,year,is_active)').eq('is_active', true).eq('leagues.is_active', true),
    db.from('draft_picks').select('*'),
    db.from('draft_adp').select('*')
  ]);

  (divs || []).forEach(d => { DIVISIONS[d.id] = d.division_name; });
  const activeIds = new Set(Object.keys(DIVISIONS));
  PICKS = (picks || []).filter(p => activeIds.has(p.division_id));
  ADP = adp || [];

  if (divs && divs.length && divs[0].leagues) {
    document.getElementById('leagueLabel').textContent =
      `${divs[0].leagues.league_name} · ${divs[0].leagues.year}`;
  }
  const syncTimes = PICKS.map(p => p.synced_at).filter(Boolean).sort();
  if (syncTimes.length) {
    document.getElementById('lastSync').textContent =
      'Updated ' + new Date(syncTimes[syncTimes.length - 1]).toLocaleString();
  }
}

// ---------- Dashboard ----------
function renderDashboard() {
  const body = document.getElementById('dashboardBody');

  if (PICKS.length === 0) {
    body.innerHTML = '<div class="empty-state">No picks have been drafted yet. This board fills in live as divisions draft.</div>';
    return;
  }

  // Latest QB1/RB1/WR1/TE1: for each position, the highest overall pick where it was
  // still the first of that position taken in its division.
  const positions = ['QB', 'RB', 'WR', 'TE'];
  const latestFirst = {};
  positions.forEach(pos => {
    // group picks of this position by division, find each division's first, then the latest of those
    const byDiv = {};
    PICKS.filter(p => (p.player_position || '').toUpperCase() === pos).forEach(p => {
      const cur = byDiv[p.division_id];
      if (!cur || p.overall < cur.overall) byDiv[p.division_id] = p;
    });
    const firsts = Object.values(byDiv);
    if (firsts.length) {
      latestFirst[pos] = firsts.reduce((a, b) => (b.overall > a.overall ? b : a));
    }
  });

  const latestCards = positions.map(pos => {
    const p = latestFirst[pos];
    if (!p) return `<div class="latest-card ${pos.toLowerCase()}"><span class="pos-tag">Latest ${pos}1</span><div class="pick-big">—</div><div class="sub">none yet</div></div>`;
    return `<div class="latest-card ${pos.toLowerCase()}">
      <span class="pos-tag">Latest ${pos}1</span>
      <div class="pick-big">${esc(p.pick_label)}</div>
      <div class="player">${esc(p.player_name || 'Unknown')}</div>
      <div class="sub">${esc(DIVISIONS[p.division_id] || '')}</div>
    </div>`;
  }).join('');

  const runs = {};
  positions.forEach(pos => { runs[pos] = 0; });
  Object.keys(DIVISIONS).forEach(divId => {
    const seq = PICKS.filter(p => p.division_id === divId).sort((a, b) => a.overall - b.overall);
    let curPos = null, curLen = 0;
    seq.forEach(p => {
      const pos = (p.player_position || '').toUpperCase();
      if (pos === curPos) curLen++;
      else { curPos = pos; curLen = 1; }
      if (positions.includes(pos) && curLen > (runs[pos] || 0)) runs[pos] = curLen;
    });
  });

  // Most / least drafted NFL teams
  const teamCounts = {};
  PICKS.forEach(p => {
    if (!p.player_nfl_team) return;
    teamCounts[p.player_nfl_team] = (teamCounts[p.player_nfl_team] || 0) + 1;
  });
  const teamsSorted = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);
  const mostTeam = teamsSorted[0];
  const leastTeam = teamsSorted[teamsSorted.length - 1];

  const totalPicks = PICKS.length;
  const divisionsDrafting = new Set(PICKS.map(p => p.division_id)).size;

  const statCards = `
    <div class="stat-card"><div class="label">Total Picks</div><div class="value">${totalPicks}</div><div class="detail">${divisionsDrafting} of ${Object.keys(DIVISIONS).length} divisions drafting</div></div>
    <div class="stat-card"><div class="label">Longest QB Run</div><div class="value">${runs.QB || 0}</div><div class="detail">consecutive picks</div></div>
    <div class="stat-card"><div class="label">Longest RB Run</div><div class="value">${runs.RB || 0}</div><div class="detail">consecutive picks</div></div>
    <div class="stat-card"><div class="label">Longest WR Run</div><div class="value">${runs.WR || 0}</div><div class="detail">consecutive picks</div></div>
    <div class="stat-card"><div class="label">Most-Drafted Team</div><div class="value">${mostTeam ? esc(mostTeam[0]) : '—'}</div><div class="detail">${mostTeam ? mostTeam[1] + ' picks' : ''}</div></div>
    <div class="stat-card"><div class="label">Least-Drafted Team</div><div class="value">${leastTeam ? esc(leastTeam[0]) : '—'}</div><div class="detail">${leastTeam ? leastTeam[1] + ' picks' : ''}</div></div>
  `;

  body.innerHTML = `
    <div class="dash-section-label">Latest first-at-position drafted</div>
    <div class="latest-grid">${latestCards}</div>
    <div class="dash-section-label">Draft trends</div>
    <div class="stat-grid">${statCards}</div>
  `;
}

function renderAdp(filter = '') {
  const body = document.getElementById('adpBody');
  if (ADP.length === 0) {
    body.innerHTML = '<div class="empty-state">No draft data yet. ADP appears once picks are made.</div>';
    return;
  }
  const f = filter.trim().toLowerCase();
  const rows = ADP.filter(r =>
    !f || (r.player_name || '').toLowerCase().includes(f) || (r.player_nfl_team || '').toLowerCase().includes(f));

  body.innerHTML = `
    <div class="table-wrap"><table class="data">
      <thead><tr>
        <th>Rank</th><th>Pos</th><th>Team</th><th>Player</th>
        <th>Drafted</th><th style="text-align:right">ADP</th>
        <th style="text-align:right">Min</th><th style="text-align:right">Max</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td class="rank-cell">${r.overall_rank}</td>
            <td>${posBadge(r.player_position)}<span class="mono" style="color:var(--dim);margin-left:6px">${esc(r.pos_label)}</span></td>
            <td class="nfl-team">${esc(r.player_nfl_team || '—')}</td>
            <td class="player-cell">${esc(r.player_name || 'Unknown')}</td>
            <td class="mono">${r.times_drafted}</td>
            <td class="adp-cell">${r.adp}</td>
            <td class="mono" style="text-align:right;color:var(--dim)">${r.min_pick}</td>
            <td class="mono" style="text-align:right;color:var(--dim)">${r.max_pick}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
    ${rows.length === 0 ? '<div class="empty-state">No players match that search.</div>' : ''}
  `;
}

function renderWhoSuggest(query) {
  const box = document.getElementById('whoSuggest');
  const f = query.trim().toLowerCase();
  if (f.length < 2) { box.innerHTML = ''; return; }

  const seen = new Map();
  PICKS.forEach(p => {
    if (!p.match_key || !(p.player_name || '').toLowerCase().includes(f)) return;
    if (!seen.has(p.match_key)) seen.set(p.match_key, { name: p.player_name, pos: p.player_position, team: p.player_nfl_team, count: 0 });
    seen.get(p.match_key).count++;
  });

  const items = [...seen.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  box.innerHTML = items.map(([key, v]) => `
    <div class="suggest-item" data-key="${esc(key)}">
      <span>${esc(v.name)} ${posBadge(v.pos)}</span>
      <span class="meta">${esc(v.team || '')} · ${v.count} picks</span>
    </div>
  `).join('');

  box.querySelectorAll('.suggest-item').forEach(el =>
    el.addEventListener('click', () => {
      document.getElementById('whoSearch').value = seen.get(el.dataset.key).name;
      box.innerHTML = '';
      renderWho(el.dataset.key);
    }));
}

function renderWho(matchKey) {
  const body = document.getElementById('whoBody');
  const picks = PICKS.filter(p => p.match_key === matchKey).sort((a, b) => a.overall - b.overall);
  if (picks.length === 0) { body.innerHTML = '<div class="empty-state">No picks found for that player.</div>'; return; }

  const first = picks[0];
  const adpRow = ADP.find(r => r.match_key === matchKey);
  const earliest = picks[0];
  const latest = picks[picks.length - 1];
  const bySync = [...picks].sort((a, b) => new Date(b.synced_at) - new Date(a.synced_at));
  const recent = bySync[0];

  const teamOf = p => p.team_name || DIVISIONS[p.division_id] || '—';

  body.innerHTML = `
    <div class="who-summary">
      <div class="who-hero">
        <div class="name">${esc(first.player_name)}</div>
        <div class="sub">${esc(first.player_position || '')} · ${esc(first.player_nfl_team || '')}</div>
      </div>
      <div class="who-stat accent"><div class="label">Times Drafted</div><div class="value">${picks.length}</div><div class="who">across active divisions</div></div>
      <div class="who-stat"><div class="label">ADP</div><div class="value">${adpRow ? adpRow.adp : '—'}</div><div class="who">${adpRow ? adpRow.pos_label + ' overall' : ''}</div></div>
      <div class="who-stat"><div class="label">Earliest</div><div class="value">${esc(earliest.pick_label)}</div><div class="who">${esc(DIVISIONS[earliest.division_id] || '')}</div></div>
      <div class="who-stat"><div class="label">Latest</div><div class="value">${esc(latest.pick_label)}</div><div class="who">${esc(DIVISIONS[latest.division_id] || '')}</div></div>
    </div>

    <div class="table-wrap"><table class="data">
      <thead><tr><th>Pick</th><th>Round</th><th>Division</th><th>Drafted By</th></tr></thead>
      <tbody>
        ${picks.map(p => `
          <tr>
            <td class="mono" style="color:var(--orange-bright);font-weight:600">${esc(p.pick_label)}</td>
            <td class="mono" style="color:var(--dim)">R${p.round}</td>
            <td>${esc(DIVISIONS[p.division_id] || '—')}</td>
            <td class="player-cell">${esc(teamOf(p))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    }));
}

async function init() {
  setupTabs();
  document.getElementById('adpSearch').addEventListener('input', e => renderAdp(e.target.value));
  const whoInput = document.getElementById('whoSearch');
  whoInput.addEventListener('input', e => renderWhoSuggest(e.target.value));

  try {
    await loadData();
    renderDashboard();
    renderAdp();
  } catch (err) {
    document.getElementById('dashboardBody').innerHTML =
      `<div class="empty-state">Could not load draft data. ${esc(err.message)}</div>`;
  }
}

init();
