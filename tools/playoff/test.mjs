import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTable, rankConference } from './standings.mjs';
import { clinchNumber, headToHead, winsDecidedTie } from './magic.mjs';
import { parseGames } from './espn.mjs';
import { simulate, poisson, mulberry32 } from './simulate.mjs';
import { describe as describeCards } from './render.mjs';

const T = (id, conf = 'East') => ({ id, name: `Team ${id}`, short: id, abbr: id, conf });
let gid = 0;
const G = (homeId, awayId, hg = null, ag = null) => ({ id: String(++gid), date: '2026-09-01', homeId, awayId, homeGoals: hg, awayGoals: ag, played: hg != null });

test('table: points, GD, remaining', () => {
    const teams = [T('A'), T('B'), T('C')];
    const games = [G('A', 'B', 2, 0), G('B', 'C', 1, 1), G('A', 'C')];
    const rows = buildTable(teams, games);
    assert.equal(rows.get('A').pts, 3); assert.equal(rows.get('A').gd, 2); assert.equal(rows.get('A').remaining, 1);
    assert.equal(rows.get('B').pts, 1); assert.equal(rows.get('C').pts, 1); assert.equal(rows.get('C').remaining, 1);
});

test('tiebreak: head-to-head beats goal difference', () => {
    const teams = [T('A'), T('B'), T('X')];
    // A and B both 3 pts. B has the better GD (+4 vs +1) but A won the meeting.
    const games = [G('A', 'B', 1, 0), G('B', 'X', 5, 0)];
    const ranked = rankConference(buildTable(teams, games), games, 'East');
    assert.deepEqual(ranked.slice(0, 2).map((r) => r.id), ['A', 'B']);
});

test('tiebreak: falls to wins then GD when teams have not met', () => {
    const teams = [T('A'), T('B'), T('X'), T('Y')];
    // Y runs away with it. A: 1W 2L (3 pts). B: 3D (3 pts). A never played B, so wins decide.
    const games = [G('A', 'X', 1, 0), G('Y', 'A', 1, 0), G('Y', 'A', 1, 0), G('B', 'X', 0, 0), G('B', 'Y', 1, 1), G('X', 'B', 2, 2)];
    const ranked = rankConference(buildTable(teams, games), games, 'East');
    assert.equal(ranked[0].id, 'Y');
    assert.equal(ranked[1].id, 'A'); // more wins than B
});

test('head-to-head bookkeeping', () => {
    const games = [G('A', 'B', 2, 1), G('B', 'A')];
    const h = headToHead('A', 'B', games);
    assert.deepEqual(h, { aPts: 3, bPts: 0, aGd: 1, played: 1, scheduled: 2 });
    assert.equal(winsDecidedTie('A', 'B', games), false); // series not finished
    games[1] = G('B', 'A', 0, 0);
    assert.equal(winsDecidedTie('A', 'B', games), true);
});

test('magic number: guarantee counts rivals who can still reach the total', () => {
    // 4 teams, top 2 qualify. A 10 pts 1 left; B 9 pts 1 left; C 5 pts 1 left; D 0 pts 0 left.
    const teams = [T('A'), T('B'), T('C'), T('D')];
    const games = [
        G('A', 'D', 3, 0), G('A', 'D', 3, 0), G('A', 'D', 3, 0), G('A', 'C', 1, 0), // A 12? keep simple below
    ];
    // Build explicit rows instead: simulate with results that produce the intended table.
    const g2 = [G('A', 'D', 1, 0), G('A', 'D', 1, 0), G('A', 'D', 1, 0), G('A', 'C', 1, 1), // A=10
        G('B', 'D', 1, 0), G('B', 'D', 1, 0), G('B', 'D', 1, 0), // B=9
        G('C', 'D', 1, 0), G('C', 'B', 1, 0), // C=3+1=... C beat D (3) + drew A (1) + beat B (3) = 7
        G('A', 'B'), G('C', 'D')]; // one left each for A, B, C, D
    const ranked = rankConference(buildTable(teams, g2), g2, 'East');
    const m = clinchNumber({ teamId: 'A', ranked, games: g2, k: 2 });
    // Rivals' ceilings: B 12, C 10, D 3. A at 10: threats B(12), C(10 tie, undecided)=2 > k-1. At 11: only B -> clinch.
    assert.equal(m.clinchPts, 11); assert.equal(m.magic, 1); assert.equal(m.inOwnHands, true); assert.equal(m.eliminated, false);
    const m1 = clinchNumber({ teamId: 'A', ranked, games: g2, k: 1 });
    assert.equal(m1.inOwnHands, true); assert.equal(m1.clinchPts, 13); // needs 13 to beat B's 12
    const d = clinchNumber({ teamId: 'D', ranked, games: g2, k: 2 });
    assert.equal(d.eliminated, true);
});

test('parseGames keeps only USL Championship regular season', () => {
    const ev = (id, slug, state, hs, as) => ({
        id, date: '2026-09-05T23:00Z', league: { slug }, seasonType: { name: 'Regular Season' },
        competitions: [{ status: { type: { state, completed: state === 'post' } }, competitors: [
            { homeAway: 'home', team: { id: 'H', displayName: 'Home', shortDisplayName: 'Home' }, score: { value: hs } },
            { homeAway: 'away', team: { id: 'A', displayName: 'Away', shortDisplayName: 'Away' }, score: { value: as } },
        ] }],
    });
    const { games } = parseGames({ events: [ev('1', 'usa.usl.1', 'post', 2, 1), ev('2', 'usa.open', 'post', 0, 0), ev('3', 'usa.usl.1', 'pre')] });
    assert.equal(games.length, 2);
    assert.equal(games[0].homeGoals, 2); assert.equal(games[1].played, false);
});

test('simulation is deterministic and probabilities sum sensibly', () => {
    const teams = [T('A'), T('B'), T('C'), T('D'), T('W', 'West')];
    const games = [G('A', 'B', 2, 0), G('C', 'D', 1, 1), G('A', 'C', 3, 1), G('B', 'D', 0, 2), G('W', 'A', 1, 1),
        G('A', 'D'), G('B', 'C'), G('W', 'B')];
    const s1 = simulate({ teams, games, focusId: 'A', sims: 500, seed: 7 });
    const s2 = simulate({ teams, games, focusId: 'A', sims: 500, seed: 7 });
    assert.deepEqual(s1.teams, s2.teams);
    for (const t of s1.teams) assert.ok(Math.abs(t.finish.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.equal(s1.gamesSimulated, 3);
    const r = mulberry32(1); const xs = Array.from({ length: 2000 }, () => poisson(1.5, r));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(mean > 1.3 && mean < 1.7, `poisson mean ${mean}`);
});

// --- card copy ---------------------------------------------------------------
const card = (playoff, home, p8 = 0.9, p4 = 0.3) => describeCards({
    team: { id: 'R', short: 'RIFC' }, playoff, home, sim: { focus: { pTop8: p8, pTop4: p4 } },
});
const st = { k: 8, currentPts: 29, remaining: 9, maxPts: 56, clinchPts: 46, magic: 17,
    clinched: false, inOwnHands: true, eliminated: false, lockedAbove: [], threats: [] };
const rival = (short, ceiling) => ({ short, ceiling, pts: 30, remaining: 9, tieEdge: 'open',
    h2h: { lead: 'them', played: 2, scheduled: 2 } });

test('cards: both numbers are points from the remaining games', () => {
    const [a, b] = card({ ...st }, { ...st, k: 4, inOwnHands: false, clinchPts: null, magic: null,
        threats: [rival('A', 69), rival('B', 61), rival('C', 60), rival('D', 56)] });
    assert.equal(a.big, '17');                       // points still needed
    assert.equal(b.big, String(56 + 1 - 29));        // rival ceiling + 1, as a delta, not a season total
    assert.match(b.body, /worth <b>27 points<\/b>, 1 short of 28/);
});

test('cards: an eliminated card never claims it can still happen', () => {
    const [, b] = card({ ...st }, { ...st, k: 4, inOwnHands: false, eliminated: true, clinchPts: null,
        magic: null, remaining: 2, maxPts: 35, lockedAbove: ['A', 'B', 'C', 'D'],
        threats: [rival('A', 60), rival('B', 55), rival('C', 50), rival('D', 44)] }, 1, 0);
    assert.equal(b.tone, 'bad');
    assert.equal(b.stamp, 'Eliminated');
    assert.doesNotMatch(b.body, /can still happen/);
    assert.match(b.body, /off the table/);
});

test('cards: needing help is gold, not red', () => {
    const [, b] = card({ ...st }, { ...st, k: 4, inOwnHands: false, clinchPts: null, magic: null,
        threats: [rival('A', 69), rival('B', 61), rival('C', 60), rival('D', 56)] });
    assert.equal(b.tone, 'warn');
    assert.equal(b.stamp, 'Needs help');
});

test('cards: clinched shows a tick and no strike', () => {
    const [a, b] = card({ ...st, clinched: true }, { ...st, k: 4, clinched: true }, 1, 1);
    for (const c of [a, b]) { assert.equal(c.big, '\u2713'); assert.ok(!c.strike); assert.equal(c.tone, 'good'); }
});

test('cards: no unresolved template placeholders in any state', () => {
    const states = [
        [{ ...st }, { ...st, k: 4 }],
        [{ ...st, clinched: true }, { ...st, k: 4, clinched: true }],
        [{ ...st, inOwnHands: false, eliminated: true, clinchPts: null, magic: null, lockedAbove: ['A'] },
         { ...st, k: 4, inOwnHands: false, eliminated: true, clinchPts: null, magic: null, lockedAbove: ['A'],
          threats: [rival('A', 60), rival('B', 55), rival('C', 50), rival('D', 44)] }],
        [{ ...st }, { ...st, k: 4, inOwnHands: false, clinchPts: null, magic: null,
          threats: [rival('A', 69), rival('B', 61), rival('C', 60),
              { short: 'D', ceiling: 56, pts: 30, remaining: 9, tieEdge: 'us', h2h: { lead: 'us', played: 2, scheduled: 2 } }] }],
    ];
    for (const [p, h] of states) for (const c of card(p, h)) {
        assert.doesNotMatch(c.headline + c.body, /\$\{/, `placeholder leaked: ${c.label}`);
        assert.ok(c.big && c.headline && c.body);
    }
});
