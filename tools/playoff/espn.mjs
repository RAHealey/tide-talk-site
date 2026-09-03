/**
 * ESPN data layer for the playoff tracker.
 *
 * ESPN's public "site" API has no working standings endpoint for USL
 * Championship, but per-team schedules under the "all" slug do work, so we
 * rebuild the table ourselves from every team's results + fixtures.
 *
 * Only regular-season USL Championship games (league slug usa.usl.1) count.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const RIFC_ID = '22164';
export const LEAGUE_SLUG = 'usa.usl.1';

// 2026 Eastern Conference (13 clubs). RIFC plays each of these home + away.
export const EAST_IDS = [
    '22164',  // Rhode Island FC
    '19411',  // Hartford Athletic
    '131579', // Brooklyn FC
    '17361',  // Tampa Bay Rowdies
    '19405',  // Birmingham Legion FC
    '17827',  // Pittsburgh Riverhounds
    '19410',  // Loudoun United FC
    '17360',  // Indy Eleven
    '9729',   // Charleston Battery
    '19179',  // Detroit City FC
    '18159',  // Miami FC
    '17832',  // Louisville City FC
    '131578', // Sporting JAX
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const scheduleUrl = (id, fixtures) =>
    `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${id}/schedule${fixtures ? '?fixture=true' : ''}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return r.json();
}

/** Fetch with an on-disk cache so re-runs (and tests) don't hammer ESPN. */
async function cachedSchedule(id, fixtures, { cacheDir, maxAgeMs, refresh }) {
    const file = path.join(cacheDir, `${id}.${fixtures ? 'fix' : 'res'}.json`);
    if (!refresh) {
        try {
            const s = await stat(file);
            if (Date.now() - s.mtimeMs < maxAgeMs) return JSON.parse(await readFile(file, 'utf8'));
        } catch { /* miss */ }
    }
    const data = await fetchJson(scheduleUrl(id, fixtures));
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify(data));
    await sleep(600); // be polite; ESPN 403s on bursts
    return data;
}

const goals = (c) => {
    const s = c.score;
    if (s == null) return null;
    if (typeof s === 'object') return s.value ?? (s.displayValue != null ? Number(s.displayValue) : null);
    return Number(s);
};

/** Convert one ESPN schedule payload into normalized game rows. */
export function parseGames(payload) {
    const games = [];
    const teams = new Map();
    for (const e of payload.events || []) {
        if (e.league?.slug !== LEAGUE_SLUG) continue;
        if (e.seasonType?.name && e.seasonType.name !== 'Regular Season') continue;
        const comp = (e.competitions || [])[0];
        if (!comp) continue;
        const home = comp.competitors.find((c) => c.homeAway === 'home');
        const away = comp.competitors.find((c) => c.homeAway === 'away');
        if (!home || !away) continue;
        for (const c of [home, away]) {
            teams.set(c.team.id, {
                id: c.team.id,
                name: c.team.displayName,
                short: c.team.shortDisplayName?.trim() || c.team.displayName,
                abbr: c.team.abbreviation,
                logo: c.team.logos?.[0]?.href || null,
            });
        }
        const played = comp.status?.type?.state === 'post' && comp.status?.type?.completed !== false;
        games.push({
            id: e.id,
            date: e.date,
            homeId: home.team.id,
            awayId: away.team.id,
            homeGoals: played ? goals(home) : null,
            awayGoals: played ? goals(away) : null,
            played,
        });
    }
    return { games, teams };
}

/**
 * Load the whole league: results + fixtures for every East club, then results
 * for every other club they play (needed to rate West opponents). Games are
 * de-duplicated by ESPN event id.
 */
export async function loadSeason(opts = {}) {
    const o = { cacheDir: '.cache/espn', maxAgeMs: 6 * 3600e3, refresh: false, ...opts };
    const games = new Map();
    const teams = new Map();
    const absorb = (payload) => {
        const p = parseGames(payload);
        for (const g of p.games) games.set(g.id, g);
        for (const [id, t] of p.teams) teams.set(id, t);
    };
    for (const id of EAST_IDS) {
        absorb(await cachedSchedule(id, false, o));
        absorb(await cachedSchedule(id, true, o));
    }
    const others = [...teams.keys()].filter((id) => !EAST_IDS.includes(id));
    for (const id of others) absorb(await cachedSchedule(id, false, o));
    return {
        teams: [...teams.values()].map((t) => ({ ...t, conf: EAST_IDS.includes(t.id) ? 'East' : 'West' })),
        games: [...games.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
}
