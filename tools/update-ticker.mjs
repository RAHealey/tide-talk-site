/**
 * Tide Talk — match ticker updater.
 *
 * Pulls Rhode Island FC's latest result and next fixture from ESPN's public
 * JSON feed (USL Championship + US Open Cup) and writes a formatted string into
 * a hidden Ghost page (slug: match-ticker), which the theme's ticker reads.
 *
 * Run by .github/workflows/update-ticker.yml. Env:
 *   GHOST_ADMIN_KEY = "<id>:<secret>"  (Ghost Admin API key)
 *   GHOST_URL       = https://casual-macaque.pikapod.net   (optional, has default)
 *   DRY_RUN         = "1" to print without writing
 *
 * Uses ESPN's "all" slug, which aggregates every competition RIFC plays
 * (USL Championship, US Open Cup, USL/Prinx Tires Cup, friendlies). The theme's
 * manual override (Settings -> Design -> matchday_result / next_match) still wins
 * over this page if ever set.
 */

const TEAM_ID = '22164';           // ESPN Rhode Island FC
const TEAM_NAME = 'RIFC';
const LEAGUES = ['all'];           // every competition in one call
const GHOST_URL = (process.env.GHOST_URL || 'https://casual-macaque.pikapod.net').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';

const j = async (url) => {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
};

const scoreOf = (c) => {
    const s = c.score;
    if (s == null) return null;
    if (typeof s === 'object') return s.displayValue ?? String(s.value ?? '');
    return String(s);
};

// Flatten an ESPN schedule payload into simple event objects
function parseEvents(data) {
    const out = [];
    for (const e of data.events || []) {
        const comp = (e.competitions || [])[0] || {};
        const state = comp.status?.type?.state; // pre | in | post
        const cs = comp.competitors || [];
        const me = cs.find((c) => c.team?.id === TEAM_ID);
        const opp = cs.find((c) => c.team?.id !== TEAM_ID);
        if (!me || !opp) continue;
        out.push({
            date: new Date(e.date),
            state,
            home: me.homeAway === 'home',
            oppName: opp.team?.shortDisplayName || opp.team?.displayName || opp.team?.name || 'TBD',
            myScore: scoreOf(me),
            oppScore: scoreOf(opp),
        });
    }
    return out;
}

async function collect() {
    const results = [], fixtures = [];
    for (const lg of LEAGUES) {
        try {
            const done = await j(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams/${TEAM_ID}/schedule`);
            results.push(...parseEvents(done).filter((e) => e.state === 'post'));
        } catch (e) { console.error('results', lg, e.message); }
        try {
            const up = await j(`https://site.api.espn.com/apis/site/v2/sports/soccer/${lg}/teams/${TEAM_ID}/schedule?fixture=true`);
            fixtures.push(...parseEvents(up).filter((e) => e.state === 'pre'));
        } catch (e) { console.error('fixtures', lg, e.message); }
    }
    return { results, fixtures };
}

const fmtDate = (d) => new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
}).format(d).replace(',', '') + ' ET';

function buildTicker(results, fixtures) {
    const parts = [];
    const last = results.sort((a, b) => b.date - a.date)[0];
    if (last) parts.push(`FT: ${TEAM_NAME} ${last.myScore}–${last.oppScore} ${last.oppName}`);
    const next = fixtures.filter((e) => e.date > new Date()).sort((a, b) => a.date - b.date)[0];
    if (next) parts.push(`Next: ${TEAM_NAME} ${next.home ? 'vs' : 'at'} ${next.oppName} · ${fmtDate(next.date)}`);
    return { ticker: parts.join('  ◆  '), last, next };
}

// --- Ghost Admin API ---
import crypto from 'crypto';
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

async function upsertPage(ticker) {
    const g = await gh('/ghost/api/admin/pages/slug/match-ticker/?fields=id,updated_at');
    if (g.status === 200) {
        const p = (await g.json()).pages[0];
        const r = await gh(`/ghost/api/admin/pages/${p.id}/?source=html`, {
            method: 'PUT',
            body: JSON.stringify({ pages: [{ updated_at: p.updated_at, custom_excerpt: ticker, status: 'published' }] }),
        });
        return r.status;
    }
    const r = await gh('/ghost/api/admin/pages/?source=html', {
        method: 'POST',
        body: JSON.stringify({ pages: [{
            title: 'Match ticker (auto — do not delete)',
            slug: 'match-ticker',
            status: 'published',
            custom_excerpt: ticker,
            html: '<p>This page powers the homepage match ticker and is updated automatically. Safe to ignore.</p>',
        }] }),
    });
    return r.status;
}

// --- main ---
const { results, fixtures } = await collect();
const { ticker, last, next } = buildTicker(results, fixtures);
console.log('results:', results.length, '| fixtures:', fixtures.length);
console.log('ticker string:', ticker || '(empty)');
if (!ticker) { console.log('No data — leaving Ghost unchanged.'); process.exit(0); }
if (process.env.DRY_RUN === '1') { console.log('DRY_RUN — not writing to Ghost.'); process.exit(0); }
const status = await upsertPage(ticker);
console.log('Ghost page upsert HTTP', status);
process.exit(status >= 200 && status < 300 ? 0 : 1);
