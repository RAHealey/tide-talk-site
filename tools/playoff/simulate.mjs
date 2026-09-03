/**
 * Monte Carlo season simulation.
 *
 * Match model: independent Poisson goals. A club's attack/defence ratings are
 * its goals for/against per game relative to the league average, shrunk toward
 * average with a prior worth `PRIOR_GAMES` matches. Home advantage is the
 * league's observed home/away scoring split.
 *
 *   E[home goals] = leagueHomeAvg * att(home) * def(away)
 *   E[away goals] = leagueAwayAvg * att(away) * def(home)
 *
 * Every remaining regular-season game involving an East club is simulated, the
 * conference is ranked with the real tiebreakers, and we tally where each club
 * finishes. Deterministic given `seed`.
 */
import { buildTable, applyResult, rankConference } from './standings.mjs';

const PRIOR_GAMES = 5;

export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function poisson(lambda, rand) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= rand(); } while (p > L && k < 15);
    return k - 1;
}

/** Attack/defence ratings + league averages from played games. */
export function rateTeams(rows, games) {
    let hg = 0, ag = 0, n = 0;
    for (const g of games) if (g.played) { hg += g.homeGoals; ag += g.awayGoals; n++; }
    const homeAvg = n ? hg / n : 1.4, awayAvg = n ? ag / n : 1.1;
    const avg = (homeAvg + awayAvg) / 2;
    const ratings = new Map();
    for (const r of rows.values()) {
        const shrink = (x) => (x * r.gp + avg * PRIOR_GAMES) / (r.gp + PRIOR_GAMES) / avg;
        ratings.set(r.id, {
            att: shrink(r.gp ? r.gf / r.gp : avg),
            def: shrink(r.gp ? r.ga / r.gp : avg),
        });
    }
    return { ratings, homeAvg, awayAvg };
}

export function expectedGoals(homeId, awayId, model) {
    const h = model.ratings.get(homeId), a = model.ratings.get(awayId);
    return {
        home: model.homeAvg * h.att * a.def,
        away: model.awayAvg * a.att * h.def,
    };
}

/**
 * @returns per-team finish distributions + RIFC-style detail for `focusId`.
 */
export function simulate({ teams, games, conf = 'East', focusId, sims = 20000, seed = 20260902 }) {
    const rand = mulberry32(seed);
    const baseRows = buildTable(teams, games);
    const model = rateTeams(baseRows, games);
    const confIds = new Set(teams.filter((t) => t.conf === conf).map((t) => t.id));
    const played = games.filter((g) => g.played);
    const todo = games.filter((g) => !g.played && (confIds.has(g.homeId) || confIds.has(g.awayId)));
    const xg = todo.map((g) => expectedGoals(g.homeId, g.awayId, model));

    const finish = new Map([...confIds].map((id) => [id, new Array(confIds.size).fill(0)]));
    const ptsSum = new Map([...confIds].map((id) => [id, 0]));
    const focus = new Map(); // final pts -> {n, top8, top4, top1}

    for (let s = 0; s < sims; s++) {
        const rows = new Map();
        for (const [id, r] of baseRows) rows.set(id, { ...r });
        const simGames = [...played];
        for (let i = 0; i < todo.length; i++) {
            const g = todo[i];
            const hg = poisson(xg[i].home, rand), ag = poisson(xg[i].away, rand);
            applyResult(rows.get(g.homeId), rows.get(g.awayId), hg, ag);
            simGames.push({ ...g, played: true, homeGoals: hg, awayGoals: ag });
        }
        const ranked = rankConference(rows, simGames, conf);
        ranked.forEach((r, i) => {
            finish.get(r.id)[i]++;
            ptsSum.set(r.id, ptsSum.get(r.id) + r.pts);
            if (r.id === focusId) {
                const b = focus.get(r.pts) || { pts: r.pts, n: 0, top8: 0, top4: 0, top1: 0 };
                b.n++; if (i < 8) b.top8++; if (i < 4) b.top4++; if (i === 0) b.top1++;
                focus.set(r.pts, b);
            }
        });
    }

    const pct = (x) => x / sims;
    const teamsOut = [...confIds].map((id) => {
        const f = finish.get(id);
        const sum = (a, b) => f.slice(a, b).reduce((x, y) => x + y, 0);
        return {
            id, name: baseRows.get(id).name, short: baseRows.get(id).short,
            pTop1: pct(sum(0, 1)), pTop4: pct(sum(0, 4)), pTop8: pct(sum(0, 8)),
            avgPts: ptsSum.get(id) / sims,
            finish: f.map(pct),
        };
    }).sort((a, b) => b.pTop8 - a.pTop8 || b.pTop4 - a.pTop4);

    const byPts = [...focus.values()].sort((a, b) => a.pts - b.pts)
        .map((b) => ({ pts: b.pts, share: pct(b.n), pTop8: b.top8 / b.n, pTop4: b.top4 / b.n, pTop1: b.top1 / b.n }));

    return {
        sims, seed, gamesSimulated: todo.length,
        model: { homeAvg: model.homeAvg, awayAvg: model.awayAvg, priorGames: PRIOR_GAMES },
        teams: teamsOut,
        focus: { id: focusId, ...teamsOut.find((t) => t.id === focusId), byPts },
    };
}

/** Lowest final points total whose simulated outcomes clear `target` probability for `key` (needs a few hundred samples of support). */
export function pointsForConfidence(byPts, key, target, minShare = 0.002) {
    let best = null;
    for (let i = byPts.length - 1; i >= 0; i--) {
        const b = byPts[i];
        if (b[key] >= target && b.share >= minShare) best = b.pts;
    }
    return best;
}
