const fs = require('fs');

// Literal hex everywhere (no CSS vars, no color-mix, no JS in the output) so the page
// renders in any viewer, including sandboxed file:// panels that block inline scripts.
const T = {
  chest:     { letter: 'C', color: '#e5b83d', name: 'Chest' },
  back:      { letter: 'B', color: '#4cc9c0', name: 'Back' },
  shoulders: { letter: 'S', color: '#a78bfa', name: 'Shoulders' },
  legs:      { letter: 'L', color: '#7ec96a', name: 'Legs' },
  abs:       { letter: 'A', color: '#f0776c', name: 'Abs' },
};

const ICONS = {
  chest:     '<path d="M6 8v8M18 8v8M6 12h12"/>',
  back:      '<path d="M4 5h16M12 9v9M9 15l3 3 3-3"/>',
  shoulders: '<path d="M4 20h16M12 16V7M9 10l3-3 3 3"/>',
  legs:      '<path d="M9 4v6l5 5v5"/>',
  abs:       '<path d="M7 5h4M13 5h4M7 11h4M13 11h4M7 17h4M13 17h4"/>',
};

// July 2026: the 1st is a Wednesday, 31 days.
const SESSIONS = {
  1: ['chest','abs'],     2: ['back'],           3: ['legs'],
  5: ['shoulders','abs'], 6: ['chest'],          7: ['back','abs'],      8: ['legs'],
  10:['shoulders'],      11: ['chest','abs'],
  13:['back'],           14: ['legs'],          15: ['shoulders','abs'],16: ['chest'],
  18:['back','abs'],     19: ['back','legs','abs'],
  21:['chest'],          22: ['back','abs'],    23: ['shoulders'],      24: ['legs'],
  26:['chest','abs'],    27: ['back'],          28: ['legs'],           29: ['shoulders','abs'],
};
const TODAY = 29, LEAD = 3, DAYS = 31;

const chip = (t, inner) =>
  `<span class="mk" style="background:${T[t].color}2e;box-shadow:inset 0 0 0 1px ${T[t].color}8c">${inner}</span>`;

function marker(t, mode) {
  if (mode === 'dots') return `<span class="dot" style="background:${T[t].color}"></span>`;
  if (mode === 'letters') return chip(t, `<span style="color:${T[t].color}">${T[t].letter}</span>`);
  return chip(t, `<svg viewBox="0 0 24 24" fill="none" stroke="${T[t].color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[t]}</svg>`);
}

function cal(mode) {
  const dows = ['S','M','T','W','T','F','S'];
  let h = `<div class="calhead"><span class="mo">July 2026</span><span class="wk">this week: 4 workouts</span></div>`;
  h += `<div class="dow">${dows.map(d => `<span>${d}</span>`).join('')}</div><div class="grid">`;
  for (let i = 0; i < LEAD; i++) h += `<div class="cell"></div>`;
  for (let d = 1; d <= DAYS; d++) {
    const s = SESSIONS[d];
    const cls = 'cell' + (s ? ' has' : '') + (d === TODAY ? ' today' : '');
    h += `<div class="${cls}"><div class="num">${d}</div><div class="marks">${s ? s.map(t => marker(t, mode)).join('') : ''}</div></div>`;
  }
  return `<div class="cal">${h}</div></div>`;
}

const all = Object.keys(T);
let zoom = '';
for (const [label, mode] of [['Letters','letters'], ['Icons','icons'], ['Dots','dots']]) {
  const set = `<span class="zset">${all.map(t => marker(t, mode)).join('')}</span>`;
  zoom += `<div class="zrow"><span class="zlab">${label} 1×</span>${set}</div>`;
  zoom += `<div class="zrow"><span class="zlab">${label} 2×</span><span class="x2">${set}</span></div>`;
  zoom += `<div class="zrow zbig"><span class="zlab">${label} 3×</span><span class="x3">${set}</span></div>`;
}

const legend = all.map(t =>
  `<div><span class="sw" style="background:${T[t].color}"></span>${T[t].name}</div>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jim — calendar marker mockup</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #0b0b0d; color: #f2f2f4;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
body { max-width: 375px; margin: 0 auto; padding: 16px 12px 40px; }
h1 { font-size: 22px; letter-spacing: -0.4px; }
.sub { color: #98989f; font-size: 12px; margin-top: 3px; }
.legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 4px; }
.legend div { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #98989f; }
.sw { width: 9px; height: 9px; border-radius: 3px; }
section { margin-top: 22px; }
.label { font-size: 13px; font-weight: 700; color: #e5b83d; letter-spacing: 0.3px; }
.note { color: #98989f; font-size: 11px; margin: 2px 0 9px; }
.cal { background: #17171a; border: 1px solid #2a2a2f; border-radius: 14px; padding: 11px 9px 9px; }
.calhead { display: flex; align-items: baseline; justify-content: space-between; padding: 0 3px 8px; }
.calhead .mo { font-size: 15px; font-weight: 600; }
.calhead .wk { font-size: 11px; color: #98989f; }
.dow { display: grid; grid-template-columns: repeat(7, 1fr); }
.dow span { text-align: center; font-size: 9px; color: #98989f; font-weight: 600; padding-bottom: 4px; }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.cell { min-height: 42px; border-radius: 8px; padding: 3px 0 2px; text-align: center; }
.cell.today { background: #1f1f23; box-shadow: inset 0 0 0 1px #e5b83d; }
.num { font-size: 11px; color: #98989f; line-height: 1.3; }
.cell.has .num { color: #f2f2f4; font-weight: 600; }
.marks { display: flex; justify-content: center; gap: 2px; margin-top: 3px; min-height: 13px; }
.mk { width: 13px; height: 13px; border-radius: 50%; display: inline-flex;
      align-items: center; justify-content: center; font-size: 8px; font-weight: 800; line-height: 1; }
.mk svg { width: 9px; height: 9px; display: block; }
.dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 3px; }
.zoom { background: #17171a; border: 1px solid #2a2a2f; border-radius: 14px; padding: 12px; }
.zrow { display: flex; align-items: center; gap: 14px; padding: 7px 0; }
.zrow + .zrow { border-top: 1px solid #2a2a2f; }
.zrow.zbig { min-height: 48px; }
.zlab { font-size: 10px; color: #98989f; width: 46px; flex-shrink: 0; }
.zset { display: flex; gap: 4px; align-items: center; }
.x2, .x3 { display: inline-block; transform-origin: left center; }
.x2 { transform: scale(2); }
.x3 { transform: scale(3); }
</style>
</head>
<body>
<h1>Calendar markers</h1>
<p class="sub">Same month, same sessions, three treatments. Real phone width (375px) — markers are at true size, not enlarged.</p>
<div class="legend">${legend}</div>

<section>
  <div class="label">A · Letters</div>
  <p class="note">Your five days have unique first letters — C B S L A — so nothing collides.</p>
  ${cal('letters')}
</section>

<section>
  <div class="label">B · Icons</div>
  <p class="note">Hand-drawn in Lucide's style (2px stroke, 24px grid), inlined — no CDN, works offline.</p>
  ${cal('icons')}
</section>

<section>
  <div class="label">C · Plain dots <span style="color:#98989f;font-weight:400">(baseline)</span></div>
  <p class="note">Colour only, as originally proposed — for reference.</p>
  ${cal('dots')}
</section>

<section>
  <div class="label">Legibility check</div>
  <p class="note">Same markers at 1× (true size), 2×, 3×.</p>
  <div class="zoom">${zoom}</div>
</section>
</body>
</html>
`;

fs.writeFileSync('/Users/ryonsabouni/jim-workout-app/mockup-calendar.html', html);
console.log('written, bytes:', html.length, '| script tags:', (html.match(/<script/g) || []).length);
