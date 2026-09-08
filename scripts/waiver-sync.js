const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const USER_AGENT = process.env.MFL_USER_AGENT || 'superleagueff';
const MFL_USERNAME = process.env.MFL_USERNAME || '';
const MFL_PASSWORD = process.env.MFL_PASSWORD || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_KEY are required');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = v => (v || '').toString().trim().toLowerCase();

// Identical to matchKey() in scripts/sync-drafts.js — must stay in sync so
// ownership % correctly merges the same real player across Sleeper + MFL.
function matchKey(name, pos) {
  const n = norm(name).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return n ? `${n}|${norm(pos)}` : null;
}

// Fetch that never throws on a bad body. Returns parsed JSON or null.
async function safeJson(url, opts = {}, label = 'request') {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          console.error(`  ${label}: HTTP ${res.status}, retrying`);
          await sleep(3000);
          continue;
        }
        console.error(`  ${label}: HTTP ${res.status}, giving up`);
        return null;
      }
      const text = await res.text();
      if (!text || text.trim() === '') return null;
      try {
        return JSON.parse(text);
      } catch (err) {
        console.error(`  ${label}: parse failed at ${text.length} bytes, retrying`);
        await sleep(3000);
        continue;
      }
    } catch (err) {
      console.error(`  ${label}: ${err.message}, retrying`);
      await sleep(3000);
    }
  }
  console.error(`  ${label}: failed after retries`);
  return null;
}

// ---------- Supabase ----------
async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase ${path} -> ${res.status}: ${await res.text()}`);
  if (res.status === 204) return null;
  const t = await res.text();
  if (!t || t.trim() === '') return null;
  try { return JSON.parse(t); } catch { return null; }
}

async function getActiveDivisions() {
  return sb('divisions?is_active=eq.true&or=(mfl_id.not.is.null,sleeper_id.not.is.null)&select=id,division_name,mfl_id,sleeper_id,leagues!inner(year,is_active)&leagues.is_active=eq.true');
}

async function loadPlayerCache(platform) {
  const map = new Map();
  const rows = await sb(`nfl_players?platform=eq.${platform}&select=player_id,full_name,position,nfl_team`);
  rows.forEach(r => map.set(r.player_id, r));
  return map;
}

async function cacheAgeHours(platform) {
  const rows = await sb(`nfl_players?platform=eq.${platform}&select=updated_at&order=updated_at.desc&limit=1`);
  if (!rows.length) return Infinity;
  return (Date.now() - new Date(rows[0].updated_at).getTime()) / 3600000;
}

async function upsertPlayers(platform, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500).map(r => ({ platform, ...r, updated_at: new Date().toISOString() }));
    await sb('nfl_players?on_conflict=platform,player_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(slice)
    });
  }
}

async function replaceDivisionRows(table, divisionId, rows) {
  await sb(`${table}?division_id=eq.${divisionId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  for (let i = 0; i < rows.length; i += 200) {
    await sb(table, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 200))
    });
  }
}

// ---------- Sleeper ----------
async function sleeperPlayers() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch('https://api.sleeper.app/v1/players/nfl', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.text();
      if (body.length < 5000000) throw new Error(`body too small (${body.length} bytes)`);
      const data = JSON.parse(body);
      const map = new Map();
      const rows = [];
      for (const [id, p] of Object.entries(data)) {
        const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
        const rec = { player_id: id, full_name: name || null, position: p.position || null, nfl_team: p.team || null };
        map.set(id, rec);
        rows.push(rec);
      }
      console.log(`  Sleeper players loaded: ${rows.length}`);
      return { map, rows };
    } catch (err) {
      console.error(`  Sleeper players attempt ${attempt}: ${err.message}`);
      if (attempt < 4) await sleep(5000);
    }
  }
  throw new Error('Sleeper players unavailable after 4 attempts');
}

async function sleeperCurrentWeek() {
  const state = await safeJson('https://api.sleeper.app/v1/state/nfl', {}, 'Sleeper state');
  return state && Number.isInteger(state.week) ? state.week : 18;
}

async function sleeperUsers(sleeperLeagueId) {
  const users = await safeJson(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/users`, {}, `Sleeper users ${sleeperLeagueId}`);
  const map = new Map();
  (Array.isArray(users) ? users : []).forEach(u => {
    map.set(String(u.user_id), u.display_name || u.username || null);
  });
  return map;
}

async function sleeperRosters(sleeperLeagueId) {
  const rosters = await safeJson(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/rosters`, {}, `Sleeper rosters ${sleeperLeagueId}`);
  return Array.isArray(rosters) ? rosters : [];
}

async function sleeperTransactions(sleeperLeagueId, currentWeek) {
  const out = [];
  // week 0 = offseason/preseason waiver moves; loop through the current week
  for (let week = 0; week <= currentWeek; week++) {
    const txns = await safeJson(`https://api.sleeper.app/v1/league/${sleeperLeagueId}/transactions/${week}`, {}, `Sleeper txns wk${week}`);
    if (Array.isArray(txns)) out.push(...txns.map(t => ({ ...t, _week: week })));
    await sleep(300);
  }
  return out;
}

// ---------- MFL ----------
async function mflLogin(year) {
  try {
    const res = await fetch(`https://api.myfantasyleague.com/${year}/login`, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ USERNAME: MFL_USERNAME, PASSWORD: MFL_PASSWORD, XML: '1' }).toString()
    });
    const text = await res.text();
    const m = text.match(/MFL_USER_ID="([^"]+)"/);
    return m ? m[1] : null;
  } catch (err) {
    console.error(`  MFL login failed: ${err.message}`);
    return null;
  }
}

async function mflPlayers(year) {
  const body = await safeJson(`https://api.myfantasyleague.com/${year}/export?TYPE=players&DETAILS=1&JSON=1`, { headers: { 'User-Agent': USER_AGENT } }, 'MFL players');
  const raw = body && body.players && body.players.player;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const map = new Map();
  const rows = [];
  for (const p of arr) {
    let name = p.name || '';
    if (name.includes(',')) {
      const [last, first] = name.split(',').map(s => s.trim());
      name = `${first} ${last}`;
    }
    const rec = { player_id: p.id, full_name: name || null, position: p.position || null, nfl_team: p.team || null };
    map.set(p.id, rec);
    rows.push(rec);
  }
  console.log(`  MFL players loaded: ${rows.length}`);
  return { map, rows };
}

async function mflFranchises(mflId, year, cookie) {
  const headers = { 'User-Agent': USER_AGENT };
  if (cookie) headers.Cookie = `MFL_USER_ID=${cookie}`;
  const body = await safeJson(`https://api.myfantasyleague.com/${year}/export?TYPE=league&L=${mflId}&JSON=1`, { redirect: 'follow', headers }, `MFL league ${mflId}`);
  const raw = body && body.league && body.league.franchises && body.league.franchises.franchise;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const map = new Map();
  arr.forEach(f => map.set(String(f.id), f.name || null));
  return map;
}

async function mflRosters(mflId, year, cookie) {
  const headers = { 'User-Agent': USER_AGENT };
  if (cookie) headers.Cookie = `MFL_USER_ID=${cookie}`;
  const body = await safeJson(`https://api.myfantasyleague.com/${year}/export?TYPE=rosters&L=${mflId}&JSON=1`, { redirect: 'follow', headers }, `MFL rosters ${mflId}`);
  const raw = body && body.rosters && body.rosters.franchise;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out = [];
  arr.forEach(f => {
    const raw2 = f.player || [];
    const players = Array.isArray(raw2) ? raw2 : [raw2];
    players.forEach(p => {
      if (p && p.id) out.push({ franchise: f.id, player_id: String(p.id) });
    });
  });
  return out;
}

// TRANS_TYPE=BBID_WAIVER,FREE_AGENT — the two move types your FAAB leagues use.
// Packed "transaction" field format confirmed against ffscrapr's MFL parser:
//   BBID_WAIVER : "playerAdded|bbidSpent|droppedIdsCsv"
//   FREE_AGENT  : "addedIdsCsv|droppedIdsCsv"   (no FAAB spent)
async function mflTransactions(mflId, year, cookie) {
  const headers = { 'User-Agent': USER_AGENT };
  if (cookie) headers.Cookie = `MFL_USER_ID=${cookie}`;
  const body = await safeJson(`https://api.myfantasyleague.com/${year}/export?TYPE=transactions&L=${mflId}&TRANS_TYPE=BBID_WAIVER,FREE_AGENT&JSON=1`, { redirect: 'follow', headers }, `MFL txns ${mflId}`);
  const raw = body && body.transactions && body.transactions.transaction;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out = [];
  arr.forEach(t => {
    const parts = String(t.transaction || '').split('|');
    if (t.type === 'BBID_WAIVER') {
      const [addedId, bidStr, droppedCsv] = parts;
      out.push({
        transaction_id: `${t.timestamp}-${t.franchise}-${addedId}`,
        timestamp: t.timestamp, franchise: t.franchise,
        added: (addedId || '').trim() || null,
        dropped: (droppedCsv || '').replace(/,$/, '').split(',').map(s => s.trim()).filter(Boolean),
        faab_spent: bidStr ? parseFloat(bidStr) : 0
      });
    } else if (t.type === 'FREE_AGENT') {
      const [addedCsv, droppedCsv] = parts;
      const addedIds = (addedCsv || '').replace(/,$/, '').split(',').map(s => s.trim()).filter(Boolean);
      const droppedIds = (droppedCsv || '').replace(/,$/, '').split(',').map(s => s.trim()).filter(Boolean);
      addedIds.forEach((id, i) => {
        out.push({
          transaction_id: `${t.timestamp}-${t.franchise}-${id}`,
          timestamp: t.timestamp, franchise: t.franchise,
          added: id, dropped: droppedIds[i] ? [droppedIds[i]] : [],
          faab_spent: 0
        });
      });
    }
  });
  return out;
}

// ---------- main ----------
async function main() {
  const divisions = await getActiveDivisions();
  console.log(`Active divisions: ${divisions.length}`);
  if (divisions.length === 0) return;

  const year = String((divisions[0].leagues && divisions[0].leagues.year) || new Date().getFullYear());
  const hasSleeper = divisions.some(d => !d.mfl_id && d.sleeper_id);
  const hasMfl = divisions.some(d => d.mfl_id);

  let sleeperMap = new Map();
  let currentWeek = 18;
  if (hasSleeper) {
    sleeperMap = await loadPlayerCache('sleeper');
    const age = await cacheAgeHours('sleeper');
    if (sleeperMap.size === 0 || age > 20) {
      console.log(`Refreshing Sleeper players (cache ${sleeperMap.size === 0 ? 'empty' : age.toFixed(1) + 'h'})...`);
      const sp = await sleeperPlayers();
      await upsertPlayers('sleeper', sp.rows);
      sleeperMap = sp.map;
    } else {
      console.log(`Using cached Sleeper players (${sleeperMap.size}, ${age.toFixed(1)}h old)`);
    }
    currentWeek = await sleeperCurrentWeek();
    console.log(`  Sleeper current week: ${currentWeek}`);
  }

  let mflMap = new Map();
  let cookie = null;
  if (hasMfl) {
    mflMap = await loadPlayerCache('mfl');
    const age = await cacheAgeHours('mfl');
    if (mflMap.size === 0 || age > 20) {
      console.log(`Refreshing MFL players (cache ${mflMap.size === 0 ? 'empty' : age.toFixed(1) + 'h'})...`);
      const mp = await mflPlayers(year);
      if (mp.rows.length > 0) {
        await upsertPlayers('mfl', mp.rows);
        mflMap = mp.map;
      }
    } else {
      console.log(`Using cached MFL players (${mflMap.size}, ${age.toFixed(1)}h old)`);
    }
    if (MFL_USERNAME && MFL_PASSWORD) {
      cookie = await mflLogin(year);
      console.log(cookie ? '  MFL login ok' : '  MFL login failed (continuing)');
    }
  }

  let totalTxns = 0;
  let totalRosterSlots = 0;

  for (let i = 0; i < divisions.length; i++) {
    const d = divisions[i];
    if (i > 0) await sleep(1500);

    try {
      let txnRows = [];
      let rosterRows = [];

      if (d.mfl_id) {
        const mflId = String(d.mfl_id).trim();
        const franchiseMap = await mflFranchises(mflId, year, cookie);
        const txns = await mflTransactions(mflId, year, cookie);
        txnRows = txns.map(t => {
          const added = mflMap.get(t.added) || {};
          const droppedId = t.dropped[0] || null;
          const dropped = droppedId ? (mflMap.get(droppedId) || {}) : {};
          return {
            division_id: d.id, platform: 'mfl', transaction_id: t.transaction_id,
            week: null, transaction_date: new Date(Number(t.timestamp) * 1000).toISOString(),
            franchise_id: t.franchise, team_name: franchiseMap.get(String(t.franchise)) || null,
            player_added_id: t.added || null, player_added_name: added.full_name || null,
            player_added_position: added.position || null,
            player_added_match_key: matchKey(added.full_name, added.position),
            player_dropped_id: droppedId, player_dropped_name: dropped.full_name || null,
            player_dropped_position: dropped.position || null,
            player_dropped_match_key: droppedId ? matchKey(dropped.full_name, dropped.position) : null,
            faab_spent: t.faab_spent || 0, status: 'complete'
          };
        });

        const roster = await mflRosters(mflId, year, cookie);
        rosterRows = roster.map(r => {
          const p = mflMap.get(r.player_id) || {};
          return {
            division_id: d.id, platform: 'mfl', franchise_id: r.franchise,
            team_name: franchiseMap.get(String(r.franchise)) || null,
            player_id: r.player_id, player_name: p.full_name || null,
            player_position: p.position || null, player_nfl_team: p.nfl_team || null,
            match_key: matchKey(p.full_name, p.position)
          };
        });
      } else if (d.sleeper_id) {
        const sleeperLeagueId = String(d.sleeper_id).trim();
        const userMap = await sleeperUsers(sleeperLeagueId);
        const rawTxns = await sleeperTransactions(sleeperLeagueId, currentWeek);

        txnRows = rawTxns
          .filter(t => t.status === 'complete' && (t.type === 'waiver' || t.type === 'free_agent'))
          .map(t => {
            const addIds = t.adds ? Object.keys(t.adds) : [];
            const dropIds = t.drops ? Object.keys(t.drops) : [];
            const addId = addIds[0] || null;
            const dropId = dropIds[0] || null;
            const rosterId = addId ? t.adds[addId] : (dropId ? t.drops[dropId] : (t.roster_ids || [])[0]);
            const added = addId ? (sleeperMap.get(addId) || {}) : {};
            const dropped = dropId ? (sleeperMap.get(dropId) || {}) : {};
            return {
              division_id: d.id, platform: 'sleeper', transaction_id: t.transaction_id,
              week: t._week, transaction_date: t.created ? new Date(t.created).toISOString() : null,
              franchise_id: rosterId != null ? String(rosterId) : null,
              team_name: userMap.get(String(rosterId)) || null,
              player_added_id: addId, player_added_name: added.full_name || null,
              player_added_position: added.position || null,
              player_added_match_key: addId ? matchKey(added.full_name, added.position) : null,
              player_dropped_id: dropId, player_dropped_name: dropped.full_name || null,
              player_dropped_position: dropped.position || null,
              player_dropped_match_key: dropId ? matchKey(dropped.full_name, dropped.position) : null,
              faab_spent: (t.type === 'waiver' && t.settings && t.settings.waiver_bid) ? t.settings.waiver_bid : 0,
              status: t.status
            };
          });

        const rosters = await sleeperRosters(sleeperLeagueId);
        rosterRows = [];
        rosters.forEach(r => {
          (r.players || []).forEach(playerId => {
            const p = sleeperMap.get(String(playerId)) || {};
            rosterRows.push({
              division_id: d.id, platform: 'sleeper', franchise_id: String(r.roster_id),
              team_name: userMap.get(String(r.owner_id)) || null,
              player_id: String(playerId), player_name: p.full_name || null,
              player_position: p.position || null, player_nfl_team: p.nfl_team || null,
              match_key: matchKey(p.full_name, p.position)
            });
          });
        });
      }

      await replaceDivisionRows('waiver_transactions', d.id, txnRows);
      await replaceDivisionRows('current_rosters', d.id, rosterRows);
      totalTxns += txnRows.length;
      totalRosterSlots += rosterRows.length;
      console.log(`  ${d.division_name}: ${txnRows.length} txns, ${rosterRows.length} roster slots`);
    } catch (err) {
      console.error(`  ${d.division_name} FAILED: ${err.message}`);
    }
  }

  console.log(`Done. ${totalTxns} transactions, ${totalRosterSlots} roster slots across ${divisions.length} divisions.`);
}

main().catch(err => {
  console.error('WAIVER SYNC FAILED:', err.message);
  process.exit(1);
});
