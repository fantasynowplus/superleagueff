const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const USER_AGENT = process.env.MFL_USER_AGENT || 'superleagueff';
const MFL_USERNAME = process.env.MFL_USERNAME || '';
const MFL_PASSWORD = process.env.MFL_PASSWORD || '';
const OUT_PATH = path.join(process.cwd(), 'data', 'mfl-leagues.json');

let API_KEYS = {};
try {
  API_KEYS = JSON.parse(process.env.MFL_API_KEYS || '{}');
} catch (err) {
  console.error('MFL_API_KEYS is not valid JSON, continuing without keys');
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_KEY are required');
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const normalize = v => (v || '').toString().trim().toLowerCase();

function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch (err) {
    return { leagues: {} };
  }
}

async function getMflDivisions() {
  const url = `${SUPABASE_URL}/rest/v1/divisions?or=(mfl_id.not.is.null,sleeper_id.not.is.null)&select=id,division_name,mfl_id,sleeper_id,league_stage,stage_auto,leagues(year)`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase lookup failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function seasonYear(division) {
  if (division.leagues && division.leagues.year) return String(division.leagues.year);
  const now = new Date();
  return String(now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear());
}

async function getDivisionMembers(divisionId) {
  const url = `${SUPABASE_URL}/rest/v1/division_members?division_id=eq.${divisionId}&select=id,user_id,profiles(email,mfl_handle,sleeper_handle)`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`Member lookup failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function setMemberLink(memberId, linked, franchiseId, teamName) {
  const url = `${SUPABASE_URL}/rest/v1/division_members?id=eq.${memberId}&select=id`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      linked,
      franchise_id: franchiseId,
      team_name: teamName,
      linked_at: new Date().toISOString()
    })
  });

  if (!res.ok) throw new Error(`Link update failed (${res.status}): ${await res.text()}`);

  const rows = await res.json();
  if (rows.length === 0) {
    throw new Error('Link update affected 0 rows. SUPABASE_KEY probably needs to be the service role key.');
  }
}

const SLEEPER = 'https://api.sleeper.app/v1';

async function sleeperJson(pathPart) {
  const res = await fetch(`${SLEEPER}${pathPart}`);
  if (!res.ok) throw new Error(`Sleeper ${pathPart} returned ${res.status}`);
  return res.json();
}

async function getSleeperLeague(leagueId) {
  const [league, users] = await Promise.all([
    sleeperJson(`/league/${leagueId}`),
    sleeperJson(`/league/${leagueId}/users`)
  ]);

  const byIdentifier = new Map();
  (users || []).forEach(u => {
    const team = (u.metadata && u.metadata.team_name) || u.display_name || u.username || null;
    [u.username, u.display_name].forEach(v => {
      const n = normalize(v);
      if (n && !byIdentifier.has(n)) byIdentifier.set(n, { id: u.user_id, team });
    });
  });

  return {
    seats: league && league.total_rosters ? league.total_rosters : (users || []).length,
    draftId: league ? league.draft_id : null,
    byIdentifier
  };
}

async function getSleeperDraft(draftId) {
  if (!draftId) return { maxRound: 0, complete: false };

  const draft = await sleeperJson(`/draft/${draftId}`);
  const complete = draft && draft.status === 'complete';

  let maxRound = 0;
  try {
    const picks = await sleeperJson(`/draft/${draftId}/picks`);
    (picks || []).forEach(p => {
      if (p.round && p.round > maxRound) maxRound = p.round;
    });
  } catch (err) {
    console.error(`    Could not read Sleeper picks: ${err.message}`);
  }

  return { maxRound, complete };
}

async function getMflDraft(mflId, year, host, cookie) {
  const base = host || 'https://api.myfantasyleague.com';
  const requestHeaders = { 'User-Agent': USER_AGENT };
  if (cookie) requestHeaders['Cookie'] = `MFL_USER_ID=${cookie}`;

  const res = await fetch(`${base}/${year}/export?TYPE=draftResults&L=${mflId}&JSON=1`, {
    redirect: 'follow',
    headers: requestHeaders
  });

  if (!res.ok) throw new Error(`draftResults returned ${res.status}`);

  const body = await res.json();
  const unit = body.draftResults && body.draftResults.draftUnit;
  if (!unit) return { maxRound: 0, complete: false };

  const units = Array.isArray(unit) ? unit : [unit];
  let maxRound = 0, total = 0, made = 0;

  units.forEach(u => {
    const raw = u.draftPick || [];
    const picks = Array.isArray(raw) ? raw : [raw];
    picks.forEach(p => {
      total++;
      const hasPlayer = p.player && String(p.player).trim() !== '';
      if (hasPlayer) {
        made++;
        const r = parseInt(p.round, 10);
        if (r && r > maxRound) maxRound = r;
      }
    });
  });

  return { maxRound, complete: total > 0 && made === total };
}

function computeStage(current, entrants, linked, seats, draft) {
  let stage = 0;
  if (seats > 0 && entrants >= seats) stage = 1;
  if (stage >= 1 && linked >= entrants && entrants > 0) stage = 2;
  if (draft.maxRound >= 2) stage = 3;
  if (draft.complete) stage = 4;
  return Math.max(current || 0, stage);
}

async function setDivisionStage(divisionId, stage) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/divisions?id=eq.${divisionId}&select=id`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      league_stage: stage,
      stage_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  });

  if (!res.ok) throw new Error(`Stage update failed (${res.status}): ${await res.text()}`);
}

async function mflLogin(year) {
  const res = await fetch(`https://api.myfantasyleague.com/${year}/login`, {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      USERNAME: MFL_USERNAME,
      PASSWORD: MFL_PASSWORD,
      XML: '1'
    }).toString()
  });

  const text = await res.text();
  const match = text.match(/MFL_USER_ID="([^"]+)"/);

  if (!match) {
    throw new Error(`Login failed: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
  }

  return match[1];
}

async function getMflLeague(mflId, year, cachedHost, cookie) {
  const base = cachedHost || 'https://api.myfantasyleague.com';
  const key = API_KEYS[mflId];

  let url = `${base}/${year}/export?TYPE=league&L=${mflId}&JSON=1`;
  if (key) url += `&APIKEY=${encodeURIComponent(key)}`;

  const requestHeaders = { 'User-Agent': USER_AGENT };
  if (cookie) requestHeaders['Cookie'] = `MFL_USER_ID=${cookie}`;

  const res = await fetch(url, {
    redirect: 'follow',
    headers: requestHeaders
  });

  if (res.status === 429) throw new Error('Rate limited (429). Not retrying, will try again next run.');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  if (body.error) {
    const msg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
    throw new Error(`MFL error: ${msg}`);
  }

  const league = body.league;
  if (!league) throw new Error('No league object in response');

  const raw = league.franchises && league.franchises.franchise;
  if (!raw) throw new Error('No franchises in response');

  return {
    host: league.baseURL || null,
    franchises: Array.isArray(raw) ? raw : [raw]
  };
}

async function main() {
  const divisions = await getMflDivisions();
  console.log(`MFL divisions in Supabase: ${divisions.length}`);

  const previous = readExisting();
  const leagues = {};
  let ok = 0, failed = 0;
  let cookie = null;

  if (MFL_USERNAME && MFL_PASSWORD) {
    const loginYear = seasonYear(divisions[0] || {});
    try {
      cookie = await mflLogin(loginYear);
      console.log('Logged in to MFL as commissioner');
    } catch (err) {
      console.error(`MFL login failed: ${err.message}`);
      console.error('Continuing unauthenticated. Owner emails will be missing.');
    }
  } else {
    console.log('No MFL_USERNAME/MFL_PASSWORD set. Owner emails will be missing.');
  }

  for (let i = 0; i < divisions.length; i++) {
    const d = divisions[i];
    const mflId = d.mfl_id ? String(d.mfl_id).trim() : null;
    const sleeperId = !mflId && d.sleeper_id ? String(d.sleeper_id).trim() : null;
    const key = mflId || sleeperId;
    const year = seasonYear(d);
    const prior = previous.leagues ? previous.leagues[key] : null;

    if (i > 0) await sleep(1500);

    try {
      const members = await getDivisionMembers(d.id);
      let byIdentifier = new Map();
      let seats = 0;
      let draft = { maxRound: 0, complete: false };
      let host = prior && prior.host;

      if (mflId) {
        const league = await getMflLeague(mflId, year, host, cookie);
        host = league.host || host;
        seats = league.franchises.length;

        league.franchises.forEach(f => {
          const team = f.name || null;
          [f.email, f.owner_name].forEach(v => {
            const n = normalize(v);
            if (n && !byIdentifier.has(n)) byIdentifier.set(n, { id: f.id, team });
          });
        });

        try {
          draft = await getMflDraft(mflId, year, host, cookie);
        } catch (err) {
          console.error(`    Could not read MFL draft: ${err.message}`);
        }
      } else {
        const league = await getSleeperLeague(sleeperId);
        seats = league.seats;
        byIdentifier = league.byIdentifier;

        try {
          draft = await getSleeperDraft(league.draftId);
        } catch (err) {
          console.error(`    Could not read Sleeper draft: ${err.message}`);
        }
      }

      let linkedCount = 0;

      for (const m of members) {
        const p = m.profiles || {};
        const candidates = mflId
          ? [p.email, p.mfl_handle]
          : [p.sleeper_handle];

        let hit = null;
        for (const c of candidates.map(normalize).filter(Boolean)) {
          if (byIdentifier.has(c)) { hit = byIdentifier.get(c); break; }
        }

        await setMemberLink(m.id, !!hit, hit ? hit.id : null, hit ? hit.team : null);
        if (hit) linkedCount++;
      }

      let stage = d.league_stage || 0;
      if (d.stage_auto !== false) {
        const next = computeStage(d.league_stage, members.length, linkedCount, seats, draft);
        if (next !== d.league_stage) {
          await setDivisionStage(d.id, next);
          console.log(`    stage ${d.league_stage} -> ${next}`);
        }
        stage = next;
      }

      leagues[key] = {
        division: d.division_name,
        platform: mflId ? 'MFL' : 'Sleeper',
        year,
        host: host || null,
        seats,
        members: members.length,
        linked: linkedCount,
        draft_round: draft.maxRound,
        draft_complete: draft.complete,
        stage,
        last_success: new Date().toISOString(),
        last_error: null
      };

      ok++;
      console.log(`  ${d.division_name} (${key}) ${year}: ${members.length}/${seats} entrants, ${linkedCount} linked, round ${draft.maxRound}${draft.complete ? ', complete' : ''}, stage ${stage}`);
    } catch (err) {
      failed++;
      console.error(`  ${d.division_name} (${key}) FAILED: ${err.message}`);

      if (prior) {
        leagues[key] = Object.assign({}, prior, {
          last_error: `${new Date().toISOString()}: ${err.message}`
        });
        console.error('    Keeping previously synced data.');
      } else {
        leagues[key] = {
          division: d.division_name,
          platform: mflId ? 'MFL' : 'Sleeper',
          year,
          host: null,
          seats: 0,
          members: 0,
          linked: 0,
          draft_round: 0,
          draft_complete: false,
          stage: d.league_stage || 0,
          last_success: null,
          last_error: `${new Date().toISOString()}: ${err.message}`
        };
      }
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generated_at: new Date().toISOString(),
    leagues
  }, null, 2) + '\n');

  console.log(`Done. ${ok} succeeded, ${failed} failed.`);
  if (ok === 0 && divisions.length > 0) process.exit(1);
}

main().catch(err => {
  console.error('SYNC FAILED:', err.message);
  process.exit(1);
});
