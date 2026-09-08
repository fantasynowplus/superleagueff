const SUPABASE_URL = 'https://fckobcxprmudfpxdmswi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZja29iY3hwcm11ZGZweGRtc3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MTI5MzcsImV4cCI6MjA5OTE4ODkzN30.9wMb0SXAZs-jo1G9xRxk5M47fJIIU7-DTJTl1yFRwFk';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let TXNS = [];
let OWNERSHIP = [];
let FAAB = [];
let DIVISIONS = {};
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

// ---------- Load ----------
async function loadData() {
  const [{ data: divs }, { data: txns }, { data: ownership }, { data: faab }] = await Promise.all([
    db.from('divisions').select('id,division_name,is_active,leagues!inner(league_name,year,is_active)').eq('is_active', true).eq('leagues.is_active', true),
    db.from('waiver_transactions').select('*'),
    db.from('player_ownership').select('*'),
    db.from('team_faab_spend').select('*')
  ]);

  (divs || []).forEach(d => { DIVISIONS[d.id] = d.division_name; });
  const activeIds = new Set(Object.keys(DIVISIONS));

  TXNS = (txns || []).filter(t => activeIds.has(t.division_id))
    .sort((a, b) => new Date(b.transaction_date || 0) - new Date(a.transaction_date || 0));
  OWNERSHIP = (ownership || []).sort((a, b) => (b.ownership_pct || 0) - (a.ownership_pct || 0));
  FAAB = (faab || []).filter(f => activeIds.has(f.division_id))
    .sort((a, b) => (b.total_faab_spent || 0) - (a.total_faab_spent || 0));

  if (divs && divs.length && divs[0].leagues) {
    document.getElementById('leagueLabel').textContent =
      `${divs[0].leagues.league_name} · ${divs[0].leagues.year}`;
  }
  const syncTimes = TXNS.map(t => t.synced_at).filter(Boolean).sort();
  LAST_SYNC = syncTimes.length ? new Date(syncTimes[syncTimes.length - 1]) : null;
  renderSyncLine();

  populateDivisionFilter('logDivisionFilter');
  populateDivisionFilter('faabDivisionFilter');
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
      ? `<span class="add-tag">+ ${esc(t.player_added_name)}</span> ${posBadge(t.player_added_position)}`
      : '—';
    const dropped = t.player_dropped_name
      ? `<span class="drop-tag">− ${esc(t.player_dropped_name)}</span> ${posBadge(t.player_dropped_position)}`
      : '—';
    return `<tr>
      <td class="date-cell">${fmtDate(t.transaction_date)}</td>
      <td>${esc(DIVISIONS[t.division_id] || '')}</td>
      <td class="player-cell">${esc(t.team_name || 'Unknown')}</td>
      <td>${added}</td>
      <td>${dropped}</td>
      <td class="faab-cell">${fmtMoney(t.faab_spent)}</td>
    </tr>`;
  }).join('');

  body.innerHTML = `<div class="table-wrap"><table class="data">
    <thead><tr><th>Date</th><th>Division</th><th>Team</th><th>Added</th><th>Dropped</th><th>FAAB</th></tr></thead>
    <tbody>${trs}</tbody>
  </table></div>`;
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
    return `<div class="own-row">
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
}

// ---------- FAAB Spending ----------
function renderFaab(divisionId = '') {
  const body = document.getElementById('faabBody');

  let rows = FAAB;
  if (divisionId) rows = rows.filter(f => f.division_id === divisionId);

  if (rows.length === 0) {
    body.innerHTML = '<div class="empty-state">No FAAB spending recorded yet.</div>';
    return;
  }

  const trs = rows.map(f => `<tr>
    <td>${esc(DIVISIONS[f.division_id] || '')}</td>
    <td class="player-cell">${esc(f.team_name || 'Unknown')}</td>
    <td class="faab-cell">${fmtMoney(f.total_faab_spent)}</td>
    <td class="mono" style="text-align:right;">${f.paid_claims_count || 0}</td>
    <td class="mono" style="text-align:right;">${f.total_claims_count || 0}</td>
  </tr>`).join('');

  body.innerHTML = `<div class="table-wrap"><table class="data">
    <thead><tr><th>Division</th><th>Team</th><th>Total FAAB Spent</th><th>Paid Claims</th><th>Total Claims</th></tr></thead>
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
  document.getElementById('faabDivisionFilter').addEventListener('change', e => renderFaab(e.target.value));

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
