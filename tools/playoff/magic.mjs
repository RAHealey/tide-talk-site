/**
 * Deterministic "magic numbers": points that GUARANTEE a finish, no matter
 * what anyone else does.
 *
 * A club can still finish at or above a points total P if its ceiling
 * (current points + 3 * games left) exceeds P, or equals P and it would win a
 * tie. Ties are assumed LOST unless the first tiebreaker (wins vs conference
 * opponents) is already settled: our current in-conference wins exceed the
 * most the rival can still reach. Later tiebreakers (conference GD, goals,
 * head-to-head) depend on scorelines, so they never count as settled.
 *
 * This ignores that rivals still play each other (they cannot all win), so the
 * number is a safe upper bound: reaching it is always enough, but a smaller
 * total may turn out to be enough in practice. The simulation covers that.
 */

const maxConfW = (r) => r.confW + r.confRemaining;

/** True only if `a` is certain to win a points tie with `b` on in-conference wins. */
export function winsDecidedTie(a, b) {
    return a.confW > maxConfW(b);
}

/**
 * Compute clinch / elimination facts for `teamId` finishing in the top `k` of
 * its conference.
 */
export function clinchNumber({ teamId, ranked, k }) {
    const me = ranked.find((r) => r.id === teamId);
    const others = ranked.filter((r) => r.id !== teamId);
    const myMax = me.pts + 3 * me.remaining;

    const canReach = (r, P) => {
        const ceiling = r.pts + 3 * r.remaining;
        if (ceiling > P) return true;
        if (ceiling < P) return false;
        return !winsDecidedTie(me, r);
    };
    const threatsAt = (P) => others.filter((r) => canReach(r, P));

    // Smallest total P (within our reach) at which at most k-1 rivals can still reach P.
    let clinchPts = null;
    for (let P = me.pts; P <= myMax; P++) {
        if (threatsAt(P).length <= k - 1) { clinchPts = P; break; }
    }
    // Rivals already guaranteed to finish above us even if we win out.
    const lockedAbove = others.filter((r) => r.pts > myMax || (r.pts === myMax && winsDecidedTie(r, me)));
    const eliminated = lockedAbove.length >= k;

    // The rivals that make the number what it is: the k-th ... strongest ceilings.
    const threats = threatsAt(clinchPts != null ? clinchPts - 1 : myMax)
        .map((r) => ({ id: r.id, name: r.name, short: r.short, pts: r.pts, remaining: r.remaining, ceiling: r.pts + 3 * r.remaining,
            tieEdge: winsDecidedTie(me, r) ? 'us' : winsDecidedTie(r, me) ? 'them' : 'open',
            confWins: { us: me.confW, them: r.confW, lead: me.confW > r.confW ? 'us' : me.confW < r.confW ? 'them' : 'level' } }))
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
