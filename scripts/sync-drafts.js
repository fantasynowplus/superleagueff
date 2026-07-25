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

function matchKey(name, pos) {
  const n = norm(name).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  return n ? `${n}|${norm(pos)}` : null;
}

function pickLabel(round, slot) {
  return `${round}.${String(slot).padStart(2, '0')}`;
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
      if (!text || text.trim() === '') {
        return null; // empty body = no data (e.g. draft not started)
      }
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

async function replaceDivisionPicks(divisionId, picks) {
  await sb(`draft_picks?division_id=eq.${divisionId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  for (let i = 0; i < picks.length; i += 200) {
    await sb('draft_picks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(picks.slice(i, i + 200))
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

async function sleeperDraftPicks(sleeperLeagueId) {
  const league = await safeJson(`https://api.sleeper.app/v1/league/${sleeperLeagueId}`, {}, `Sleeper league ${sleeperLeagueId}`);
  if (!league || !league.draft_id) return [];
  const picks = await safeJson(`https://api.sleeper.app/v1/draft/${league.draft_id}/picks`, {}, `Sleeper picks ${league.draft_id}`);
  return Array.isArray(picks) ? picks : [];
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

async function mflDraftPicks(mflId, year, cookie) {
  const headers = { 'User-Agent': USER_AGENT };
  if (cookie) headers.Cookie = `MFL_USER_ID=${cookie}`;
  const body = await safeJson(`https://api.myfantasyleague.com/${year}/export?TYPE=draftResults&L=${mflId}&JSON=1`, { redirect: 'follow', headers }, `MFL draft ${mflId}`);
  const unit = body && body.draftResults && body.draftResults.draftUnit;
  if (!unit) return [];
  const units = Array.isArray(unit) ? unit : [unit];
  const out = [];
  units.forEach(u => {
    const raw = u.draftPick || [];
    const picks = Array.isArray(raw) ? raw : [raw];
    picks.forEach(p => {
      if (!p.player || String(p.player).trim() === '') return;
      out.push({ round: parseInt(p.round, 10), slot: parseInt(p.pick, 10), franchise: p.franchise, player_id: String(p.player).trim() });
    });
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

  let totalPicks = 0;

  for (let i = 0; i < divisions.length; i++) {
    const d = divisions[i];
    if (i > 0) await sleep(1500);

    try {
      let rows = [];

      if (d.mfl_id) {
        const picks = await mflDraftPicks(String(d.mfl_id).trim(), year, cookie);
        rows = picks.map(p => {
          const player = mflMap.get(p.player_id) || {};
          const overall = (p.round - 1) * 12 + p.slot;
          return {
            division_id: d.id, platform: 'mfl',
            round: p.round, pick_in_round: p.slot, overall,
            pick_label: pickLabel(p.round, p.slot),
            franchise_id: p.franchise || null, team_name: null,
            player_id: p.player_id,
            player_name: player.full_name || null,
            player_position: player.position || null,
            player_nfl_team: player.nfl_team || null,
            match_key: matchKey(player.full_name, player.position)
          };
        });
      } else if (d.sleeper_id) {
        const picks = await sleeperDraftPicks(String(d.sleeper_id).trim());
        rows = picks.map(p => {
          const player = sleeperMap.get(String(p.player_id)) || {};
          const meta = p.metadata || {};
          const metaName = `${meta.first_name || ''} ${meta.last_name || ''}`.trim();
          return {
            division_id: d.id, platform: 'sleeper',
            round: p.round, pick_in_round: p.draft_slot, overall: p.pick_no,
            pick_label: pickLabel(p.round, p.draft_slot),
            franchise_id: p.picked_by || null,
            team_name: meta.team_name || metaName || null,
            player_id: String(p.player_id),
            player_name: player.full_name || metaName || null,
            player_position: player.position || meta.position || null,
            player_nfl_team: player.nfl_team || meta.team || null,
            match_key: matchKey(player.full_name || metaName, player.position || meta.position)
          };
        });
      }

      await replaceDivisionPicks(d.id, rows);
      totalPicks += rows.length;
      console.log(`  ${d.division_name}: ${rows.length} picks`);
    } catch (err) {
      console.error(`  ${d.division_name} FAILED: ${err.message}`);
    }
  }

  console.log(`Done. ${totalPicks} picks across ${divisions.length} divisions.`);
}

main().catch(err => {
  console.error('DRAFT SYNC FAILED:', err.message);
  process.exit(1);
});
