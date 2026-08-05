const fs = require('fs');

const GROUPS = ['chest', 'back', 'shoulders', 'legs', 'abs'];
const T = {
  chest:     { letter: 'C', color: '#e5b83d', name: 'Chest' },
  back:      { letter: 'B', color: '#4cc9c0', name: 'Back' },
  shoulders: { letter: 'S', color: '#a78bfa', name: 'Shoulders' },
  legs:      { letter: 'L', color: '#7ec96a', name: 'Legs' },
  abs:       { letter: 'A', color: '#f0776c', name: 'Abs' },
};

// Superseded glyphs, kept only for the before/after panel.
const OLD = {
  chest:     '<ellipse cx="7.9" cy="11" rx="4.3" ry="3.5"/><ellipse cx="16.1" cy="11" rx="4.3" ry="3.5"/>',
  shoulders: '<path d="M2.8 14.2a4.3 4.3 0 0 1 8.6 0Z"/><path d="M12.6 14.2a4.3 4.3 0 0 1 8.6 0Z"/>',
};

// Pecs: wider than tall, flat-bottomed, mass toward the outer end, sternum gap down
// the middle. Convex circles read as breasts; angled slabs don't.
const PECS =
  '<path d="M11.4 7.6C8.6 7.8 6 8.2 4.6 8.8Q3.5 9.3 3.7 10.6L3.9 11.9Q4.1 13.1 5.6 12.9C7.6 12.7 9.6 12.4 11.4 12.2Z"/>' +
  '<path d="M12.6 7.6C15.4 7.8 18 8.2 19.4 8.8Q20.5 9.3 20.3 10.6L20.1 11.9Q19.9 13.1 18.4 12.9C16.4 12.7 14.4 12.4 12.6 12.2Z"/>';

// Delts: one circle split down the middle, each half bulging outward, thin gap between.
// Sized to carry the same visual weight as the other glyphs — a smaller circle reads
// as a weedy dot next to the quads and the abs grid.
const DELTS =
  '<path d="M11.65 6.2a5.8 5.8 0 0 0 0 11.6Z"/>' +
  '<path d="M12.35 6.2a5.8 5.8 0 0 1 0 11.6Z"/>';

const ANATOMY = {
  chest:     PECS,
  back:      '<path d="M5.5 5.5C6 12 8 15.2 10.6 18.5V6.8Z"/><path d="M18.5 5.5C18 12 16 15.2 13.4 18.5V6.8Z"/>',
  shoulders: DELTS,
  legs:      '<path d="M6.4 4.6h4.4l-1.1 14.8H7.5Z"/><path d="M17.6 4.6h-4.4l1.1 14.8h2.2Z"/>',
  abs:       '<rect x="7.5" y="5" width="3.6" height="3.6" rx="1.1"/><rect x="12.9" y="5" width="3.6" height="3.6" rx="1.1"/>' +
             '<rect x="7.5" y="10.2" width="3.6" height="3.6" rx="1.1"/><rect x="12.9" y="10.2" width="3.6" height="3.6" rx="1.1"/>' +
             '<rect x="7.5" y="15.4" width="3.6" height="3.6" rx="1.1"/><rect x="12.9" y="15.4" width="3.6" height="3.6" rx="1.1"/>',
};

const SIZES = [24, 16, 13, 9];

const svgFill = (content, group, px) =>
  `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="${T[group].color}" stroke="none">${content}</svg>`;

const glyph = (group, px) => svgFill(ANATOMY[group], group, px);

function letterGlyph(group, px) {
  const c = T[group].color;
  const d = Math.round(px * 1.45);
  return `<span class="mk" style="width:${d}px;height:${d}px;font-size:${Math.max(7, Math.round(d * 0.62))}px;` +
         `background:${c}2e;box-shadow:inset 0 0 0 1px ${c}8c;color:${c}">${T[group].letter}</span>`;
}

function chipOf(inner, group) {
  const c = T[group].color;
  return `<span class="mk" style="width:13px;height:13px;font-size:8px;` +
         `background:${c}2e;box-shadow:inset 0 0 0 1px ${c}8c;color:${c}">${inner}</span>`;
}
const chip = (mode, group) =>
  chipOf(mode === 'letters' ? T[group].letter : glyph(group, 9), group);

function sizeTable(mode) {
  let rows = '';
  for (const px of SIZES) {
    const cells = GROUPS.map(g =>
      `<td><span class="box">${mode === 'letters' ? letterGlyph(g, px) : glyph(g, px)}</span></td>`).join('');
    const tag = px === 9 ? '9px <em>cell</em>' : px === 16 ? '16px <em>tab</em>' : px + 'px';
    rows += `<tr><th>${tag}</th>${cells}</tr>`;
  }
  const head = GROUPS.map(g => `<th class="gh" style="color:${T[g].color}">${T[g].name}</th>`).join('');
  return `<table><tr><th></th>${head}</tr>${rows}</table>`;
}

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

function monthGrid(mode) {
  const dows = ['S','M','T','W','T','F','S'];
  let h = `<div class="calhead"><span class="mo">July 2026</span><span class="wk">this week: 4 workouts</span></div>`;
  h += `<div class="dow">${dows.map(d => `<span>${d}</span>`).join('')}</div><div class="grid">`;
  for (let i = 0; i < 3; i++) h += `<div class="gcell"></div>`;
  for (let d = 1; d <= 31; d++) {
    const s = SESSIONS[d];
    const cls = 'gcell' + (s ? ' has' : '') + (d === 29 ? ' today' : '');
    h += `<div class="${cls}"><div class="num">${d}</div>` +
         `<div class="marks">${s ? s.map(g => chip(mode, g)).join('') : ''}</div></div>`;
  }
  return `<div class="cal">${h}</div></div>`;
}

function inSitu(mode) {
  const days = [
    { n: 26, s: ['chest','abs'] }, { n: 27, s: ['back'] }, { n: 28, s: ['legs'] },
    { n: 29, s: ['shoulders','abs'], today: true }, { n: 19, s: ['back','legs','abs'] },
  ];
  const cells = days.map(d =>
    `<div class="cell${d.today ? ' today' : ''}"><div class="num">${d.n}</div>` +
    `<div class="marks">${d.s.map(g => chip(mode, g)).join('')}</div></div>`).join('');
  return `<div class="situ"><div class="situlab">in a calendar cell →</div><div class="strip">${cells}</div></div>`;
}

function fixRow(label, group, oldContent, newContent) {
  const cells = (content) => SIZES.map(px =>
    `<td><span class="box">${svgFill(content, group, px)}</span></td>`).join('');
  const situ = (content) => `<td class="sc">${chipOf(svgFill(content, group, 9), group)}</td>`;
  return `<tr class="fixhead"><th colspan="6">${label}</th></tr>` +
         `<tr><th>before</th>${cells(oldContent)}${situ(oldContent)}</tr>` +
         `<tr><th>after</th>${cells(newContent)}${situ(newContent)}</tr>`;
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jim — icons: final two</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #0b0b0d; color: #f2f2f4;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased; }
body { max-width: 420px; margin: 0 auto; padding: 16px 12px 44px; }
h1 { font-size: 22px; letter-spacing: -0.4px; }
.sub { color: #98989f; font-size: 12px; margin-top: 4px; line-height: 1.45; }
section { margin-top: 24px; }
.label { font-size: 14px; font-weight: 700; color: #e5b83d; }
.note { color: #98989f; font-size: 11.5px; margin: 3px 0 9px; line-height: 1.5; }
.panel { background: #17171a; border: 1px solid #2a2a2f; border-radius: 14px; padding: 10px 12px 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: center; padding: 3px 0; }
th { font-size: 9px; color: #98989f; font-weight: 600; }
th.gh { font-size: 9.5px; font-weight: 700; padding-bottom: 5px; }
tr > th:first-child { text-align: left; width: 52px; }
tr > th:first-child em { font-style: normal; color: #6c6c74; }
tr + tr td { border-top: 1px solid #212126; }
.box { display: inline-flex; align-items: center; justify-content: center; height: 27px; }
.fix .fixhead th { text-align: left; color: #e5b83d; font-size: 10.5px; padding: 11px 0 3px; }
.fix .sc { border-left: 1px dashed #2a2a2f; }
.mk { border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
      font-weight: 800; line-height: 1; }
.situ { margin-top: 12px; border-top: 1px dashed #2a2a2f; padding-top: 10px; }
.situlab { font-size: 9.5px; color: #6c6c74; margin-bottom: 5px; }
.strip { display: flex; gap: 2px; }
.cell { width: 47px; min-height: 40px; border-radius: 8px; padding: 3px 0 2px; text-align: center; }
.cell.today, .gcell.today { background: #1f1f23; box-shadow: inset 0 0 0 1px #e5b83d; }
.num { font-size: 11px; color: #f2f2f4; font-weight: 600; line-height: 1.3; }
.marks { display: flex; justify-content: center; gap: 2px; margin-top: 3px; min-height: 13px; }
.cal { background: #17171a; border: 1px solid #2a2a2f; border-radius: 14px; padding: 11px 9px 9px; }
.calhead { display: flex; align-items: baseline; justify-content: space-between; padding: 0 3px 8px; }
.calhead .mo { font-size: 15px; font-weight: 600; }
.calhead .wk { font-size: 11px; color: #98989f; }
.dow { display: grid; grid-template-columns: repeat(7, 1fr); }
.dow span { text-align: center; font-size: 9px; color: #98989f; font-weight: 600; padding-bottom: 4px; }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
.gcell { min-height: 42px; border-radius: 8px; padding: 3px 0 2px; text-align: center; }
.gcell .num { color: #98989f; font-weight: 400; }
.gcell.has .num { color: #f2f2f4; font-weight: 600; }
.foot { color: #6c6c74; font-size: 11px; margin-top: 22px; line-height: 1.5; }
</style>
</head>
<body>
<h1>Down to two</h1>
<p class="sub">Pose figures and the body-region figure are out. What's left: filled anatomical shapes versus letters — shown at every size, then head-to-head across a full month.</p>

<section>
  <div class="label">Latest fixes</div>
  <p class="note">Pecs: round ellipses → angled slabs with a sternum gap. Delts: flat-bottomed domes → one circle split down the middle, both halves facing out.</p>
  <div class="panel"><table class="fix">
    <tr><th></th>${SIZES.map(px => `<th>${px}px</th>`).join('')}<th>in cell</th></tr>
    ${fixRow('Chest — pecs', 'chest', OLD.chest, ANATOMY.chest)}
    ${fixRow('Shoulders — delts', 'shoulders', OLD.shoulders, ANATOMY.shoulders)}
  </table></div>
</section>

<section>
  <div class="label">A · Anatomical shapes</div>
  <p class="note">Pec slabs, lats tapering in, delts as a split circle, quads running down, an abs grid.</p>
  <div class="panel">${sizeTable('icons')}${inSitu('icons')}</div>
</section>

<section>
  <div class="label">B · Letters</div>
  <p class="note">C B S L A — legible at any size, no drawing required.</p>
  <div class="panel">${sizeTable('letters')}${inSitu('letters')}</div>
</section>

<section>
  <div class="label">Head-to-head · a full month</div>
  <p class="note">The real test: a month of your actual training pattern, at true phone size. Anatomical first, letters second.</p>
  ${monthGrid('icons')}
  <div style="height:12px"></div>
  ${monthGrid('letters')}
</section>

<p class="foot">Hand-drawn on a 24px grid. The equipment set you rejected has been dropped too — easy to restore if you want another look.</p>
</body>
</html>
`;

fs.writeFileSync('/Users/ryonsabouni/jim-workout-app/mockup-icons.html', html);
console.log('bytes:', html.length, '| script tags:', (html.match(/<script/g) || []).length,
            '| svgs:', (html.match(/<svg/g) || []).length);
