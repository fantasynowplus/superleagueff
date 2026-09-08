const SUPABASE_URL = 'https://fckobcxprmudfpxdmswi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZja29iY3hwcm11ZGZweGRtc3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTI5MzcsImV4cCI6MjA5OTE4ODkzN30.9wMb0SXAZs-jo1G9xRxk5M47fJIIU7-DTJTl1yFRwFk';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let TXNS = [];
let OWNERSHIP = [];
let FAAB = [];
let ROSTERS = [];
let DIVISIONS = {};
let DIV_ORDER = [];
let LAST_SYNC = null;

function esc(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function posBadge(pos) {
  const p = (pos || '').toUpperCase();
  return `<span class="pos-badge ${esc(p)}">${esc(p || '—')}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return v > 0 ? `$${v.toFixed(0)}` : '$0';
}

function renderSyncLine() {
  const el = document.getElementById('lastSync');
  if (!el) return;
  el.textContent = LAST_SYNC ? `Last synced ${LAST_SYNC.toLocaleString()}` : 'Not synced yet';
}

// PostgREST caps a single select() at ~1000 rows by default. waiver_transactions and
// current_rosters can both easily exceed that over a season, so page through them fully
// instead of silently truncating (which is what was causing the ownership modal mismatch).
async function fetchAll(table, select) {
  const pageSize = 1000;
  let from = 0;
  let out = [];
  while (true) {
    const { data, error } = await db.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

// ---------- Load ----------
async function loadData() {
  const [{ data: divs }, { data: ownership }, { data: faab }, txns, rosters] = await Promise.all([
    db.from('divisions').select('id,division_name,is_active,leagues!inner(league_name,year,is_active)').eq('is_active', true).eq('leagues.is_active', true),
    db.from('player_ownership').select('*'),
    db.from('team_faab_spend').select('division_id,total_faab_spent,paid_claims_count,total_claims_count'),
    fetchAll('waiver_transactions', '*'),
    fetchAll('current_rosters', 'division_id,platform,franchise_id,player_id,match_key')
  ]);

  (divs || []).forEach(d => { DIVISIONS[d.id] = d.division_name; });
  DIV_ORDER = Object.keys(DIVISIONS).sort((a, b) => (DIVISIONS[a] || '').localeCompare(DIVISIONS[b] || ''));
  const activeIds = new Set(Object.keys(DIVISIONS));

  TXNS = (txns || []).filter(t => activeIds.has(t.division_id))
    .sort((a, b) => new Date(b.transaction_date || 0) - new Date(a.transaction_date || 0));
  OWNERSHIP = (ownership || []).sort((a, b) => (b.ownership_pct || 0) - (a.ownership_pct || 0));
  const teamFaab = (faab || []).filter(f => activeIds.has(f.division_id));
  const byDivision = {};
  teamFaab.forEach(f => {
    if (!byDivision[f.division_id]) byDivision[f.division_id] = { division_id: f.division_id, total_faab_spent: 0, paid_claims_count: 0, total_claims_count: 0 };
    byDivision[f.division_id].total_faab_spent += Number(f.total_faab_spent) || 0;
    byDivision[f.division_id].paid_claims_count += Number(f.paid_claims_count) || 0;
    byDivision[f.division_id].total_claims_count += Number(f.total_claims_count) || 0;
  });
  FAAB = Object.values(byDivision).sort((a, b) => b.total_faab_spent - a.total_faab_spent);
  ROSTERS = (rosters || []).filter(r => activeIds.has(r.division_id));

  if (divs && divs.length && divs[0].leagues) {
    document.getElementById('leagueLabel').textContent =
      `${divs[0].leagues.league_name} · ${divs[0].leagues.year}`;
  }
  const syncTimes = TXNS.map(t => t.synced_at).filter(Boolean).sort();
  LAST_SYNC = syncTimes.length ? new Date(syncTimes[syncTimes.length - 1]) : null;
  renderSyncLine();

  populateDivisionFilter('logDivisionFilter');
}

function populateDivisionFilter(selectId) {
  const sel = document.getElementById(selectId);
  const ids = Object.keys(DIVISIONS).sort((a, b) => (DIVISIONS[a] || '').localeCompare(DIVISIONS[b] || ''));
  sel.innerHTML = '<option value="">All Divisions</option>' +
    ids.map(id => `<option value="${esc(id)}">${esc(DIVISIONS[id])}</option>`).join('');
}

// ---------- Waiver Log ----------
function renderLog(search = '', divisionId = '') {
  const body = document.getElementById('logBody');
  const q = search.trim().toLowerCase();

  let rows = TXNS;
  if (divisionId) rows = rows.filter(t => t.division_id === divisionId);
  if (q) {
    rows = rows.filter(t =>
      (t.player_added_name || '').toLowerCase().includes(q) ||
      (t.player_dropped_name || '').toLowerCase().includes(q) ||
      (t.team_name || '').toLowerCase().includes(q));
  }

  if (rows.length === 0) {
    body.innerHTML = '<div class="empty-state">No waiver transactions match yet.</div>';
    return;
  }

  const trs = rows.slice(0, 500).map(t => {
    const added = t.player_added_name
      ? `<span class="add-tag pname" data-key="${esc(t.player_added_match_key || '')}" data-name="${esc(t.player_added_name)}" data-pos="${esc(t.player_added_position || '')}">+ ${esc(t.player_added_name)}</span> ${posBadge(t.player_added_position)}`
      : '—';
    const dropped = t.player_dropped_name
      ? `<span class="drop-tag pname" data-key="${esc(t.player_dropped_match_key || '')}" data-name="${esc(t.player_dropped_name)}" data-pos="${esc(t.player_dropped_position || '')}">− ${esc(t.player_dropped_name)}</span> ${posBadge(t.player_dropped_position)}`
      : '—';
    return `<tr>
      <td class="date-cell">${fmtDate(t.transaction_date)}</td>
      <td>${esc(DIVISIONS[t.division_id] || '')}</td>
      <td>${added}</td>
      <td>${dropped}</td>
      <td class="faab-cell">${fmtMoney(t.faab_spent)}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `<div class="table-wrap"><table class="data">
    <thead><tr><th>Date</th><th>Division</th><th>Added</th><th>Dropped</th><th class="num-th">FAAB</th></tr></thead>
    <tbody>${trs}</tbody>
  </table></div>`;

  body.querySelectorAll('.pname').forEach(el =>
    el.addEventListener('click', () => openPlayerModal(el.dataset.key, el.dataset.name, el.dataset.pos)));
}

// ---------- Ownership ----------
function renderOwnership(search = '') {
  const body = document.getElementById('ownBody');
  const q = search.trim().toLowerCase();

  let rows = OWNERSHIP;
  if (q) rows = rows.filter(p => (p.player_name || '').toLowerCase().includes(q));

  if (rows.length === 0) {
    body.innerHTML = '<div class="empty-state">No rostered players found yet.</div>';
    return;
  }

  const items = rows.slice(0, 300).map(p => {
    const pct = Number(p.ownership_pct) || 0;
    return `<div class="own-row pname" data-key="${esc(p.match_key || '')}" data-name="${esc(p.player_name || '')}" data-pos="${esc(p.player_position || '')}">
      <div class="own-name">
        ${posBadge(p.player_position)}
        <span>${esc(p.player_name || 'Unknown')}</span>
        <span class="own-nfl">${esc(p.player_nfl_team || '')}</span>
      </div>
      <div class="own-bar-wrap"><div class="own-bar" style="width:${pct}%"></div></div>
      <div class="own-pct">${pct}%<span class="frac">${p.divisions_rostered}/${p.total_active_divisions}</span></div>
    </div>`;
  }).join('');

  body.innerHTML = `<div class="table-wrap" style="border:none;background:none;">${items}</div>`;

  body.querySelectorAll('.pname').forEach(el =>
    el.addEventListener('click', () => openPlayerModal(el.dataset.key, el.dataset.name, el.dataset.pos)));
}

// ---------- Player modal ----------
function openPlayerModal(matchKey, name, pos) {
  if (!matchKey) return;

  const ownRow = OWNERSHIP.find(o => o.match_key === matchKey);
  const rosterRows = ROSTERS.filter(r => r.match_key === matchKey);
  const rosteredDivisionIds = new Set(rosterRows.map(r => r.division_id));

  const pct = ownRow ? Number(ownRow.ownership_pct) || 0 : 0;
  const divCount = ownRow ? ownRow.divisions_rostered : rosteredDivisionIds.size;
  const totalDivs = ownRow ? ownRow.total_active_divisions : DIV_ORDER.length;
  const nflTeam = ownRow ? ownRow.player_nfl_team : '';

  document.getElementById('pmName').textContent = name || (ownRow && ownRow.player_name) || 'Unknown player';
  document.getElementById('pmSub').textContent = [pos, nflTeam].filter(Boolean).join(' · ') || '—';
  document.getElementById('pmBar').style.width = pct + '%';
  document.getElementById('pmPct').innerHTML = `${pct}%<span class="frac">${divCount}/${totalDivs} divisions</span>`;

  const sleeperRow = rosterRows.find(r => r.platform === 'sleeper');
  const headshot = document.getElementById('pmHeadshot');
  if (sleeperRow && sleeperRow.player_id) {
    headshot.src = `https://sleepercdn.com/content/nfl/players/${sleeperRow.player_id}.jpg`;
    headshot.onerror = () => { headshot.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp'; };
  } else {
    headshot.src = 'https://sleepercdn.com/images/v2/icons/player_default.webp';
  }

  const leagueRows = DIV_ORDER.map(id => {
    const rostered = rosteredDivisionIds.has(id);
    return `<div class="pm-league-row">
      <span class="div-name">${esc(DIVISIONS[id])}</span>
      ${rostered
        ? `<span class="status owned">Rostered</span>`
        : `<span class="status available">Available</span>`}
    </div>`;
  }).join('');
  document.getElementById('pmLeagues').innerHTML = leagueRows || '<div class="empty-state">No division data yet.</div>';

  document.getElementById('playerModal').style.display = 'flex';
}

function closePlayerModal() {
  document.getElementById('playerModal').style.display = 'none';
}

// ---------- FAAB Spending ----------
function renderFaab() {
  const body = document.getElementById('faabBody');

  if (FAAB.length === 0) {
    body.innerHTML = '<div class="empty-state">No FAAB spending recorded yet.</div>';
    return;
  }

  const trs = FAAB.map(f => `<tr>
    <td class="player-cell">${esc(DIVISIONS[f.division_id] || '')}</td>
    <td class="faab-cell">${fmtMoney(f.total_faab_spent)}</td>
    <td class="mono num-td">${f.paid_claims_count || 0}</td>
    <td class="mono num-td">${f.total_claims_count || 0}</td>
  </tr>`).join('');

  body.innerHTML = `<div class="table-wrap"><table class="data">
    <thead><tr><th>Division</th><th class="num-th">Total FAAB Spent</th><th class="num-th">Paid Claims</th><th class="num-th">Total Claims</th></tr></thead>
    <tbody>${trs}</tbody>
  </table></div>`;
}

// ---------- Tabs + init ----------
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

  document.getElementById('logSearch').addEventListener('input', e =>
    renderLog(e.target.value, document.getElementById('logDivisionFilter').value));
  document.getElementById('logDivisionFilter').addEventListener('change', e =>
    renderLog(document.getElementById('logSearch').value, e.target.value));
  document.getElementById('ownSearch').addEventListener('input', e => renderOwnership(e.target.value));

  document.getElementById('pmClose').addEventListener('click', closePlayerModal);
  document.getElementById('playerModal').addEventListener('click', e => {
    if (e.target.id === 'playerModal') closePlayerModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePlayerModal(); });

  try {
    await loadData();
    renderLog();
    renderOwnership();
    renderFaab();
  } catch (err) {
    document.getElementById('logBody').innerHTML =
      `<div class="empty-state">Could not load waiver data. ${esc(err.message)}</div>`;
  }
  setInterval(renderSyncLine, 30000);
}

init();