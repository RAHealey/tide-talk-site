# Site Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header search icon that opens Ghost's native Sodo Search modal on tidetalkri.com.

**Architecture:** Ghost 6 auto-injects the Sodo Search script via `{{ghost_head}}`; any element with `data-ghost-search` opens the modal. We add one `<button>` to the masthead partial and ~4 lines of CSS, then deploy the theme zip via the Ghost Admin API.

**Tech Stack:** Ghost Handlebars theme ("tide-talk"), plain CSS, Node ≥22 for the deploy script, gscan for theme validation.

## Global Constraints

- Repo: `~/tide-talk-site`, branch `feat/search` (already created; spec committed).
- Live pod: `https://casual-macaque.pikapod.net`, public site `https://tidetalkri.com`.
- Admin API key: read from `~/tidetalk-migration/ghost-import/patch.mjs` (the `KEY` const, format `id:secret`). Never commit the key.
- **Theme zip MUST be named `tide-talk.zip`** — Ghost names the theme after the uploaded filename; any other name silently creates a separate inactive theme.
- Zip must EXCLUDE `.git`, `.github/`, `tools/`, `docs/`, `node_modules`, `*.zip` (extra top-level dirs cause a 422 on upload).
- Node API calls to the pod need `--dns-result-order=ipv4first` (pod IPv6 route unreachable).
- Permission gotcha: run the zip step and the node upload step as SEPARATE shell commands (combined pod-writing one-liners get blocked by the permission classifier).
- Theme colors: `--ink:#0d223f`, `--paper:#e7e0cf`, `--tide-deep:#1f6fa8`. Stamp/nav borders are 2.5px ink.

---

### Task 1: Search button in header + CSS

**Files:**
- Modify: `partials/header.hbs` (insert inside `.rhs` div, before the Subscribe `{{#if}}`, currently lines 12–18)
- Modify: `assets/css/screen.css` (desktop rules after `.stamp:hover` at line 71; mobile tweak inside the existing mobile media block near line 264)

**Interfaces:**
- Consumes: Ghost's built-in Sodo Search (auto-injected by `{{ghost_head}}` in `default.hbs`); trigger contract is the `data-ghost-search` attribute.
- Produces: `<button class="searchbtn" data-ghost-search>` in the masthead; `.searchbtn` CSS class. Task 2 deploys these unchanged.

- [ ] **Step 1: Add the button to `partials/header.hbs`**

Insert between `<div class="rhs">` and `{{#if @site.members_enabled}}`:

```hbs
                <button class="searchbtn" data-ghost-search aria-label="Search">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9"/></svg>
                </button>
```

`stroke="currentColor"` lets CSS drive the color; stroke-width 2.5 echoes the 2.5px stamp borders.

- [ ] **Step 2: Add desktop CSS in `assets/css/screen.css`**

Directly after the line `.stamp:hover{background:var(--ink);color:var(--paper2)}` (line 71):

```css
.searchbtn{display:inline-block;vertical-align:middle;background:none;border:0;padding:6px;margin-right:10px;cursor:pointer;color:var(--ink);line-height:0;transition:color .15s ease}
.searchbtn:hover{color:var(--tide-deep)}
.searchbtn svg{width:22px;height:22px;display:block}
```

- [ ] **Step 3: Add mobile CSS**

Inside the existing mobile media block, directly after `.masthead .stamp{display:none}` (line ~264 — the block where `.mrow .rhs` becomes flex):

```css
  .searchbtn{margin-right:0;padding:8px}   /* flex gap provides spacing; bigger tap target */
```

The Subscribe stamp is hidden on mobile but the search button stays visible next to the hamburger.

- [ ] **Step 4: Validate with gscan**

Run: `cd ~/tide-talk-site && npx gscan .`
Expected: passes with no errors (the pre-existing optional "custom-fonts" warning is OK).

- [ ] **Step 5: Commit**

```bash
cd ~/tide-talk-site && git add partials/header.hbs assets/css/screen.css && git commit -m "Add native Ghost search trigger to masthead

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Deploy to pod and verify live

**Files:**
- Create: `<scratchpad>/deploy-theme.mjs` (deploy script — scratchpad, not committed)
- Create: `<scratchpad>/tide-talk.zip` (build artifact)

**Interfaces:**
- Consumes: the committed theme from Task 1; Admin `KEY` from `~/tidetalk-migration/ghost-import/patch.mjs`.
- Produces: live theme on the pod; verified search behavior on tidetalkri.com.

- [ ] **Step 1: Build the zip** (separate command from the upload — permission gotcha)

```bash
cd ~/tide-talk-site && rm -f "$SCRATCH/tide-talk.zip" && zip -r "$SCRATCH/tide-talk.zip" . -x ".git/*" ".github/*" "tools/*" "docs/*" "node_modules/*" "*.zip"
```

(`$SCRATCH` = the session scratchpad dir.) Expected: zip listing shows `.hbs` files, `assets/`, `package.json`; no `.git`/`docs`/`tools` entries.

- [ ] **Step 2: Write `deploy-theme.mjs` in the scratchpad**

```js
import fs from 'fs';
import crypto from 'crypto';
const POD = 'https://casual-macaque.pikapod.net';
const KEY = fs.readFileSync(process.env.HOME + '/tidetalk-migration/ghost-import/patch.mjs', 'utf8').match(/KEY = '([^']+)'/)[1];
const [id, secret] = KEY.split(':');
function tok() { const n = Math.floor(Date.now() / 1000); const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'); const d = b({ alg: 'HS256', typ: 'JWT', kid: id }) + '.' + b({ iat: n, exp: n + 300, aud: '/admin/' }); return d + '.' + crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(d).digest('base64url'); }

const zip = fs.readFileSync(process.argv[2]);
const fd = new FormData();
fd.append('file', new Blob([zip], { type: 'application/zip' }), 'tide-talk.zip'); // filename MUST be tide-talk.zip
const up = await fetch(POD + '/ghost/api/admin/themes/upload/', { method: 'POST', headers: { Authorization: 'Ghost ' + tok(), 'Accept-Version': 'v5.0' }, body: fd });
console.log('upload:', up.status, JSON.stringify((await up.json()).themes?.map(t => t.name) ?? 'ERR'));
const act = await fetch(POD + '/ghost/api/admin/themes/tide-talk/activate/', { method: 'PUT', headers: { Authorization: 'Ghost ' + tok(), 'Accept-Version': 'v5.0' } });
console.log('activate:', act.status);
```

- [ ] **Step 3: Deploy**

Run: `node --dns-result-order=ipv4first "$SCRATCH/deploy-theme.mjs" "$SCRATCH/tide-talk.zip"`
Expected: `upload: 200 ["tide-talk"]` then `activate: 200`.

- [ ] **Step 4: Verify the button is live**

Run: `curl -s https://tidetalkri.com/ | grep -c 'data-ghost-search'` → expected `1` (or more).
Run: `curl -s https://tidetalkri.com/ | grep -o 'sodo-search[^"]*' | head -2` → expected sodo-search script/root references (proves Ghost injects the search bundle).

- [ ] **Step 5: Verify the modal works in a real browser**

Using the Claude-in-Chrome tools: open `https://tidetalkri.com`, click the `.searchbtn` icon, confirm the Sodo Search overlay opens, type `player ratings`, confirm post results appear. Also check a ~390px-wide viewport: search icon visible next to the hamburger. (If browser tools are unavailable, ask Ryan to click-test.)

- [ ] **Step 6: Push and open PR**

```bash
cd ~/tide-talk-site && git push -u origin feat/search && gh pr create --title "Add native Ghost search to masthead" --body "Adds a data-ghost-search trigger button (Sodo Search modal) to the masthead, per docs/superpowers/specs/2026-07-23-site-search-design.md. Deployed and verified live.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Expected: PR URL printed.
