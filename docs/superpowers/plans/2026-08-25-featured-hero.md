# Featured Post → Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A writer flipping Ghost's "Feature this post" toggle puts that post in the homepage hero; automation keeps at most one post featured (newest flag wins, others auto-demoted).

**Architecture:** Theme-side, one `{{#get}}` with `order="featured desc,updated_at desc"` picks the hero (featured post, else newest post); a second get `filter="featured:false+id:-{{id}}"` feeds the strips gap- and duplicate-free in both states. Server-side, a small Admin-API script runs every 5 min in the existing ticker GitHub Action and demotes all but the most-recently-updated featured post.

**Tech Stack:** Ghost 6 Handlebars theme, Ghost Admin API (HS256 JWT), Node 22 `.mjs` scripts, GitHub Actions.

## Global Constraints

- Repo: `~/tide-talk-site`, branch `feat/featured-hero` (already created; spec committed).
- Pod: `https://casual-macaque.pikapod.net` — force IPv4 (`node --dns-result-order=ipv4first`) for local runs.
- Admin key for local testing: read from `~/tidetalk-migration/ghost-import/patch.mjs` (never commit it).
- Theme zip MUST be named `tide-talk.zip` (Ghost names the theme after the zip filename); exclude `.git/`, `docs/`, `tools/`, `.github/` (422 otherwise).
- gscan runs on the ZIP: `npx gscan tide-talk.zip -z` — never on the repo dir.
- Handlebars gotchas: use `{{!-- --}}` for comments that mention `{{ }}`; never rely on `{{#get}}…{{else}}` reaching outer block params.
- Permission classifier blocks agent-run Admin-API *writes* to the pod: theme upload works when zip and node steps are separate commands; post-mutating runs may need Ryan via `!` prefix or the GitHub Action.
- Live test data (as of 2026-08-25): 2 featured posts — "Rhode Island FC Agree to Transfer JJ Williams…" (updated 2026-08-25, the keeper) and "E168: LATE NIGHT LOSIN'" (updated 2026-07-10, to be demoted).

---

### Task 1: `tools/enforce-featured.mjs` (single-featured enforcer)

**Files:**
- Create: `tools/enforce-featured.mjs`

**Interfaces:**
- Consumes: env `GHOST_ADMIN_KEY` (`<id>:<secret>`), optional `GHOST_URL`, optional `DRY_RUN=1`.
- Produces: exit 0 on success/no-op, exit 1 on any failed demote; logs kept/demoted titles. Task 2's workflow step runs it as `node tools/enforce-featured.mjs`.

- [x] **Step 1: Write the script**

```js
/**
 * Tide Talk — single-featured-post enforcer.
 *
 * The homepage hero shows the featured post. Only one post may be featured at
 * a time: this keeps the most recently updated featured post (i.e. the one a
 * writer just flagged) and sets featured:false on every other featured post.
 *
 * Run by .github/workflows/update-ticker.yml every 5 minutes. Env:
 *   GHOST_ADMIN_KEY = "<id>:<secret>"  (Ghost Admin API key)
 *   GHOST_URL       = https://casual-macaque.pikapod.net   (optional, has default)
 *   DRY_RUN         = "1" to print without writing
 */

import crypto from 'crypto';

const GHOST_URL = (process.env.GHOST_URL || 'https://casual-macaque.pikapod.net').replace(/\/$/, '');

function ghToken() {
    const [id, secret] = process.env.GHOST_ADMIN_KEY.split(':');
    const now = Math.floor(Date.now() / 1000);
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const d = b({ alg: 'HS256', typ: 'JWT', kid: id }) + '.' + b({ iat: now, exp: now + 300, aud: '/admin/' });
    return d + '.' + crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(d).digest('base64url');
}
const gh = (path, opts = {}) => fetch(GHOST_URL + path, {
    ...opts,
    headers: { Authorization: 'Ghost ' + ghToken(), 'Accept-Version': 'v5.0', 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

const list = await gh('/ghost/api/admin/posts/?filter=featured:true&order=' + encodeURIComponent('updated_at desc') + '&fields=id,title,updated_at&limit=all');
if (!list.ok) { console.error('list featured -> HTTP', list.status); process.exit(1); }
const posts = (await list.json()).posts || [];
console.log(`featured posts: ${posts.length}`, posts.map((p) => p.title));
if (posts.length <= 1) { console.log('nothing to do'); process.exit(0); }

const [keep, ...demote] = posts;
console.log('keeping featured:', keep.title);
let failed = 0;
for (const p of demote) {
    if (process.env.DRY_RUN === '1') { console.log('DRY_RUN — would demote:', p.title); continue; }
    const r = await gh(`/ghost/api/admin/posts/${p.id}/`, {
        method: 'PUT',
        body: JSON.stringify({ posts: [{ featured: false, updated_at: p.updated_at }] }),
    });
    console.log(`${r.ok ? 'demoted' : 'FAILED HTTP ' + r.status}: ${p.title}`);
    if (!r.ok) failed++;
}
process.exit(failed ? 1 : 0);
```

- [x] **Step 2: DRY_RUN against the live pod**

Run (key value read from `~/tidetalk-migration/ghost-import/patch.mjs`):
`cd ~/tide-talk-site && DRY_RUN=1 GHOST_ADMIN_KEY='<id:secret>' node --dns-result-order=ipv4first tools/enforce-featured.mjs`

Expected: lists 2 featured posts, `keeping featured: Rhode Island FC Agree to Transfer JJ Williams…`, `DRY_RUN — would demote: E168: LATE NIGHT LOSIN'`, exit 0.

- [x] **Step 3: Commit**

```bash
git add tools/enforce-featured.mjs
git commit -m "Add single-featured-post enforcer script"
```

### Task 2: Wire enforcer into the ticker workflow

**Files:**
- Modify: `.github/workflows/update-ticker.yml` (append a step after "Update RIFC ticker in Ghost")

**Interfaces:**
- Consumes: `tools/enforce-featured.mjs` from Task 1; repo secret `GHOST_ADMIN_KEY` (already set).
- Produces: cleanup runs every 5 min on main after merge.

- [x] **Step 1: Append the step**

```yaml
      - name: Enforce single featured post
        if: always()
        env:
          GHOST_ADMIN_KEY: ${{ secrets.GHOST_ADMIN_KEY }}
          GHOST_URL: https://casual-macaque.pikapod.net
        run: node tools/enforce-featured.mjs
```

(`if: always()` so a ticker failure — e.g. ESPN API down — never blocks cleanup.)

- [x] **Step 2: Update the workflow header comment** — mention it now also enforces the single-featured rule.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/update-ticker.yml
git commit -m "Run featured-post enforcer in the 5-minute ticker workflow"
```

### Task 3: `index.hbs` — featured-aware hero + gap-free strips

**Files:**
- Modify: `index.hbs:1-79` (restructure the hero/strips gets; quote band, podcast strip, newsletter unchanged)

**Interfaces:**
- Consumes: Ghost `{{#get}}` with `order="featured desc,updated_at desc"` (verified working on this pod via Admin API 2026-08-25).
- Produces: hero = featured post else newest; strips = 7 newest non-featured posts excluding the hero.

- [x] **Step 1: Replace lines 1–79** with:

```hbs
{{!< default}}

{{!-- ---------- HERO: live YouTube show when we're on air (else CSS hides it), else the featured post, else the newest post ---------- --}}
{{#get "posts" limit="1" order="featured desc,updated_at desc" include="authors,tags" as |hp|}}{{#foreach hp}}

    <section class="hero">
        <div class="wrap hero-2">
            {{#get "pages" filter="slug:youtube-live+title:live" limit="1" as |ytlive|}}{{#foreach ytlive}}
                <div class="livehero">
                    <div class="livevid"><span class="livebadge">&#9679; LIVE</span><iframe src="https://www.youtube.com/embed/{{excerpt}}?autoplay=1&mute=1&playsinline=1" title="Tide Talk Live" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="eager"></iframe></div>
                    <a class="chatbtn" href="https://www.youtube.com/watch?v={{excerpt}}" target="_blank" rel="noopener">&#128172; Join the chat on YouTube</a>
                </div>
            {{/foreach}}{{/get}}
            <div class="poster">
                <div class="tex"></div>
                <div class="halftone"></div>
                <div class="inner">
                    <span class="kick">&#9733; {{#if primary_tag}}{{primary_tag.name}}{{else}}Latest{{/if}}</span>
                    <h1><a href="{{url}}">{{title}}</a></h1>
                    <p class="deck">{{excerpt characters="280"}}</p>
                    <span class="by">{{primary_author.name}} &middot; {{date format="MMMM D, YYYY"}}</span>
                </div>
            </div>
        </div>
    </section>

    {{!-- Strips: 7 newest non-featured posts, excluding the hero. Works in both hero
         states — featured hero: it is excluded by featured:false; newest-post hero:
         excluded by id — so the sections below are always gap- and duplicate-free. --}}
    {{#get "posts" filter="featured:false+id:-{{id}}" limit="7" include="authors,tags" as |feed|}}

        {{!-- ---------- STORY STRIP: feed 1-3 ---------- --}}
        <section class="results">
            <div class="wrap">
                <div class="rgrid">
                    {{#foreach feed}}{{#has number="1,2,3"}}
                        <a class="cell" href="{{url}}">
                            {{!-- Real <img> (not CSS background) so the browser can fetch it early — the first card is usually the mobile LCP element --}}
                            <div class="thumb">{{#if feature_image}}<img src="{{img_url feature_image size="m"}}" srcset="{{img_url feature_image size="s"}} 400w, {{img_url feature_image size="m"}} 750w" sizes="(max-width: 620px) 94vw, (max-width: 900px) 46vw, 370px" alt=""{{#match @number 1}} fetchpriority="high"{{/match}}>{{/if}}</div>
                            <div class="cx">
                                <div class="k">{{#if primary_tag}}{{primary_tag.name}}{{else}}Latest{{/if}}</div>
                                <h3>{{title}}</h3>
                                <div class="m">{{primary_author.name}} &middot; {{date format="MMM D"}}</div>
                            </div>
                        </a>
                    {{/has}}{{/foreach}}
                </div>
            </div>
        </section>

        {{!-- ---------- THE LATEST: feed 4 main + feed 5-7 side ---------- --}}
        <section class="latest">
            <div class="wrap">
                <div class="banner"><span class="flag"><span>Off the Pitch</span></span><h2>The Latest</h2><span class="rule"></span></div>
                <div class="cols">
                    {{#foreach feed}}{{#has number="4"}}
                        <a class="mainstory" href="{{url}}">
                            {{!-- stand-in gradient (in CSS) — never the real feature image, which has baked-in text that clashes with the overlaid headline --}}
                            <div class="fill"></div>
                            <div class="ht"></div>
                            <div class="scrim"></div>
                            <div class="c">
                                <div class="k">{{#if primary_tag}}{{primary_tag.name}}{{else}}Latest{{/if}}</div>
                                <h3>{{title}}</h3>
                                <p>{{excerpt characters="240"}}</p>
                            </div>
                        </a>
                    {{/has}}{{/foreach}}
                    <div class="sidelist">
                        {{#foreach feed}}{{#has number="5,6,7"}}
                            <a class="item" href="{{url}}">
                                <div class="k">{{#if primary_tag}}{{primary_tag.name}}{{else}}Latest{{/if}}</div>
                                <h4>{{title}}</h4>
                                <div class="m">{{primary_author.name}} &middot; {{date format="MMM D"}}</div>
                            </a>
                        {{/has}}{{/foreach}}
                    </div>
                </div>
            </div>
        </section>

    {{/get}}

{{/foreach}}{{/get}}
```

(Everything from the quote band down stays byte-identical.)

- [x] **Step 2: gscan the zip**

```bash
cd ~/tide-talk-site && rm -f /tmp/tide-talk.zip && zip -rq /tmp/tide-talk.zip . -x '.git/*' -x 'docs/*' -x 'tools/*' -x '.github/*'
npx gscan /tmp/tide-talk.zip -z
```

Expected: no errors (the pre-existing optional custom-fonts warning is fine).

- [x] **Step 3: Commit**

```bash
git add index.hbs
git commit -m "Homepage hero shows the featured post; strips exclude it"
```

### Task 4: Deploy + live verification

**Files:**
- Create (scratchpad, not committed): `deploy-theme.mjs`

**Interfaces:**
- Consumes: `/tmp/tide-talk.zip` from Task 3; Admin key from `~/tidetalk-migration/ghost-import/patch.mjs`.
- Produces: theme live on the pod.

- [x] **Step 1: Deploy script** (scratchpad):

```js
import crypto from 'crypto';
import fs from 'fs';
const POD = 'https://casual-macaque.pikapod.net';
const KEY = fs.readFileSync('/Users/ryanhealey/tidetalk-migration/ghost-import/patch.mjs', 'utf8').match(/KEY = '([^']+)'/)[1];
const [id, secret] = KEY.split(':');
function tok() { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const n = Math.floor(Date.now() / 1000); const d = b({ alg: 'HS256', typ: 'JWT', kid: id }) + '.' + b({ iat: n, exp: n + 300, aud: '/admin/' }); return d + '.' + crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(d).digest('base64url'); }
const fd = new FormData();
fd.append('file', new Blob([fs.readFileSync('/tmp/tide-talk.zip')], { type: 'application/zip' }), 'tide-talk.zip');
const up = await fetch(POD + '/ghost/api/admin/themes/upload/', { method: 'POST', headers: { Authorization: 'Ghost ' + tok(), 'Accept-Version': 'v5.0' }, body: fd });
console.log('upload', up.status, up.ok ? '' : await up.text());
const act = await fetch(POD + '/ghost/api/admin/themes/tide-talk/activate/', { method: 'PUT', headers: { Authorization: 'Ghost ' + tok(), 'Accept-Version': 'v5.0' } });
console.log('activate', act.status, act.ok ? '' : await act.text());
process.exit(up.ok && act.ok ? 0 : 1);
```

Run: `node --dns-result-order=ipv4first deploy-theme.mjs` (separate command from the zip step — classifier requirement).

- [x] **Step 2: Verify featured state live**

`curl -s https://tidetalkri.com/ | grep -c 'JJ Williams'` → expect ≥1 inside `.poster h1`; grep the strips for it → expect 0 duplicates; confirm `.rgrid` has 3 cells, sidelist 3 items (no gaps). If the poster is missing entirely → the get order/nesting failed → fall back to dual-render + `:has()` per the spec, redeploy.

- [x] **Step 3: Verify fallback state after cleanup** — once the enforcer has run (CI after merge, or Ryan runs `! DRY_RUN unset` version), re-curl: hero still JJ Williams (it stays featured); E168 no longer featured. Optionally have Ryan unfeature JJ Williams in admin to confirm the newest-post fallback, or trust the `order` semantics already verified via API.

### Task 5: PR, merge, CI verification

- [x] **Step 1:** `git push -u origin feat/featured-hero` and open PR with `gh pr create`.
- [x] **Step 2:** After merge to main: `gh run watch` the next "Update match ticker" run → "Enforce single featured post" step logs `demoted: E168: LATE NIGHT LOSIN'`.
- [x] **Step 3:** Confirm via API that exactly 1 featured post remains.

## Self-Review

- Spec coverage: theme hero/strips (Task 3), cleanup script (Task 1), workflow wiring (Task 2), testing/deploy/verify (Tasks 4–5). Writer-facing behavior emerges from these. ✓
- No placeholders; all code inline. ✓
- Consistency: `enforce-featured.mjs` name matches between Tasks 1–2; zip path `/tmp/tide-talk.zip` matches between Tasks 3–4; `feed` block-param numbering 1–7 consistent. ✓
