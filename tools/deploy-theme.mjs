#!/usr/bin/env node
/**
 * Upload + activate the theme on the pod.
 *
 *   zip -qr tide-talk.zip . -x '.git/*' '.github/*' 'tools/*' 'docs/*' 'out/*' '.cache/*' 'node_modules/*' '*.DS_Store' 'README.md' 'tide-talk.zip'
 *   GHOST_ADMIN_KEY=id:secret node --dns-result-order=ipv4first tools/deploy-theme.mjs
 *
 * Ghost names the theme after the zip FILENAME, so the file must be tide-talk.zip.
 */
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const GHOST_URL = (process.env.GHOST_URL || 'https://casual-macaque.pikapod.net').replace(/\/$/, '');
const ZIP = process.env.THEME_ZIP || 'tide-talk.zip';

function ghToken() {
    const [id, secret] = (process.env.GHOST_ADMIN_KEY || '').split(':');
    if (!id || !secret) throw new Error('GHOST_ADMIN_KEY missing');
    const now = Math.floor(Date.now() / 1000);
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const d = b({ alg: 'HS256', typ: 'JWT', kid: id }) + '.' + b({ iat: now, exp: now + 300, aud: '/admin/' });
    return d + '.' + crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(d).digest('base64url');
}
const headers = () => ({ Authorization: 'Ghost ' + ghToken(), 'Accept-Version': 'v5.0' });

const form = new FormData();
form.append('file', new Blob([await readFile(ZIP)], { type: 'application/zip' }), 'tide-talk.zip');
const up = await fetch(`${GHOST_URL}/ghost/api/admin/themes/upload/`, { method: 'POST', headers: headers(), body: form });
console.log('upload HTTP', up.status);
if (!up.ok) { console.error(await up.text()); process.exit(1); }
const act = await fetch(`${GHOST_URL}/ghost/api/admin/themes/tide-talk/activate/`, { method: 'PUT', headers: headers() });
console.log('activate HTTP', act.status);
if (!act.ok) { console.error(await act.text()); process.exit(1); }
console.log('Theme tide-talk deployed and active.');
