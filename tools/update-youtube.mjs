// Polls the Tide Talk YouTube channel for a live / scheduled-upcoming broadcast and
// writes the state to the hidden Ghost page "youtube-live" (slug), which the theme reads.
// Quota-aware: only calls the YouTube API during evening ET windows (shows are ~8:30pm).
// Env: GHOST_ADMIN_KEY (id:secret), YOUTUBE_API_KEY.
import crypto from 'crypto';

const POD = 'https://casual-macaque.pikapod.net';
const CHANNEL = 'UCSB8wDUcko4WdwaSekN6oPg';
const [GID, GSECRET] = (process.env.GHOST_ADMIN_KEY || '').split(':');
const YT = process.env.YOUTUBE_API_KEY;
if (!GID || !GSECRET || !YT) { console.error('missing GHOST_ADMIN_KEY or YOUTUBE_API_KEY'); process.exit(1); }

function tok() { const h = { alg: 'HS256', typ: 'JWT', kid: GID }; const n = Math.floor(Date.now() / 1000); const p = { iat: n, exp: n + 300, aud: '/admin/' }; const b = o => Buffer.from(JSON.stringify(o)).toString('base64url'); const d = b(h) + '.' + b(p); return d + '.' + crypto.createHmac('sha256', Buffer.from(GSECRET, 'hex')).update(d).digest('base64url'); }
const GH = () => ({ Authorization: 'Ghost ' + tok(), 'Accept-Version': 'v5.0', 'Content-Type': 'application/json' });

// --- ET time gate ---
const etParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short', month: 'short', day: 'numeric' }).formatToParts(new Date());
const et = Object.fromEntries(etParts.map(p => [p.type, p.value]));
const H = parseInt(et.hour, 10), M = parseInt(et.minute, 10);
const doLive = H >= 18 && H <= 22;                    // 6:00–10:59pm ET: watch for going live/off
const doUpcoming = (H >= 15 && H <= 22) && (M % 30 < 5); // ~every 30 min from 3pm: catch scheduled shows
console.log(`ET ${et.weekday} ${et.hour}:${et.minute} — liveCheck=${doLive} upcomingCheck=${doUpcoming}`);

async function ytSearch(eventType) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${CHANNEL}&eventType=${eventType}&type=video&maxResults=1&key=${YT}`);
    const j = await r.json();
    if (j.error) { console.error('YT error', JSON.stringify(j.error).slice(0, 160)); return null; }
    return (j.items && j.items[0]) || null;
}
async function scheduledStart(videoId) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${YT}`);
    const j = await r.json();
    return j.items?.[0]?.liveStreamingDetails?.scheduledStartTime || null;
}
function fmtCountdown(iso) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    const time = `${p.hour}:${p.minute} ${p.dayPeriod} ET`;
    const sameDay = p.weekday === et.weekday && p.day === et.day;
    return sameDay ? `LIVE TONIGHT · ${time}` : `LIVE ${p.weekday.toUpperCase()} · ${time}`;
}

// --- read current state from the hidden page ---
const pageRes = await (await fetch(`${POD}/ghost/api/admin/pages/slug/youtube-live/?fields=id,title,custom_excerpt,updated_at`, { headers: GH() })).json();
const page = pageRes.pages && pageRes.pages[0];
if (!page) { console.error('hidden page youtube-live not found'); process.exit(1); }
const current = { status: page.title, videoId: '', label: page.custom_excerpt || '' };

let next = { ...current };
if (doLive) {
    const live = await ytSearch('live');
    if (live) next = { status: 'live', videoId: live.id.videoId, label: '' };
    else if (current.status === 'live') next = { status: 'off', videoId: '', label: '' };
}
if (next.status !== 'live' && doUpcoming) {
    const up = await ytSearch('upcoming');
    if (up) { const s = await scheduledStart(up.id.videoId); next = { status: 'upcoming', videoId: up.id.videoId, label: s ? fmtCountdown(s) : 'LIVE SOON' }; }
    else if (current.status === 'upcoming') next = { status: 'off', videoId: '', label: '' };
}
if (!doLive && !doUpcoming) { console.log('outside polling window — leaving state as', current.status); process.exit(0); }

// state is stored as: title = live|upcoming|off ; custom_excerpt = videoId (live) or countdown label (upcoming)
const excerpt = next.status === 'live' ? next.videoId : next.status === 'upcoming' ? next.label : '';
if (next.status === current.status && excerpt === current.label) { console.log('unchanged:', next.status); process.exit(0); }
const r = await fetch(`${POD}/ghost/api/admin/pages/${page.id}/`, { method: 'PUT', headers: GH(), body: JSON.stringify({ pages: [{ updated_at: page.updated_at, title: next.status, custom_excerpt: excerpt }] }) });
console.log('write', r.status, '->', next.status, excerpt.slice(0, 60));
