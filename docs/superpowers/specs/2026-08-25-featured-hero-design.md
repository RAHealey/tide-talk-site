# Featured post → homepage hero

**Date:** 2026-08-25
**Status:** Approved

## Goal

When a writer flips Ghost's "Feature this post" toggle, that post takes the homepage hero
(poster) spot. Only one post may be featured at a time: the most recently flagged post keeps
the flag; every other featured post is automatically set back to not-featured.

## Current behavior

`index.hbs` fetches the 8 newest posts and slots them positionally: hero = #1, story strip =
#2–4, "The Latest" main = #5, sidelist = #6–8. The featured flag is ignored everywhere.

## Design

### Theme (`index.hbs`)

One hero get replaces the positional hero — no if/else branch needed:

```hbs
{{#get "posts" limit="1" order="featured desc,updated_at desc" include="authors,tags" as |hp|}}
{{#foreach hp}}
  <section class="hero"> … poster from this post … </section>
  {{#get "posts" filter="featured:false+id:-{{id}}" limit="7" include="authors,tags" as |feed|}}
    <section class="results">   … feed #1–3 … </section>
    <section class="latest">    … feed #4 main, #5–7 sidelist … </section>
  {{/get}}
{{/foreach}}
{{/get}}
```

- `order="featured desc,updated_at desc"`: a featured post always wins the hero; with no
  featured post the hero falls back to the most recent post. **Verified working against the
  live pod via Admin API (2026-08-25).** `updated_at` (not `published_at`) as the tiebreak
  means the *most recently flagged* featured post wins during the ≤5-min window before
  cleanup runs, even if it's an older post. Caveat accepted: in the no-featured fallback
  state, an *edited* old post could briefly out-rank the newest post in the hero (updated_at
  ordering). Rare, cosmetic, and self-correcting as new posts publish.
- Strip feed `filter="featured:false+id:-{{id}}"`: excludes all featured posts *and* the hero
  post itself. Both states produce a gap-free, duplicate-free homepage:
  - Featured hero → strips = 7 newest non-featured posts.
  - Fallback hero (newest post) → strips = next 7 posts (same content as today).
- Numbering inside the strip feed becomes uniform: story strip `#has number="1,2,3"`, main
  story `number="4"`, sidelist `number="5,6,7"`. The `fetchpriority="high"` match moves from
  `@number 2` to `@number 1`.
- The YouTube live hero is unchanged: the `livehero` get stays a sibling of the poster inside
  `.hero-2`, and `.hero-2:has(.livehero) .poster{display:none}` keeps hiding the poster when
  the show is live.
- Podcast strip, quote band, newsletter: unchanged.

Known Ghost/Handlebars risks and mitigations: nested `{{#get}}` inside `{{#foreach}}` (a
sibling-nested get already works in this template for the live hero); dynamic filter value
`id:-{{id}}` is the documented Ghost related-posts pattern. Verify live after deploy; if the
nested structure fails, fall back to the proven dual-render + CSS `:has()` approach.

### Cleanup automation (`tools/enforce-featured.mjs`)

New standalone script, run as a second step of the existing every-5-minutes GitHub Action
(`.github/workflows/update-ticker.yml`; `GHOST_ADMIN_KEY` secret already configured):

1. `GET /ghost/api/admin/posts/?filter=featured:true&order=updated_at desc` (fields:
   id, title, updated_at).
2. If ≤1 result: exit 0 (no-op — the usual case, costs one read).
3. Otherwise keep result #1 (most recently updated = most recently flagged) and
   `PUT /posts/{id}` with `{featured: false, updated_at}` for each of the rest.

Separate script (not bolted into `update-ticker.mjs`) because the ticker exits early on
no-data/unchanged paths, which would silently skip cleanup. Separate workflow step so a
ticker failure doesn't block cleanup and vice versa.

### Writer-facing behavior

- Feature a post → it's in the hero within one page load; any previously featured post is
  demoted within ~5 minutes (invisible on the site — the hero already shows the newer flag).
- Unfeature everything → homepage reverts to newest-post hero automatically.

## Out of scope

- No hero design changes (same poster markup/CSS).
- Featured styling on tag/author/archive pages.
- Instant webhook-based cleanup (cron piggyback chosen; revisit only if the 5-min window
  ever matters).

## Testing

- `npx gscan tide-talk.zip -z` on the deployable zip (not the repo dir).
- `DRY_RUN=1 node tools/enforce-featured.mjs` locally against the live pod (2 featured posts
  exist today — real test data: keeps "JJ Williams transfer", demotes "E168").
- Deploy theme, verify live in browser: featured post in hero, no duplicates below, strips
  gap-free; then live-run cleanup and confirm only one featured post remains and homepage
  still correct.
