/**
 * Standings + USL Championship tiebreakers.
 *
 * Official order (uslchampionship.com, Race to the Playoffs):
 *   1. Points
 *   2. Head-to-head points among tied clubs
 *   3. Head-to-head goal difference among tied clubs
 *   4. Points per game vs in-conference opponents
 *   5. Total wins
 *   6. Goal difference
 *   7. Goals scored
 * Head-to-head steps only apply when the tied clubs have met; a group that is
 * partially split restarts from step 2 for the remaining tied subgroup.
 */

export function emptyRow(team) {
    return {
        id: team.id, name: team.name, short: team.short, abbr: team.abbr, conf: team.conf, logo: team.logo,
        gp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, confGp: 0, confPts: 0, remaining: 0,
    };
}

/** Build rows for every team from played games; `remaining` counts unplayed games. */
export function buildTable(teams, games) {
    const rows = new Map(teams.map((t) => [t.id, emptyRow(t)]));
    for (const g of games) {
        const h = rows.get(g.homeId), a = rows.get(g.awayId);
        if (!h || !a) continue;
        if (!g.played) { h.remaining++; a.remaining++; continue; }
        applyResult(h, a, g.homeGoals, g.awayGoals);
    }
    return rows;
}

export function applyResult(h, a, hg, ag) {
    const sameConf = h.conf === a.conf;
    h.gp++; a.gp++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
    h.gd = h.gf - h.ga; a.gd = a.gf - a.ga;
    let hp = 1, ap = 1;
    if (hg > ag) { h.w++; a.l++; hp = 3; ap = 0; }
    else if (ag > hg) { a.w++; h.l++; hp = 0; ap = 3; }
    else { h.d++; a.d++; }
    h.pts += hp; a.pts += ap;
    if (sameConf) { h.confGp++; a.confGp++; h.confPts += hp; a.confPts += ap; }
}

/** Head-to-head record of `id` against the set of `group` ids, from played games. */
function h2h(id, groupIds, games) {
    let pts = 0, gd = 0, met = 0;
    for (const g of games) {
        if (!g.played) continue;
        let mine, theirs;
        if (g.homeId === id && groupIds.has(g.awayId)) { mine = g.homeGoals; theirs = g.awayGoals; }
        else if (g.awayId === id && groupIds.has(g.homeId)) { mine = g.awayGoals; theirs = g.homeGoals; }
        else continue;
        met++;
        gd += mine - theirs;
        pts += mine > theirs ? 3 : mine === theirs ? 1 : 0;
    }
    return { pts, gd, met };
}

const confPPG = (r) => (r.confGp ? r.confPts / r.confGp : 0);

/** Order a group of rows tied on points. Returns rows best-first. */
function resolveTie(group, games, depth = 0) {
    if (group.length <= 1) return group;
    const ids = new Set(group.map((r) => r.id));
    const keys = [
        (r) => h2h(r.id, new Set([...ids].filter((x) => x !== r.id)), games).pts,
        (r) => h2h(r.id, new Set([...ids].filter((x) => x !== r.id)), games).gd,
        confPPG,
        (r) => r.w,
        (r) => r.gd,
        (r) => r.gf,
    ];
    for (let k = 0; k < keys.length; k++) {
        const scored = group.map((r) => ({ r, v: keys[k](r) }));
        const distinct = new Set(scored.map((s) => s.v));
        if (distinct.size === 1) continue;
        scored.sort((a, b) => b.v - a.v);
        const out = [];
        let i = 0;
        while (i < scored.length) {
            let j = i;
            while (j < scored.length && scored[j].v === scored[i].v) j++;
            const sub = scored.slice(i, j).map((s) => s.r);
            // A subgroup that split off restarts at head-to-head (depth guard for safety)
            out.push(...(sub.length > 1 && depth < 6 ? resolveTie(sub, games, depth + 1) : sub));
            i = j;
        }
        return out;
    }
    return [...group].sort((a, b) => a.name.localeCompare(b.name));
}

/** Rank the rows of one conference, applying USL tiebreakers. */
export function rankConference(rows, games, conf) {
    const list = [...rows.values()].filter((r) => r.conf === conf).sort((a, b) => b.pts - a.pts);
    const out = [];
    let i = 0;
    while (i < list.length) {
        let j = i;
        while (j < list.length && list[j].pts === list[i].pts) j++;
        out.push(...resolveTie(list.slice(i, j), games));
        i = j;
    }
    return out.map((r, idx) => ({ ...r, rank: idx + 1 }));
}
