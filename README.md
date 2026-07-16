# Super League FF

Static site for superleagueff.org — a charity fantasy football league.

## Structure

- `index.html` — Homepage
- `rules-register.html` — Rules + team registration form
- `divisions.html` — Division selection
- `standings.html` — Live standings
- `css/style.css` — Shared styles
- `js/main.js` — Mobile nav toggle

## Things to fill in before launch

Search each page for bracketed placeholders and swap in real content:

- `[Charity Name]` — the charity entry fees go toward
- `$00,000` / team counts on the homepage scoreboard
- Entry fee, draft date, playoff format on the Rules page
- Division names/descriptions on the Divisions page
- The `Donate` link `href="#"` in every page's nav — point it at your actual donation page
- Standings table rows once the season is live

## Testing now (before the domain is pointed)

1. Push this repo to GitHub as its own repo, separate from your other site.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch," branch `main`, folder `/ (root)`.
4. Save — GitHub will give you a working preview URL at `https://<your-username>.github.io/<repo-name>/`. That's enough to test everything before touching DNS.

You can also just open `index.html` directly in a browser (or run a quick local server, e.g. `python3 -m http.server`) to preview without pushing anything.

## Later: pointing superleagueff.org at it

When you're ready to go live on the real domain:

1. In **Settings → Pages**, under **Custom domain**, enter `superleagueff.org` and save — this creates a `CNAME` file in the repo automatically.
2. At your domain registrar (wherever `superleagueff.org` is registered), add these DNS records pointing at GitHub Pages:
   - Four `A` records for the apex domain (`@`) pointing to:
     - `185.199.108.153`
     - `185.199.109.153`
     - `185.199.110.153`
     - `185.199.111.153`
   - A `CNAME` record for `www` pointing to `<your-github-username>.github.io`
3. Once DNS propagates (a few minutes to 24 hours), check **Enforce HTTPS** in the Pages settings.

## Next phase: accounts + profiles

This site is static for now (no backend). When you're ready to add team accounts, profile editing (social handles, fantasy handles), and admin-managed tags/IDs, that's a Supabase layer that plugs into these same pages — happy to build that out next.
