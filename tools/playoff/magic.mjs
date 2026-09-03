/**
 * Deterministic "magic numbers": points that GUARANTEE a finish, no matter
 * what anyone else does.
 *
 * A club can still finish at or above a points total P if its ceiling
 * (current points + 3 * games left) exceeds P, or equals P and it would win a
 * tie. Ties are assumed LOST unless both head-to-head meetings have been
 * played and we hold the edge (the first tiebreakers are head-to-head points
 * then head-to-head goal difference).
 *
 * This ignores that rivals still play each other (they cannot all win), so the
 * number is a safe upper bound: reaching it is always enough, but a smaller
 * total may turn out to be enough in practice. The simulation covers that.
 */

/** Head-to-head between two ids across the season: {aPts, bPts, aGd, played, scheduled}. */
export function headToHead(aId, bId, games) {
    const r = { aPts: 0, bPts: 0, aGd: 0, played: 0, scheduled: 0 };
    for (const g of games) {
        const ab = g.homeId === aId && g.awayId === bId;
        const ba = g.homeId === bId && g.awayId === aId;
        if (!ab && !ba) continue;
        r.scheduled++;
        if (!g.played) continue;
        r.played++;
        const ag = ab ? g.homeGoals : g.awayGoals;
        const bg = ab ? g.awayGoals : g.homeGoals;
        r.aGd += ag - bg;
        if (ag > bg) r.aPts += 3; else if (bg > ag) r.bPts += 3; else { r.aPts++; r.bPts++; }
    }
    return r;
}

/** True only if the season series is complete and `aId` holds the tiebreak edge. */
export function winsDecidedTie(aId, bId, games) {
    const h = headToHead(aId, bId, games);
    if (h.played < h.scheduled || h.played === 0) return false;
    if (h.aPts !== h.bPts) return h.aPts > h.bPts;
    return h.aGd > 0;
}

/**
 * Compute clinch / elimination facts for `teamId` finishing in the top `k` of
 * its conference.
 */
export function clinchNumber({ teamId, ranked, games, k }) {
    const me = ranked.find((r) => r.id === teamId);
    const others = ranked.filter((r) => r.id !== teamId);
    const myMax = me.pts + 3 * me.remaining;

    const canReach = (r, P) => {
        const ceiling = r.pts + 3 * r.remaining;
        if (ceiling > P) return true;
        if (ceiling < P) return false;
        return !winsDecidedTie(teamId, r.id, games);
    };
    const threatsAt = (P) => others.filter((r) => canReach(r, P));

    // Smallest total P (within our reach) at which at most k-1 rivals can still reach P.
    let clinchPts = null;
    for (let P = me.pts; P <= myMax; P++) {
        if (threatsAt(P).length <= k - 1) { clinchPts = P; break; }
    }
    // Rivals already guaranteed to finish above us even if we win out.
    const lockedAbove = others.filter((r) => r.pts > myMax || (r.pts === myMax && !winsDecidedTie(teamId, r.id, games)));
    const eliminated = lockedAbove.length >= k;

    // The rivals that make the number what it is: the k-th ... strongest ceilings.
    const threats = threatsAt(clinchPts != null ? clinchPts - 1 : myMax)
        .map((r) => {
            const h = headToHead(teamId, r.id, games);
            const lead = h.aPts !== h.bPts ? (h.aPts > h.bPts ? 'us' : 'them') : h.aGd !== 0 ? (h.aGd > 0 ? 'us' : 'them') : 'level';
            return { id: r.id, name: r.name, short: r.short, pts: r.pts, remaining: r.remaining, ceiling: r.pts + 3 * r.remaining,
                tieEdge: winsDecidedTie(teamId, r.id, games) ? 'us' : winsDecidedTie(r.id, teamId, games) ? 'them' : 'open',
                h2h: { lead, played: h.played, scheduled: h.scheduled } };
        })
        .sort((a, b) => b.ceiling - a.ceiling);

    return {
        k,
        currentPts: me.pts,
        remaining: me.remaining,
        maxPts: myMax,
        clinchPts,                                   // total needed to guarantee; null if impossible to guarantee
        magic: clinchPts == null ? null : clinchPts - me.pts, // points still needed
        clinched: clinchPts != null && clinchPts === me.pts,
        inOwnHands: clinchPts != null,
        eliminated,
        lockedAbove: lockedAbove.map((r) => r.short),
        threats,
    };
}
