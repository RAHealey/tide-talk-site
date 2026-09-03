# RIFC playoff tracker (magic numbers)

Answers three questions for Rhode Island FC in the USL Championship East:

1. How many points guarantee a playoff spot (top 8)?
2. How many points guarantee a home playoff game (top 4)?
3. How likely is each, on current form?

```
node tools/playoff/run.mjs                 # local build; 6h ESPN cache in .cache/espn
node tools/playoff/run.mjs --refresh       # force re-fetch
node --test tools/playoff/test.mjs
DRY_RUN=1 node tools/playoff/publish.mjs   # build + print, no Ghost write
GHOST_ADMIN_KEY=id:secret node tools/playoff/publish.mjs   # upsert /playoff-picture/
```

Outputs `out/playoff.json` (every number), `out/playoff.html` (embeddable
fragment, Terrace-styled, scoped under `.pt`) and `out/playoff.preview.html`
(the fragment wrapped in the theme stylesheet for local viewing).

## How it works

| Step | File | Notes |
| --- | --- | --- |
| Data | `espn.mjs` | ESPN has no working USL standings endpoint, so every East club's schedule is pulled under the `all` slug and the table is rebuilt from results. Only `usa.usl.1` regular-season games count. West clubs are fetched too so their strength is known. |
| Table | `standings.mjs` | Official tiebreakers: points → head-to-head points → head-to-head GD → in-conference PPG → wins → GD → GF. Tied groups restart at head-to-head after a split. |
| Guarantees | `magic.mjs` | For a target rank k, the smallest total P at which at most k−1 rivals can still reach P. A rival at exactly P counts as ahead unless the season series is finished and RIFC holds the edge. This assumes rivals all win out, so it is a safe upper bound. |
| Odds | `simulate.mjs` | Poisson goals model: attack/defence = goals for/against per game vs league average, shrunk toward average with a 5-game prior, plus the league's observed home/away split. 20,000 seeded seasons of every remaining East fixture, ranked with the real tiebreakers. |
| Page | `render.mjs` | Narrative cards, odds tiles, points ladder, East table, remaining fixtures. |

| Publish | `publish.mjs` | Upserts the Ghost page `/playoff-picture/` as one HTML card (markup lands verbatim; `<style>` is scoped under `.pt`). A fingerprint of the numbers is embedded as an HTML comment so unchanged pictures skip the write. |

## Automatic updates

`.github/workflows/update-playoff.yml` runs `publish.mjs` every morning at
6am ET and every 3h on Wed/Sat/Sun match nights, plus on demand
(`gh workflow run update-playoff.yml`). It uses the existing `GHOST_ADMIN_KEY`
secret. The first run creates the page (title hidden, `Playoff Picture`).

Colours on the two cards: **blue** = still in RIFC's hands, **gold** = only
possible with help from other results, **red** = mathematically eliminated.

## Navigation link

`partials/navigation.hbs` appends a **Playoff Picture** link after Ghost's own
navigation (the integration API key cannot edit Settings → Navigation). If the
same link is later added in Ghost settings, a CSS rule hides the theme copy so
it never shows twice. Ship it with `tools/deploy-theme.mjs` after the page
exists.
