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

// ---------- Supabase helpers ----------
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
  return res.status === 204 ? null : res.json();
}

async function getActiveDivisions() {
  return sb('divisions?is_active=eq.true&or=(mfl_id.not.is.null,sleeper_id.not.is.null)&select=id,division_name,mfl_id,sleeper_id,leagues!inner(year,is_active)&leagues.is_active=eq.true');
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
    const slice = picks.slice(i, i + 200);
    await sb('draft_picks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(slice)
    });
  }
}

// ---------- Sleeper ----------
async function sleeperPlayers() {
  let text = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.text();
      if (body.length < 100000) throw new Error(`body too small (${body.length} bytes)`);
      text = body;
      break;
    } catch (err) {
      console.error(`  Sleeper players attempt ${attempt} failed: ${err.message}`);
      if (attempt < 3) await sleep(3000);
    }
  }
  if (!text) throw new Error('Sleeper players unavailable after 3 attempts');

  const data = JSON.parse(text);
  const map = new Map();
  const rows = [];
  for (const [id, p] of Object.entries(data)) {
    const name = p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ');
    const rec = { player_id: id, full_name: name || null, position: p.position || null, nfl_team: p.team || null };
    map.set(id, rec);
    rows.push(rec);
  }
  return { map, rows };
}

async function sleeperDraftPicks(sleeperLeagueId) {
  const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${sleeperLeagueId}`);
  if (!leagueRes.ok) throw new Error(`Sleeper league -> ${leagueRes.status}`);
  const league = await leagueRes.json();
  const draftId = league.draft_id;
  if (!draftId) return [];

  const picksRes = await fetch(`https://api.sleeper.app/v1/draft/${draftId}/picks`);
  if (!picksRes.ok) throw new Error(`Sleeper picks -> ${picksRes.status}`);
  const picks = await picksRes.json();
  return picks || [];
}

// ---------- MFL ----------
async function mflLogin(year) {
  const res = await fetch(`https://api.myfantasyleague.com/${year}/login`, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ USERNAME: MFL_USERNAME, PASSWORD: MFL_PASSWORD, XML: '1' }).toString()
  });
  const text = await res.text();
  const m = text.match(/MFL_USER_ID="([^"]+)"/);
  if (!m) throw new Error('MFL login failed');
  return m[1];
}

async function mflPlayers(year) {
  const res = await fetch(`https://api.myfantasyleague.com/${year}/export?TYPE=players&DETAILS=1&JSON=1`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!res.ok) throw new Error(`MFL players -> ${res.status}`);
  const body = await res.json();
  const raw = body.players && body.players.player;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const map = new Map();
  const rows = [];
  for (const p of arr) {
    // MFL name is "Last, First"
    let name = p.name || '';
    if (name.includes(',')) {
      const [last, first] = name.split(',').map(s => s.trim());
      name = `${first} ${last}`;
    }
    const rec = { player_id: p.id, full_name: name || null, position: p.position || null, nfl_team: p.team || null };
    map.set(p.id, rec);
    rows.push(rec);
  }
  return { map, rows };
}

async function mflDraftPicks(mflId, year, cookie) {
  const res = await fetch(`https://api.myfantasyleague.com/${year}/export?TYPE=draftResults&L=${mflId}&JSON=1`, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, Cookie: `MFL_USER_ID=${cookie}` }
  });
  if (!res.ok) throw new Error(`MFL draftResults -> ${res.status}`);
  const body = await res.json();
  const unit = body.draftResults && body.draftResults.draftUnit;
  if (!unit) return [];
  const units = Array.isArray(unit) ? unit : [unit];
  const out = [];
  units.forEach(u => {
    const raw = u.draftPick || [];
    const picks = Array.isArray(raw) ? raw : [raw];
    picks.forEach(p => {
      if (!p.player || String(p.player).trim() === '') return; // unmade pick
      out.push({
        round: parseInt(p.round, 10),
        slot: parseInt(p.pick, 10),
        franchise: p.franchise,
        player_id: String(p.player).trim()
      });
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
    console.log('Loading Sleeper players...');
    const sp = await sleeperPlayers();
    sleeperMap = sp.map;
    await upsertPlayers('sleeper', sp.rows);
    console.log(`  ${sp.rows.length} Sleeper players cached`);
  }

  let mflMap = new Map();
  let cookie = null;
  if (hasMfl) {
    console.log('Loading MFL players...');
    const mp = await mflPlayers(year);
    mflMap = mp.map;
    await upsertPlayers('mfl', mp.rows);
    console.log(`  ${mp.rows.length} MFL players cached`);
    if (MFL_USERNAME && MFL_PASSWORD) {
      cookie = await mflLogin(year);
      console.log('  MFL login ok');
    }
  }

  const seats = {};
  divisions.forEach(d => { seats[d.id] = 12; });

  let totalPicks = 0;

  for (let i = 0; i < divisions.length; i++) {
    const d = divisions[i];
    if (i > 0) await sleep(1500);

    try {
      let rows = [];

      if (d.mfl_id) {
        const picks = await mflDraftPicks(String(d.mfl_id).trim(), year, cookie);
        const seatCount = 12;
        rows = picks.map(p => {
          const player = mflMap.get(p.player_id) || {};
          const overall = (p.round - 1) * seatCount + p.slot;
          return {
            division_id: d.id,
            platform: 'mfl',
            round: p.round,
            pick_in_round: p.slot,
            overall,
            pick_label: pickLabel(p.round, p.slot),
            franchise_id: p.franchise || null,
            team_name: null,
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
          return {
            division_id: d.id,
            platform: 'sleeper',
            round: p.round,
            pick_in_round: p.draft_slot,
            overall: p.pick_no,
            pick_label: pickLabel(p.round, p.draft_slot),
            franchise_id: p.picked_by || null,
            team_name: (p.metadata && (p.metadata.team_name || `${p.metadata.first_name || ''} ${p.metadata.last_name || ''}`.trim())) || null,
            player_id: String(p.player_id),
            player_name: player.full_name || (p.metadata ? `${p.metadata.first_name || ''} ${p.metadata.last_name || ''}`.trim() : null),
            player_position: player.position || (p.metadata && p.metadata.position) || null,
            player_nfl_team: player.nfl_team || (p.metadata && p.metadata.team) || null,
            match_key: matchKey(player.full_name || (p.metadata && `${p.metadata.first_name} ${p.metadata.last_name}`), player.position || (p.metadata && p.metadata.position))
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
