/**
 * Renders the tracker as a self-contained HTML fragment (Tide Talk brand),
 * plus a plain-text summary for the console.
 */
const BRAND = { navy: '#0d223f', ink: '#08172b', bright: '#5fb2e2', gold: '#fbad18', green: '#2fd08a', red: '#ff5a4f', paper: '#f4f1ea' };

const pct = (x) => `${Math.round(x * 100)}%`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const winsPhrase = (pts) => {
    if (pts <= 0) return 'nothing more';
    const w = Math.floor(pts / 3), d = pts % 3;
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const n = (x) => words[x] ?? String(x);
    const wins = w ? `${n(w)} win${w === 1 ? '' : 's'}` : '';
    const draws = d ? `${n(d)} draw${d === 1 ? '' : 's'}` : '';
    return `roughly ${[wins, draws].filter(Boolean).join(' and ')}`;
};

function numberCard({ label, tone, big, strike, headline, body }) {
    const color = { good: BRAND.green, bad: BRAND.red, warn: BRAND.gold }[tone];
    return `<div class="pt-card">
  <div class="pt-tag" style="color:${color}">${esc(label)}</div>
  <div class="pt-big ${strike ? 'pt-strike' : ''}" style="color:${color}">${esc(big)}</div>
  <h3>${headline}</h3>
  <p>${body}</p>
</div>`;
}

export function describe({ team, playoff, home, sim, ranked, fixtures }) {
    const short = team.short;
    const p8 = sim.focus.pTop8, p4 = sim.focus.pTop4;
    const cards = [];

    // Card 1: playoff spot (top 8)
    if (playoff.clinched) {
        cards.push({ label: 'Clinched', tone: 'good', big: '✓', headline: `${short} have clinched a playoff spot.`, body: `Guaranteed top eight in the East with ${playoff.remaining} to play.` });
    } else if (playoff.eliminated) {
        cards.push({ label: 'Eliminated', tone: 'bad', big: String(playoff.maxPts), strike: true, stamp: 'Eliminated', headline: 'Points is the most Rhode Island can reach, and it is not enough.', body: `Even a perfect finish (${playoff.maxPts} points) leaves ${playoff.lockedAbove.length} clubs locked above ${short}.` });
    } else if (playoff.inOwnHands) {
        cards.push({ label: 'Still achievable', tone: 'good', big: String(playoff.magic),
            headline: `Points from ${playoff.remaining} matches secures a playoff spot.`,
            body: `That's <b>${winsPhrase(playoff.magic)}</b>, or any combination of results adding up to ${playoff.magic} points, out of the ${playoff.remaining} games left. No help required from anyone else.` });
    } else {
        cards.push({ label: 'Not in their hands', tone: 'warn', big: String(playoff.maxPts), strike: true, stamp: 'Needs help', headline: 'Even a perfect finish cannot guarantee the top eight.', body: `${short} can reach ${playoff.maxPts} points at most; too many rivals can match it. The playoffs are ${pct(p8)} likely on current form.` });
    }

    // Card 2: home playoff game (top 4)
    if (home.clinched) {
        cards.push({ label: 'Clinched', tone: 'good', big: '✓', headline: `${short} have clinched a home playoff game.`, body: 'Guaranteed top four in the East.' });
    } else if (home.inOwnHands) {
        cards.push({ label: 'Still achievable', tone: 'good', big: String(home.magic),
            headline: `Points from ${home.remaining} matches clinches a home playoff game.`,
            body: `That's <b>${winsPhrase(home.magic)}</b> from the last ${home.remaining}. On current form it's ${pct(p4)} likely.` });
    } else {
        // The k-th strongest rival ceiling sets the bar; we would need to beat it outright.
        const rival = home.threats[home.k - 1];
        const needed = rival ? rival.ceiling + 1 : home.maxPts + 1;
        const shortBy = needed - home.maxPts;
        let h2hNote = '';
        if (rival) {
            const { lead, played, scheduled } = rival.h2h;
            const done = played >= scheduled;
            if (lead === 'them') h2hNote = done ? ' and <b>owns the head-to-head tiebreaker</b>' : ` and <b>currently leads the head-to-head</b> (${scheduled - played} meeting${scheduled - played === 1 ? '' : 's'} still to play)`;
            else if (lead === 'us') h2hNote = done ? ', though ${short} own the head-to-head' : `, though ${short} currently lead the head-to-head`;
        }
        cards.push({ label: home.eliminated ? 'Out of reach' : 'Out of reach on their own', tone: home.eliminated ? 'bad' : 'warn', big: String(needed), strike: true,
            stamp: home.eliminated ? 'Eliminated' : 'Needs help',
            headline: home.eliminated ? 'Points would have clinched a home playoff game — it can no longer happen.' : 'Points would <em>guarantee</em> a home playoff game — but the math doesn\'t work.',
            body: `A perfect ${home.remaining}-0 run only produces <b>${home.maxPts} points</b>, ${shortBy} short of ${needed}. ${rival ? `${esc(rival.short)} can match ${short}'s ceiling exactly${h2hNote}` : ''} — so even a flawless finish isn't enough on its own. It can still happen with help: simulations give a home playoff game a <b>${pct(p4)}</b> chance.` });
    }
    return cards;
}

export function renderHtml(data) {
    const { team, playoff, home, sim, ranked, fixtures, asOf, confidence } = data;
    const cards = describe(data);
    const me = ranked.find((r) => r.id === team.id);
    const simRow = (id) => sim.teams.find((t) => t.id === id);

    const TITLES = ['Playoff spot', 'Home playoff game'];
    const card = ({ label, tone, big, strike, stamp, headline, body }, i) => `<div class="pt-num pt-num--${tone}">
  <div class="pt-title"><span>${TITLES[i]}</span><small>${i === 0 ? 'Top 8 in the East' : 'Top 4 in the East'}</small></div>
  <div class="pt-kick">${esc(label)}</div>
  <div class="pt-big${strike ? ' is-struck' : ''}"><span>${esc(big)}</span>${strike ? `<i class="pt-stamp">${esc(stamp || 'Not enough')}</i>` : ''}</div>
  <h3 class="pt-h3">${headline}</h3>
  <p class="pt-body">${body}</p>
</div>`;

    const tableRows = ranked.map((r) => {
        const s = simRow(r.id);
        const cls = [r.id === team.id ? 'is-me' : '', r.rank === 4 ? 'is-homeline' : '', r.rank === 8 ? 'is-cutline' : ''].join(' ');
        return `<tr class="${cls}"><td class="n">${r.rank}</td><td class="club">${esc(r.short)}</td><td>${r.gp}</td><td>${r.w}-${r.l}-${r.d}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td><td class="dim">${r.pts + 3 * r.remaining}</td><td>${pct(s.pTop8)}</td><td>${pct(s.pTop4)}</td></tr>`;
    }).join('\n');

    const ladder = sim.focus.byPts.filter((b) => b.share >= 0.005).map((b) =>
        `<tr${b.pts === playoff.clinchPts ? ' class="is-magic"' : ''}><td class="pts">${b.pts}</td><td class="dim">${pct(b.share)}</td><td><i class="pt-bar" style="width:${Math.round(b.pTop8 * 100)}%"></i>${pct(b.pTop8)}</td><td><i class="pt-bar pt-bar--gold" style="width:${Math.round(b.pTop4 * 100)}%"></i>${pct(b.pTop4)}</td></tr>`).join('\n');

    const fixRows = fixtures.map((f) => `<li><span class="d">${f.date}</span><span class="v">${f.home ? 'vs' : 'at'}</span><b>${esc(f.opp)}</b>${f.home ? '<span class="h">Home</span>' : ''}</li>`).join('\n');

    const banner = (t) => `<div class="pt-banner"><div class="pt-flag"><span>${t}</span></div><div class="pt-rule"></div></div>`;

    return `<style>
.pt{--paper:#e7e0cf;--paper2:#efe9db;--ink:#0d223f;--ink2:#0a1a30;--tide:#2f8fce;--tide-bright:#5fb2e2;--tide-deep:#1f6fa8;--gold:#e79a06;--gold-bright:#fbad18;--muted:#6a6350;--line:#c7bfa9;--red:#e01b1b;
  --sans:'Libre Franklin','Helvetica Neue',Arial,sans-serif;--serif:'EB Garamond',Georgia,serif;--ease-out:cubic-bezier(0.23,1,0.32,1);
  font-family:var(--serif);color:var(--ink);line-height:1.5;font-size:18px}
.pt *{box-sizing:border-box}
.pt h1,.pt h2,.pt h3,.pt p,.pt ul{margin:0;padding:0}
.pt h2::before{content:none}
.pt-stencil{font-family:var(--sans);font-weight:900;text-transform:uppercase;letter-spacing:-.01em}
/* poster hero */
.pt-poster{position:relative;background:var(--ink);color:var(--paper);border-radius:6px;overflow:hidden;clip-path:polygon(0 0,100% 0,100% calc(100% - 22px),calc(100% - 30px) 100%,0 100%);margin-bottom:26px}
.pt-poster .tex{position:absolute;inset:0;opacity:.5;background:radial-gradient(120% 90% at 82% 8%,rgba(95,178,226,.4),transparent 55%),radial-gradient(70% 70% at 10% 100%,rgba(251,173,24,.3),transparent 60%)}
.pt-poster .ht{position:absolute;inset:0;opacity:.4;mix-blend-mode:screen;background:radial-gradient(circle,rgba(95,178,226,.5) 1.2px,transparent 1.5px);background-size:10px 10px}
.pt-poster .in{position:relative;padding:40px 40px 46px}
.pt-poster .kick{display:inline-block;font-family:var(--sans);font-weight:900;font-size:13px;letter-spacing:.1em;text-transform:uppercase;background:var(--gold-bright);color:var(--ink);padding:7px 14px;margin-bottom:22px;transform:rotate(-2deg)}
.pt-poster h1{font-family:var(--sans);font-weight:900;font-size:clamp(40px,7vw,84px);line-height:.85;letter-spacing:-.035em;text-transform:uppercase;text-wrap:balance;max-width:14ch}
.pt-poster .deck{font-family:var(--serif);font-style:italic;font-size:21px;color:#d6dfea;max-width:46ch;line-height:1.35;margin-top:22px}
.pt-poster .deck b{color:var(--gold-bright);font-weight:600}
/* the two numbers */
.pt-nums{display:grid;grid-template-columns:1fr 1fr;border:3px solid var(--ink);border-radius:6px;background:var(--paper2);box-shadow:7px 7px 0 rgba(10,26,48,.15);overflow:hidden;margin-bottom:46px}
.pt-num{padding:28px 30px 30px;border-right:3px solid var(--ink);position:relative}
.pt-num:last-child{border-right:0}
.pt-title{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:3px solid var(--ink);padding-bottom:10px;margin-bottom:16px}
.pt-title span{font-family:var(--sans);font-weight:900;font-size:17px;letter-spacing:-.01em;text-transform:uppercase;line-height:1.05}
.pt-title small{font-family:var(--sans);font-weight:700;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.pt-kick{font-family:var(--sans);font-weight:900;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--tide);margin-bottom:8px}
.pt-num--bad .pt-kick{color:var(--red)}.pt-num--warn .pt-kick{color:var(--gold)}
.pt-num--warn .pt-big.is-struck::after,.pt-num--warn .pt-stamp{background:var(--gold-bright)}
.pt-num--warn .pt-stamp{color:var(--ink);border-color:var(--ink);background:var(--gold-bright)}
.pt-big{font-family:var(--sans);font-weight:900;font-size:clamp(96px,16vw,168px);line-height:.85;letter-spacing:-.05em;color:var(--ink);position:relative;display:inline-block;margin:6px 0 16px}
.pt-num--good .pt-big{color:var(--tide-deep)}
.pt-big.is-struck span{color:var(--muted);opacity:.55}
.pt-big.is-struck::after{content:"";position:absolute;left:-4%;right:-8%;top:52%;height:10px;background:var(--red);transform:rotate(-7deg);border-radius:2px;clip-path:inset(0 0 0 0);animation:pt-strike 420ms var(--ease-out) 520ms both}
.pt-stamp{position:absolute;right:-34px;top:-10px;font-family:var(--sans);font-style:normal;font-weight:900;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--red);border:3px solid var(--red);border-radius:4px;padding:4px 9px;transform:rotate(9deg);background:var(--paper2)}
.pt-h3{font-family:var(--sans);font-weight:900;font-size:22px;line-height:1.05;letter-spacing:-.015em;text-transform:uppercase;margin-bottom:12px;text-wrap:balance}
.pt-h3 em{font-style:normal;color:var(--tide-deep)}
.pt-body{font-family:var(--serif);font-size:18px;line-height:1.5;color:#2b3648;max-width:44ch}
.pt-body b{color:var(--ink)}
/* section banners */
.pt-banner{display:flex;align-items:center;gap:16px;margin:0 0 20px}
.pt-flag{height:34px;padding:0 14px;display:flex;align-items:center;background:var(--gold-bright);font-family:var(--sans);font-weight:900;color:var(--ink);font-size:13px;letter-spacing:.1em;text-transform:uppercase;transform:skewX(-8deg);white-space:nowrap}
.pt-flag span{transform:skewX(8deg)}
.pt-rule{flex:1;height:6px;border-top:3px solid var(--ink);border-bottom:3px solid var(--ink)}
.pt-sec{margin-bottom:46px}
.pt-sub{font-family:var(--serif);font-style:italic;font-size:18px;color:var(--muted);margin-bottom:18px;max-width:60ch}
/* odds tiles */
.pt-odds{display:grid;grid-template-columns:repeat(4,1fr);border:3px solid var(--ink);border-radius:6px;overflow:hidden;background:var(--paper2)}
.pt-odd{padding:20px 22px;border-right:3px solid var(--ink)}
.pt-odd:last-child{border-right:0}
.pt-odd b{display:block;font-family:var(--sans);font-weight:900;font-size:52px;line-height:.9;letter-spacing:-.04em;color:var(--tide-deep);margin-bottom:8px}
.pt-odd.gold b{color:var(--gold)}
.pt-odd span{font-family:var(--sans);font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);line-height:1.3;display:block}
/* tables */
.pt-scroll{overflow-x:auto;border:3px solid var(--ink);border-radius:6px;background:var(--paper2)}
.pt table{width:100%;border-collapse:collapse;font-family:var(--sans);font-size:14.5px}
.pt th,.pt td{padding:9px 12px;text-align:left;border-bottom:2px solid var(--line);white-space:nowrap}
.pt th{font-weight:900;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--tide);background:var(--paper);border-bottom:3px solid var(--ink)}
.pt tr:last-child td{border-bottom:0}
.pt td.pts{font-weight:900;font-size:16px}
.pt td.n{font-weight:900;color:var(--muted);width:2.5em}
.pt td.club{font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.pt td.dim{color:var(--muted)}
.pt tr.is-me td{background:rgba(251,173,24,.22);box-shadow:inset 0 0 0 0 transparent}
.pt tr.is-me td.n{color:var(--ink);box-shadow:inset 6px 0 0 var(--gold-bright)}
.pt tr.is-homeline td{border-bottom:3px dashed var(--tide)}
.pt tr.is-cutline td{border-bottom:3px dashed var(--red)}
.pt tr.is-magic td{background:rgba(47,143,206,.16)}
.pt-bar{display:inline-block;height:9px;background:var(--tide);margin-right:8px;vertical-align:middle;border-radius:2px;max-width:56%;border:1px solid var(--ink)}
.pt-bar--gold{background:var(--gold-bright)}
.pt-legend{display:flex;gap:22px;flex-wrap:wrap;font-family:var(--sans);font-weight:700;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-top:10px}
.pt-legend i{display:inline-block;width:22px;border-top:3px dashed var(--tide);vertical-align:middle;margin-right:6px}
.pt-legend i.red{border-color:var(--red)}
/* fixtures */
.pt ul.pt-fix{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:0 34px;border:3px solid var(--ink);border-radius:6px;background:var(--paper2);padding:12px 26px}
.pt-fix li{display:flex;align-items:baseline;gap:10px;padding:9px 0;border-bottom:2px solid var(--line);font-family:var(--sans);font-size:15px}
.pt-fix li:nth-last-child(-n+2){border-bottom:0}
.pt-fix .d{font-weight:900;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--tide);width:54px;flex:none}
.pt-fix .v{color:var(--muted);font-size:13px}
.pt-fix b{font-weight:800;text-transform:uppercase;letter-spacing:.02em}
.pt-fix .h{margin-left:auto;font-weight:900;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;background:var(--gold-bright);padding:2px 6px;border-radius:3px}
.pt-foot{font-family:var(--serif);font-style:italic;font-size:15px;color:var(--muted);border-top:3px solid var(--ink);padding-top:14px}
/* one-time load reveal: rise + fade, 60ms stagger; the strike draws in after the number lands */
.pt-poster,.pt-num,.pt-odd{animation:pt-rise 320ms var(--ease-out) both}
.pt-num:nth-child(2){animation-delay:60ms}
.pt-odd:nth-child(2){animation-delay:60ms}.pt-odd:nth-child(3){animation-delay:120ms}.pt-odd:nth-child(4){animation-delay:180ms}
.pt-stamp{animation:pt-stamp 200ms var(--ease-out) 900ms both}
@keyframes pt-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes pt-strike{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes pt-stamp{from{opacity:0;transform:rotate(9deg) scale(1.15)}to{opacity:1;transform:rotate(9deg) scale(1)}}
@media(prefers-reduced-motion:reduce){
  .pt-poster,.pt-num,.pt-odd,.pt-stamp{animation:pt-fade 200ms ease both}
  .pt-big.is-struck::after{animation:pt-fade 200ms ease 300ms both}
  @keyframes pt-fade{from{opacity:0}to{opacity:1}}
}
@media(min-width:1000px){
  .pt-poster .in{padding:56px 60px 62px}
  .pt-poster h1{font-size:clamp(64px,7.5vw,104px)}
  .pt-poster .deck{font-size:24px}
  .pt-num{padding:36px 40px 40px}
  .pt-big{font-size:clamp(150px,15vw,200px)}
  .pt-twocol{display:grid;grid-template-columns:5fr 7fr;gap:0 34px;align-items:start}
  .pt-twocol .pt-sec{display:grid;grid-template-rows:subgrid;grid-row:span 4;align-content:start;margin-bottom:46px}
  .pt-twocol .pt-sub{align-self:end}
  @supports not (grid-template-rows:subgrid){.pt-twocol .pt-sub{min-height:3.2em}}
  .pt-fix{grid-template-columns:repeat(3,1fr)}
  .pt-fix li:nth-last-child(-n+3){border-bottom:0}
  .pt-odd b{font-size:64px}
}
@media(max-width:760px){
  .pt-nums{grid-template-columns:1fr}
  .pt-num{border-right:0;border-bottom:3px solid var(--ink)}
  .pt-num:last-child{border-bottom:0}
  .pt-poster .in{padding:28px 22px 34px}
  .pt-odds{grid-template-columns:1fr 1fr}
  .pt-odd:nth-child(2){border-right:0}
  .pt-odd:nth-child(-n+2){border-bottom:3px solid var(--ink)}
  .pt-fix{grid-template-columns:1fr}
  .pt-fix li:nth-last-child(2){border-bottom:2px solid var(--line)}
  .pt-big{font-size:clamp(88px,26vw,140px)}
}
</style>
<div class="pt">
<section class="pt-poster"><div class="tex"></div><div class="ht"></div><div class="in">
<span class="kick">Playoff tracker · ${esc(asOf.replace(/,.*$/, ''))}</span>
<h1>Two numbers decide Rhode Island's October</h1>
<p class="deck">Eastern Conference, <b>${me.remaining} matches left</b>. ${short(cards)}</p>
</div></section>

<section class="pt-nums">${cards.map(card).join('\n')}</section>

<section class="pt-sec">
${banner('How likely')}
<p class="pt-sub">${sim.sims.toLocaleString()} simulated finishes to the season, every remaining East fixture played out with the league's own tiebreakers.</p>
<div class="pt-odds">
<div class="pt-odd"><b>${pct(sim.focus.pTop8)}</b><span>Make the playoffs<br>(top 8)</span></div>
<div class="pt-odd gold"><b>${pct(sim.focus.pTop4)}</b><span>Host a playoff game<br>(top 4)</span></div>
<div class="pt-odd"><b>${sim.focus.avgPts.toFixed(1)}</b><span>Average final<br>points</span></div>
<div class="pt-odd"><b>${confidence.top8_90 ?? '—'}</b><span>Points for a 90%<br>playoff chance</span></div>
</div>
</section>

<div class="pt-twocol">
<section class="pt-sec">
${banner('What each total buys')}
<p class="pt-sub">Chance of a playoff spot and a home game, given where Rhode Island's points finish. ${playoff.clinchPts != null ? `The highlighted row is the guarantee line (${playoff.clinchPts}).` : ''}</p>
<div class="pt-scroll"><table><thead><tr><th>Final pts</th><th>How often</th><th>Playoffs</th><th>Home game</th></tr></thead><tbody>${ladder}</tbody></table></div>
</section>

<section class="pt-sec">
${banner('Eastern Conference')}
<p class="pt-sub">Max is the total if a club wins out. Odds come from the simulation.</p>
<div class="pt-scroll"><table><thead><tr><th>#</th><th>Club</th><th>GP</th><th>W-L-D</th><th>GD</th><th>Pts</th><th>Max</th><th>Playoffs</th><th>Top 4</th></tr></thead><tbody>${tableRows}</tbody></table></div>
<div class="pt-legend"><span><i></i>Home-game line</span><span><i class="red"></i>Playoff line</span></div>
</section>
</div>

<section class="pt-sec">
${banner('Remaining fixtures')}
<ul class="pt-fix">${fixRows}</ul>
</section>

<p class="pt-foot">Updated ${esc(asOf)}. Standings are rebuilt from ESPN results, regular season only. "Secures" numbers assume every rival wins out and any tie goes against Rhode Island unless the head-to-head series is already decided. Odds use a Poisson goals model with home advantage and no injury or form adjustments.</p>
</div>`;
}

function short(cards) {
    const good = cards.filter((c) => c.tone === 'good').length;
    if (good === 2) return 'Both paths are still fully in Rhode Island\'s hands.';
    if (good === 1) return 'One path is still fully in Rhode Island\'s hands. The other isn\'t — and the reason comes down to a single tiebreaker.';
    return 'Neither path is fully in Rhode Island\'s hands.';
}

export function renderText(data) {
    const { team, playoff, home, sim, ranked, confidence } = data;
    const me = ranked.find((r) => r.id === team.id);
    const lines = [];
    lines.push(`${team.name}: ${me.pts} pts, ${me.gp} played, ${me.remaining} left, rank ${me.rank}/${ranked.length} East (max ${me.pts + 3 * me.remaining})`);
    const fmt = (m, what) => m.clinched ? `${what}: CLINCHED` : m.inOwnHands ? `${what}: ${m.magic} more pts (${m.clinchPts} total) guarantees it` : m.eliminated ? `${what}: out of reach (${m.lockedAbove.length} locked above)` : `${what}: not in own hands (max ${m.maxPts}; ${m.threats.length} rivals can match)`;
    lines.push(fmt(playoff, 'Playoffs (top 8)'));
    lines.push(fmt(home, 'Home game (top 4)'));
    lines.push(`Odds: playoffs ${pct(sim.focus.pTop8)}, home game ${pct(sim.focus.pTop4)}, avg ${sim.focus.avgPts.toFixed(1)} pts`);
    lines.push(`Points for 50%/90% playoff chance: ${confidence.top8_50 ?? '—'}/${confidence.top8_90 ?? '—'}; top-4 50%/90%: ${confidence.top4_50 ?? '—'}/${confidence.top4_90 ?? '—'}`);
    lines.push('');
    lines.push('East table:');
    for (const r of ranked) {
        const s = sim.teams.find((t) => t.id === r.id);
        lines.push(`${String(r.rank).padStart(2)} ${r.short.padEnd(22)} ${String(r.gp).padStart(2)}gp ${String(r.pts).padStart(3)}pts max${String(r.pts + 3 * r.remaining).padStart(3)}  P8 ${pct(s.pTop8).padStart(4)}  P4 ${pct(s.pTop4).padStart(4)}`);
    }
    return lines.join('\n');
}
