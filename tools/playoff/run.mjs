#!/usr/bin/env node
/**
 * Tide Talk — RIFC playoff tracker ("magic numbers").
 *
 *   node tools/playoff/run.mjs [--sims 20000] [--refresh] [--out out/playoff] [--cache .cache/espn]
 *
 * Writes <out>.json (all numbers) and <out>.html (embeddable fragment) and
 * prints a text summary. Reads ESPN with a 6h on-disk cache.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadSeason, RIFC_ID } from './espn.mjs';
import { buildTable, rankConference } from './standings.mjs';
import { clinchNumber } from './magic.mjs';
import { simulate, pointsForConfidence } from './simulate.mjs';
import { renderHtml, renderText } from './render.mjs';

const arg = (name, dflt) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? dflt : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

export async function build({ teams, games, focusId = RIFC_ID, sims = 20000, seed } = {}) {
    const rows = buildTable(teams, games);
    const ranked = rankConference(rows, games, 'East');
    const playoff = clinchNumber({ teamId: focusId, ranked, games, k: 8 });
    const home = clinchNumber({ teamId: focusId, ranked, games, k: 4 });
    const sim = simulate({ teams, games, conf: 'East', focusId, sims, seed });
    const confidence = {
        top8_50: pointsForConfidence(sim.focus.byPts, 'pTop8', 0.5),
        top8_90: pointsForConfidence(sim.focus.byPts, 'pTop8', 0.9),
        top4_50: pointsForConfidence(sim.focus.byPts, 'pTop4', 0.5),
        top4_90: pointsForConfidence(sim.focus.byPts, 'pTop4', 0.9),
    };
    const team = teams.find((t) => t.id === focusId);
    const fixtures = games.filter((g) => !g.played && (g.homeId === focusId || g.awayId === focusId)).map((g) => {
        const homeGame = g.homeId === focusId;
        const opp = teams.find((t) => t.id === (homeGame ? g.awayId : g.homeId));
        return {
            date: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }).format(new Date(g.date)),
            iso: g.date, home: homeGame, opp: opp?.short || 'TBD', oppId: opp?.id,
        };
    });
    const asOf = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date()) + ' ET';
    return { asOf, team, playoff, home, sim, ranked, fixtures, confidence };
}

async function main() {
    const season = await loadSeason({ cacheDir: arg('cache', '.cache/espn'), refresh: flag('refresh') });
    const data = await build({ ...season, sims: Number(arg('sims', 20000)) });
    const out = arg('out', 'out/playoff');
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(`${out}.json`, JSON.stringify(data, null, 2));
    const html = renderHtml(data);
    await writeFile(`${out}.html`, html);
    // Preview wraps the fragment in the real theme stylesheet (paper, fonts, texture) the way a Ghost page would.
    const themeCss = path.relative(path.dirname(out), 'assets/css/screen.css');
    await writeFile(`${out}.preview.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RIFC playoff tracker</title><link rel="stylesheet" href="${themeCss}"></head><body><div class="page"><article class="artpage playoffpage"><div class="wrap playoffwrap">${html}</div></article></div></body></html>`);
    console.log(renderText(data));
    console.log(`\nWrote ${out}.json, ${out}.html, ${out}.preview.html`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main().catch((e) => { console.error(e); process.exit(1); });
