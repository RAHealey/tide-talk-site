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
