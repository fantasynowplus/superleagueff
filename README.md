# Super League FF

Static site for [superleagueff.org](https://superleagueff.org) — a charity fantasy football league benefiting Extra Life (team `73449`).

Plain HTML, CSS, and JavaScript with no build step. Deployed via GitHub Pages from the `main` branch, root folder. Dynamic data is written into `data/*.json` by scheduled GitHub Actions and read client-side at page load, which keeps the front end fully static while avoiding CORS restrictions on the upstream APIs.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Homepage — how it works, why we play, Hall of Champions, live fundraising total |
| `rules-register.html` | League rules, scoring, playoff format, registration |
| `divisions.html` | Division selection |
| `standings.html` | Live standings with division filtering |
| `draft-tool.html` | Draft recap graphic generator |
| `login.html` | Member sign-in |
| `profile.html` | Member profile — social and fantasy platform handles |
| `admin.html` | Admin sign-in |
| `admin-dashboard.html` | Admin portal — users, leagues, divisions, admins |

## Structure

```
├── .github/workflows/     Scheduled data sync jobs
├── assets/images/         Logo and banner
├── css/
│   ├── style.css          Shared base styles, nav, typography
│   ├── admin.css          Admin dashboard
│   ├── rules.css          Rules, scoring, playoff brackets
│   ├── standings.css      Standings table
│   └── tools.css          Draft tool
├── data/                  Machine-written JSON, do not edit by hand
│   ├── fundraising.json   Extra Life total raised
│   ├── mfl-leagues.json   Per-division roster and link status
│   └── standings.json     Team standings
├── js/
│   ├── main.js            Mobile nav toggle, fundraising total
│   ├── auth.js            Supabase auth and profile fetching
│   ├── standings.js       StandingsManager — fetch, filter, render
│   ├── admin-dashboard.js Admin portal logic
│   └── draft-recap-generator.js
├── scripts/
│   └── sync-leagues.js    League sync job (runs in Actions, not the browser)
├── favicon.ico
└── index.html
```

## Branding

| Role | Hex |
| --- | --- |
| Primary navy | `#06192b` |
| Secondary orange | `#e26f0f` |
| Third tan | `#f1e6d1` |

Typography: Anton for headings, Work Sans for body, IBM Plex Mono for data columns. Spacing follows multiples of 8px. CSS files contain no comments by convention.

## Data pipeline

Three scheduled workflows commit refreshed JSON back into `data/`, which triggers a Pages redeploy.

**`update-fundraising.yml`** — hourly. Reads `sumDonations` from the Extra Life team API and writes `data/fundraising.json`. Consumed by `fetchRaisedAmount()` in `js/main.js`, rendered into `#raised-amount`.

**`update-standings.yml`** — hourly. Pulls a published Google Apps Script endpoint into `data/standings.json` as an array of `{ team, division, pointsFor, record, link }`.

**`league-sync.yml`** — every six hours. Runs `scripts/sync-leagues.js`, which authenticates to MyFantasyLeague and Sleeper, reconciles rosters against Supabase, writes linked status onto `division_members`, and emits per-division counts to `data/mfl-leagues.json`. MFL forbids browser-side calls and sends no CORS headers, so this has to run server-side. Only aggregate counts are committed — no member emails or personal data land in the repo.

Each workflow can also be run on demand from the Actions tab via **Run workflow**.

## Supabase

Auth and profile data live in Supabase. `js/auth.js` holds the project URL and the publishable (anon) key — these are safe to ship in client code; row-level security is what actually protects the data. Users can only read and write their own profile row, and admin writes are gated behind an RLS policy keyed on `admin_level`.

Schema is uuid-based: `leagues` → `divisions` → `division_members`, with `profiles` linked to `auth.users`.

### Admin levels

| Level | Capability |
| --- | --- |
| 1 | View division members |
| 4 | View members, update Sleeper handles |
| 7 | Create and edit divisions, add and remove users, set draft spots |
| 9 | Create leagues, delete |

## Required repository secrets

Set under **Settings → Secrets and variables → Actions**.

| Secret | Used by |
| --- | --- |
| `SUPABASE_URL` | `league-sync.yml` |
| `SUPABASE_KEY` | `league-sync.yml` |
| `MFL_USERNAME` | `league-sync.yml` |
| `MFL_PASSWORD` | `league-sync.yml` |
| `MFL_USER_AGENT` | `league-sync.yml` |
| `MFL_API_KEYS` | `league-sync.yml` (JSON map of league ID to API key; optional) |

MFL API keys are per league and per franchise. Because the commissioner account has no franchise of its own, the sync falls back to the username and password login flow.

## Editing

All work happens in the GitHub web interface. Edit a file, commit to `main`, and Pages redeploys within a minute or two.

Do not hand-edit anything in `data/` — the next scheduled workflow run will overwrite it.

## Deployment

**Settings → Pages** → Source: Deploy from a branch → Branch `main`, folder `/ (root)`.

The custom domain is configured in the same panel, which writes a `CNAME` file to the repo root. DNS is managed in Cloudflare with the domain registered at Namecheap.

## Roadmap

- Password reset flow (`forgot-password.html`, Supabase recovery email)
- SLFF History field on profiles listing every league a member has played in
- Per-league waitlist for members who register without receiving a team
- Automatic league stage advancement driven by the sync job
