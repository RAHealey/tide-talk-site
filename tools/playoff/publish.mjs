#!/usr/bin/env node
/**
 * Tide Talk — publish the playoff tracker to Ghost.
 *
 * Builds the tracker (see run.mjs) and upserts it into the Ghost page
 * /playoff-picture/ as a single HTML card, so the markup lands verbatim.
 * Skips the write when nothing but the timestamp changed.
 *
 * Env:
 *   GHOST_ADMIN_KEY = "<id>:<secret>"   Ghost Admin API key
 *   GHOST_URL       = https://casual-macaque.pikapod.net (default)
 *   DRY_RUN         = "1" to build and print without writing
 */
import crypto from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { loadSeason } from './espn.mjs';
import { build } from './run.mjs';
import { renderHtml } from './render.mjs';

const SLUG = 'playoff-picture';
const TITLE = 'Playoff Picture';
const GHOST_URL = (process.env.GHOST_URL || 'https://casual-macaque.pikapod.net').replace(/\/$/, '');

function ghToken() {
    const [id, secret] = (process.env.GHOST_ADMIN_KEY || '').split(':');
    if (!id || !secret) throw new Error('GHOST_ADMIN_KEY missing (expected "<id>:<secret>")');
    const now = Math.floor(Date.now() / 1000);
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const d = b({ alg: 'HS256', typ: 'JWT', kid: id }) + '.' + b({ iat: now, exp: now + 300, aud: '/admin/' });
    return d + '.' + crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(d).digest('base64url');
}
const gh = (path, opts = {}) => fetch(GHOST_URL + path, {
    ...opts,
    headers: { Authorization: 'Ghost ' + ghToken(), 'Accept-Version': 'v5.0', 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

/** Everything that matters for "did the picture change", timestamp excluded. */
function fingerprint(data) {
    const { asOf, ...rest } = data;
    return crypto.createHash('sha1').update(JSON.stringify(rest)).digest('hex').slice(0, 12);
}

const lexicalHtmlCard = (html) => JSON.stringify({
    root: { children: [{ type: 'html', version: 1, html }], direction: null, format: '', indent: 0, type: 'root', version: 1 },
});

function summary(data) {
    const { playoff, home, sim } = data;
    const p8 = Math.round(sim.focus.pTop8 * 100), p4 = Math.round(sim.focus.pTop4 * 100);
    const a = playoff.clinched ? 'Playoffs clinched' : playoff.inOwnHands ? `${playoff.magic} more points clinch a playoff spot (${p8}% likely)` : `Playoffs ${p8}% likely`;
    const b = home.clinched ? 'home playoff game clinched' : home.inOwnHands ? `${home.magic} more clinch a home playoff game (${p4}%)` : `home playoff game ${p4}% likely`;
    return `${a}; ${b}. Updated ${data.asOf}.`;
}

async function upsert(html, excerpt, hash) {
    const marker = `<!-- pt:${hash} -->`;
    const body = marker + '\n' + html;
    const g = await gh(`/ghost/api/admin/pages/slug/${SLUG}/?fields=id,updated_at,lexical`);
    if (g.status === 200) {
        const p = (await g.json()).pages[0];
        if ((p.lexical || '').includes(marker)) { console.log('unchanged — skipping write'); return 200; }
        const r = await gh(`/ghost/api/admin/pages/${p.id}/`, {
            method: 'PUT',
            body: JSON.stringify({ pages: [{ updated_at: p.updated_at, lexical: lexicalHtmlCard(body), custom_excerpt: excerpt, status: 'published', custom_template: 'custom-playoff-picture' }] }),
        });
        if (!r.ok) console.error(await r.text());
        return r.status;
    }
    const r = await gh('/ghost/api/admin/pages/', {
        method: 'POST',
        body: JSON.stringify({ pages: [{
            title: TITLE, slug: SLUG, status: 'published',
            lexical: lexicalHtmlCard(body), custom_excerpt: excerpt,
            show_title_and_feature_image: false,
            custom_template: 'custom-playoff-picture',
            meta_title: 'Rhode Island FC Playoff Picture — Tide Talk',
            meta_description: 'How many points RIFC need for the USL Championship playoffs and a home playoff game, and how likely each is. Updated automatically.',
        }] }),
    });
    if (!r.ok) console.error(await r.text());
    return r.status;
}

const season = await loadSeason({ cacheDir: process.env.ESPN_CACHE || '.cache/espn', refresh: !!process.env.CI });
const data = await build({ ...season, sims: Number(process.env.SIMS || 20000) });
const html = renderHtml(data);
const hash = fingerprint(data);
await mkdir('out', { recursive: true });
await writeFile('out/playoff.json', JSON.stringify(data, null, 2));
await writeFile('out/playoff.html', html);
console.log(summary(data));
console.log('fingerprint', hash, '| html bytes', html.length);
if (process.env.DRY_RUN === '1') { console.log('DRY_RUN — not writing to Ghost.'); process.exit(0); }
const status = await upsert(html, summary(data), hash);
console.log(`Ghost page /${SLUG}/ upsert HTTP`, status);
process.exit(status >= 200 && status < 300 ? 0 : 1);
