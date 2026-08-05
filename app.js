'use strict';

// Rep target implied by bare weights in the note — confirmed 10 by user.
const DEFAULT_REPS = 10;

// The app ships without a program: first run offers a restore from backup, and after
// that it renders whatever IndexedDB holds. The owner's program lives in their backups,
// not in this public source.
const EMPTY_PROGRAM = { title: 'Jim', coachNotes: [], days: [], exercises: {} };

// One colour per training day, assigned by position (cycles past five).
const PALETTE = ['#e5b83d', '#4cc9c0', '#a78bfa', '#7ec96a', '#f0776c'];

// Anatomical glyphs for the classic day ids; days with other ids just get no icon.
const DAY_ICONS = {
  chest: '<path d="M11.4 7.6C8.6 7.8 6 8.2 4.6 8.8Q3.5 9.3 3.7 10.6L3.9 11.9Q4.1 13.1 5.6 12.9C7.6 12.7 9.6 12.4 11.4 12.2Z"/>' +
         '<path d="M12.6 7.6C15.4 7.8 18 8.2 19.4 8.8Q20.5 9.3 20.3 10.6L20.1 11.9Q19.9 13.1 18.4 12.9C16.4 12.7 14.4 12.4 12.6 12.2Z"/>',
  back: '<path d="M5.5 5.5C6 12 8 15.2 10.6 18.5V6.8Z"/><path d="M18.5 5.5C18 12 16 15.2 13.4 18.5V6.8Z"/>',
  shoulders: '<path d="M11.65 6.2a5.8 5.8 0 0 0 0 11.6Z"/><path d="M12.35 6.2a5.8 5.8 0 0 1 0 11.6Z"/>',
  legs: '<path d="M6.4 4.6h4.4l-1.1 14.8H7.5Z"/><path d="M17.6 4.6h-4.4l1.1 14.8h2.2Z"/>',
  abs: '<rect x="7.5" y="5" width="3.6" height="3.6" rx="1.1"/><rect x="12.9" y="5" width="3.6" height="3.6" rx="1.1"/>' +
       '<rect x="7.5" y="10.2" width="3.6" height="3.6" rx="1.1"/><rect x="12.9" y="10.2" width="3.6" height="3.6" rx="1.1"/>' +
       '<rect x="7.5" y="15.4" width="3.6" height="3.6" rx="1.1"/><rect x="12.9" y="15.4" width="3.6" height="3.6" rx="1.1"/>',
};

const dayIndex = dayId => P.days.findIndex(d => d.id === dayId);
const dayColor = dayId => PALETTE[Math.max(0, dayIndex(dayId)) % PALETTE.length];
const dayLetter = dayId => (P.days[dayIndex(dayId)]?.name.trim()[0] || '?').toUpperCase();
function dayIconSvg(dayId, px) {
  const paths = DAY_ICONS[dayId];
  if (!paths) return '';
  return `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="${dayColor(dayId)}" stroke="none">${paths}</svg>`;
}

// ---- IndexedDB ----
let db;
function openDB() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('jim', 1);
    q.onupgradeneeded = e => {
      const d = e.target.result;
      d.createObjectStore('kv');
      d.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
    };
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
const kvGet = k => tx('kv', 'readonly', s => s.get(k));
const kvSet = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));
const histAdd = e => tx('history', 'readwrite', s => s.add(e));
const histAll = () => tx('history', 'readonly', s => s.getAll());
const wipe = async () => { await tx('kv', 'readwrite', s => s.clear()); await tx('history', 'readwrite', s => s.clear()); };

// ---- State ----
let P;              // program
let activeDay = 'chest';
let editCtx = null; // {exId, idx, mode}
let editedToday = new Set();
let HIST = [];      // in-memory mirror of the history store
let DONE = { date: null, map: {} }; // per-day set check-offs, reset daily
let CHECKLOG = {};  // permanent workout diary: dateKey -> [exId] checked off that day
let editOpenedAt = 0;
let actCtx = null, actOpenedAt = 0;

const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));
const todayKey = ts => new Date(ts).toDateString();

async function init() {
  db = await openDB();
  P = await kvGet('program');
  if (!P) {
    P = clone(EMPTY_PROGRAM);
    await kvSet('program', P);
  }
  activeDay = (await kvGet('lastDay')) || (P.days[0] && P.days[0].id);
  HIST = await histAll();
  const today = todayKey(Date.now());
  for (const h of HIST) if (h.label === 'edit' && todayKey(h.ts) === today) editedToday.add(h.exId);
  DONE = (await kvGet('done')) || { date: today, map: {} };
  if (DONE.date !== today) DONE = { date: today, map: {} };
  // migrate any per-set arrays from the earlier check-off design to per-exercise booleans
  for (const k in DONE.map) if (Array.isArray(DONE.map[k])) DONE.map[k] = DONE.map[k].some(Boolean);
  CHECKLOG = (await kvGet('checklog')) || {};
  lastBackupAt = (await kvGet('lastBackupAt')) || 0;
  render();
  updateBanner();
}

// ---- Rendering ----
function fmtW(n) { return String(n); }
function chipText(s) {
  if (s.drop != null) return `${fmtW(s.w)}→${fmtW(s.drop)}`;
  if (s.sec != null) return `${s.sec}s`;
  if (s.add != null) return s.reps != null ? `+${fmtW(s.add)}×${s.reps}` : `+${fmtW(s.add)}`;
  if (s.bw) return s.reps != null ? `${s.approx ? '~' : ''}${s.reps}` : 'BW';
  if (s.w != null) return s.reps != null ? `${fmtW(s.w)}(${s.reps})` : fmtW(s.w);
  return '—';
}

function fmtDate(ts) {
  const d = new Date(ts), now = new Date();
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

// Most recent snapshot from a previous day — "last time" context during a live workout.
function lastEntryFor(exId) {
  const today = todayKey(Date.now());
  let best = null;
  for (const h of HIST) {
    if (h.exId === exId && todayKey(h.ts) !== today && (!best || h.ts > best.ts)) best = h;
  }
  return best;
}

// The note's own convention: bare weight = hit the usual target, parens = deviation.
// A previous session with no sub-target reps on any weighted set → candidate for a bump.
// Timed, drop (burnout), and bodyweight-only sets carry no target, so they're neutral.
function hitTarget(sets) {
  const judged = sets.filter(s => (s.w != null || s.add != null) && s.drop == null && s.sec == null);
  return judged.length > 0 && judged.every(s => s.reps == null || s.reps >= DEFAULT_REPS);
}

function render() {
  const coach = $('coach');
  coach.textContent = P.coachNotes.join(' · ');
  coach.classList.toggle('hidden', !P.coachNotes.length);
  const tabs = $('tabs');
  tabs.innerHTML = '';
  if (!P.days.length) { renderSetup(); return; }
  if (!P.days.some(d => d.id === activeDay)) activeDay = P.days[0].id;
  for (const d of P.days) {
    const b = document.createElement('button');
    const icon = dayIconSvg(d.id, 17);
    b.innerHTML = `${icon}<span>${d.name}</span>`;
    b.className = (icon ? 'tabicon' : '') + (d.id === activeDay ? ' active' : '');
    if (d.id === activeDay) b.style.setProperty('--daycolor', dayColor(d.id));
    b.onclick = () => { activeDay = d.id; kvSet('lastDay', activeDay); render(); };
    tabs.appendChild(b);
  }
  const day = P.days.find(d => d.id === activeDay);
  const main = $('day');
  main.innerHTML = '';
  for (const group of day.groups) {
    const g = document.createElement('div');
    g.className = 'group';
    for (const exId of group) g.appendChild(renderEx(exId));
    main.appendChild(g);
  }
}

// First-run screen: no program yet, so the only meaningful actions are the restores.
function renderSetup() {
  const main = $('day');
  main.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'setup';
  card.innerHTML = `
    <h2>No program yet</h2>
    <p>Jim ships empty. Restore your program and history from a backup.</p>
    <div class="actions">
      <button class="actbtn gold" id="setupFile">Restore from a file…</button>
      <button class="actbtn" id="setupPaste">Restore from pasted text…</button>
    </div>`;
  main.appendChild(card);
  $('setupFile').onclick = () => $('fileInput').click();
  $('setupPaste').onclick = () => {
    openData();
    $('pasteWrap').classList.remove('hidden');
    $('pasteBox').focus();
  };
}

function renderEx(exId) {
  const ex = P.exercises[exId];
  const card = document.createElement('div');
  card.className = 'ex' + (DONE.map[exId] ? ' done' : '');

  const head = document.createElement('div');
  head.className = 'exhead';
  const name = document.createElement('div');
  name.className = 'exname';
  name.textContent = ex.name;
  if (editedToday.has(exId)) name.appendChild(Object.assign(document.createElement('span'), { className: 'dot' }));
  head.appendChild(name);

  const meta = [ex.angle, ex.tag].filter(Boolean).join(' · ');
  if (meta) head.appendChild(Object.assign(document.createElement('span'), { className: 'exmeta', textContent: meta }));

  const hb = document.createElement('button');
  hb.className = 'histbtn';
  hb.textContent = '⟲';
  hb.title = 'History';
  hb.onclick = () => openHist(exId);
  head.appendChild(hb);
  card.appendChild(head);

  if (ex.note) card.appendChild(Object.assign(document.createElement('div'), { className: 'exnote', textContent: ex.note }));

  const last = lastEntryFor(exId);
  if (last) {
    const ll = document.createElement('div');
    ll.className = 'lastline';
    const line = last.sets.length ? last.sets.map(chipText).join(', ') : '—';
    ll.textContent = `last: ${line} · ${fmtDate(last.ts)}`;
    if (ex.tag !== 'warm up' && hitTarget(last.sets)) {
      ll.appendChild(Object.assign(document.createElement('span'), { className: 'bump', textContent: ' ↑ hit target' }));
    }
    card.appendChild(ll);
  }

  const chips = document.createElement('div');
  chips.className = 'chips';
  ex.sets.forEach((s, i) => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = chipText(s);
    c.onclick = () => openEdit(exId, i);
    chips.appendChild(c);
  });
  const add = document.createElement('button');
  add.className = 'chip add';
  add.textContent = '＋';
  add.onclick = () => openEdit(exId, -1);
  chips.appendChild(add);
  card.appendChild(chips);
  attachCardGestures(card, exId);
  return card;
}

// ---- Card gestures: tap a chip = edit that set, long-press the card = action sheet ----
const LONG_PRESS_MS = 450;
function attachCardGestures(card, exId) {
  let timer = null, fired = false;
  card.addEventListener('pointerdown', () => {
    fired = false;
    timer = setTimeout(() => { fired = true; openActions(exId); }, LONG_PRESS_MS);
  });
  const cancel = () => clearTimeout(timer);
  card.addEventListener('pointerup', cancel);
  card.addEventListener('pointerleave', cancel);
  card.addEventListener('pointercancel', cancel);
  // Capture phase: swallow the click that ends a long-press so it doesn't also open an editor.
  card.addEventListener('click', e => {
    if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  card.addEventListener('contextmenu', e => e.preventDefault());
}

async function toggleDoneEx(exId) {
  const on = !DONE.map[exId];
  DONE.map[exId] = on;
  await kvSet('done', DONE);
  await logCheck(exId, on);
  render();
}

// Permanent diary of check-offs (the on-screen ✓s still reset daily).
async function logCheck(exId, on) {
  const k = todayKey(Date.now());
  const arr = CHECKLOG[k] || (CHECKLOG[k] = []);
  const i = arr.indexOf(exId);
  if (on && i < 0) arr.push(exId);
  if (!on && i >= 0) arr.splice(i, 1);
  if (!arr.length) delete CHECKLOG[k];
  await kvSet('checklog', CHECKLOG);
}

// ---- Bump: the ladder advances one rung (user-confirmed shift rule) ----
// Only offered when every set is plainly weighted the same way (all w, or all add) —
// timed, drop, and mixed bodyweight/belt exercises stay manual.
function bumpPlan(ex) {
  const sets = ex.sets;
  if (!sets.length) return null;
  const key = sets.every(s => s.w != null && s.drop == null && s.sec == null) ? 'w'
            : sets.every(s => s.add != null && s.sec == null) ? 'add' : null;
  if (!key) return null;
  const vals = sets.map(s => s[key]);
  let step = 0;
  for (let i = vals.length - 1; i > 0 && !step; i--) step = vals[i] - vals[i - 1];
  if (!step) step = 5;
  const next = vals.slice(1).concat(vals[vals.length - 1] + step);
  return { key, next };
}

// Bumped sets drop their rep marks: new weights mean a fresh run at the target.
async function applyBump(exId) {
  const plan = bumpPlan(P.exercises[exId]);
  if (!plan) return;
  P.exercises[exId].sets = plan.next.map(v => plan.key === 'w' ? { w: v } : { add: v });
  await commit(exId);
}

// ---- Reorder: within the day; crossing a divider hops into the adjacent group ----
function findSlot(exId) {
  for (const day of P.days) {
    for (let gi = 0; gi < day.groups.length; gi++) {
      const pi = day.groups[gi].indexOf(exId);
      if (pi !== -1) return { day, gi, pi };
    }
  }
  return null;
}

async function moveEx(exId, dir) {
  const s = findSlot(exId);
  if (!s) return;
  const g = s.day.groups[s.gi];
  const ni = s.pi + dir;
  if (ni >= 0 && ni < g.length) {
    [g[s.pi], g[ni]] = [g[ni], g[s.pi]];
  } else {
    const tg = s.day.groups[s.gi + dir];
    if (!tg) return; // already at the very top or bottom of the day
    g.splice(s.pi, 1);
    if (dir === -1) tg.push(exId); else tg.unshift(exId);
    if (!g.length) s.day.groups.splice(s.gi, 1); // a divider with nothing left in it disappears
  }
  await kvSet('program', P);
  render();
  syncMoveButtons(exId);
}

function syncMoveButtons(exId) {
  const s = findSlot(exId);
  const last = s && s.day.groups.length - 1;
  $('actUp').disabled = !s || (s.gi === 0 && s.pi === 0);
  $('actDown').disabled = !s || (s.gi === last && s.pi === s.day.groups[last].length - 1);
}

// Removing an exercise takes its history with it — confirm spells that out.
async function removeEx(exId) {
  const ex = P.exercises[exId];
  const s = findSlot(exId);
  if (!ex || !s) return;
  const doomed = HIST.filter(h => h.exId === exId);
  const msg = `Remove "${ex.name}" from ${s.day.name}?` +
    (doomed.length ? `\n\nIts ${doomed.length} history entr${doomed.length === 1 ? 'y' : 'ies'} will be deleted too.` : '');
  if (!confirm(msg)) return;
  s.day.groups[s.gi].splice(s.pi, 1);
  if (!s.day.groups[s.gi].length) s.day.groups.splice(s.gi, 1);
  delete P.exercises[exId];
  HIST = HIST.filter(h => h.exId !== exId);
  for (const h of doomed) await tx('history', 'readwrite', st => st.delete(h.id));
  delete DONE.map[exId];
  for (const k of Object.keys(CHECKLOG)) {
    CHECKLOG[k] = CHECKLOG[k].filter(e => e !== exId);
    if (!CHECKLOG[k].length) delete CHECKLOG[k];
  }
  editedToday.delete(exId);
  await kvSet('program', P);
  await kvSet('done', DONE);
  await kvSet('checklog', CHECKLOG);
  render();
}

function openActions(exId) {
  actCtx = exId;
  const ex = P.exercises[exId];
  $('actTitle').textContent = ex.name;
  syncMoveButtons(exId);
  $('actDone').textContent = DONE.map[exId] ? '↩ Un-complete' : '✓ Mark complete';
  const plan = bumpPlan(ex);
  $('actBump').style.display = plan ? '' : 'none';
  if (plan) $('actBump').textContent = `↑ Bump → ${plan.next.map(v => plan.key === 'add' ? '+' + v : v).join(', ')}`;
  actOpenedAt = Date.now();
  $('actOverlay').classList.remove('hidden');
}
function closeActions() { actCtx = null; $('actOverlay').classList.add('hidden'); }

// ---- Edit modal ----
function setMode(s, ex) {
  if (!s) return ex.bodyweight ? 'bw' : 'w';
  if (s.add != null) return 'add';
  if (s.bw) return 'bw';
  return 'w';
}

function openEdit(exId, idx) {
  const ex = P.exercises[exId];
  const isNew = idx === -1;
  const base = isNew ? (ex.sets[ex.sets.length - 1] || null) : ex.sets[idx];
  editCtx = { exId, idx, mode: setMode(base, ex) };
  $('editTitle').textContent = `${ex.name} — ${isNew ? 'new set' : 'set ' + (idx + 1)}`;
  $('fW').value = base ? (base.add != null ? base.add : base.w != null ? base.w : '') : '';
  $('fR').value = base && base.reps != null ? base.reps : '';
  $('fS').value = base && base.sec != null ? base.sec : '';
  $('fD').value = base && base.drop != null ? base.drop : '';
  $('delSet').style.display = isNew ? 'none' : '';
  editOpenedAt = Date.now();
  $('editOverlay').classList.remove('hidden');
  $('fW').focus();
}

function numOrNull(id) {
  const v = $(id).value.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function saveEdit() {
  const { exId, idx, mode } = editCtx;
  const ex = P.exercises[exId];
  const w = numOrNull('fW'), r = numOrNull('fR'), sec = numOrNull('fS'), drop = numOrNull('fD');
  if (w === null && r === null && sec === null) { closeEdit(); return; }

  const s = {};
  if (sec !== null) s.sec = sec;
  if (w !== null) {
    if (mode === 'add') s.add = w; else s.w = w;
  }
  if (mode === 'bw' && w === null) s.bw = 1;
  if (r !== null) s.reps = r;
  if (drop !== null && w !== null) s.drop = drop;

  if (idx === -1) ex.sets.push(s); else ex.sets[idx] = s;
  await commit(exId);
  closeEdit();
}

async function deleteSet() {
  const { exId, idx } = editCtx;
  if (idx >= 0) {
    P.exercises[exId].sets.splice(idx, 1);
    await commit(exId);
  }
  closeEdit();
}

// Same-day edits collapse into one history entry per exercise — history reads as sessions.
async function commit(exId) {
  await kvSet('program', P);
  const today = todayKey(Date.now());
  const existing = HIST.find(h => h.exId === exId && h.label === 'edit' && todayKey(h.ts) === today);
  if (existing) {
    existing.ts = Date.now();
    existing.sets = clone(P.exercises[exId].sets);
    await tx('history', 'readwrite', s => s.put(existing));
  } else {
    const entry = { exId, ts: Date.now(), sets: clone(P.exercises[exId].sets), label: 'edit' };
    entry.id = await histAdd(entry);
    HIST.push(entry);
  }
  editedToday.add(exId);
  render();
}

function closeEdit() { editCtx = null; $('editOverlay').classList.add('hidden'); }

// ---- History sheet ----
async function openHist(exId) {
  const ex = P.exercises[exId];
  $('histTitle').textContent = ex.name;
  $('histRaw').textContent = `note: "${ex.rawLine}"`;
  const list = $('histList');
  list.innerHTML = '';
  const entries = HIST.filter(h => h.exId === exId).sort((a, b) => b.ts - a.ts);
  if (!entries.length) list.innerHTML = '<p class="raw">No history yet.</p>';
  for (const h of entries) {
    const e = document.createElement('div');
    e.className = 'histentry';
    const d = new Date(h.ts);
    const when = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const head = document.createElement('div');
    head.className = 'histdate';
    head.innerHTML = `<span>${when}</span><span class="label">${h.label === 'seed' ? 'seeded from note' : 'session'}</span>`;
    e.appendChild(head);
    const chips = document.createElement('div');
    chips.className = 'chips';
    if (!h.sets.length) chips.innerHTML = '<span class="chip">—</span>';
    for (const s of h.sets) chips.appendChild(Object.assign(document.createElement('span'), { className: 'chip', textContent: chipText(s) }));
    e.appendChild(chips);
    list.appendChild(e);
  }
  $('histOverlay').classList.remove('hidden');
}

// ---- Backup / restore ----
const SCHEMA = 1;
const STALE_DAYS = 14;

// Built synchronously from in-memory state: navigator.share() must be reached inside the
// click's user-activation window, and any await before it forfeits that on iOS.
function buildBackup() {
  return {
    app: 'jim',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    lastDay: activeDay,
    program: P,
    history: HIST,
    checklog: CHECKLOG,
  };
}

function dateStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// Share sheet first (so it can land in the shared note as an attachment), then clipboard,
// then a plain download. Returns what actually happened.
async function shareOrCopy(filename, text, mime) {
  let file = null;
  try { file = new File([text], filename, { type: mime }); } catch (e) {}
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch (e) {}
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

const REPORT = { shared: 'Sent to the share sheet', copied: 'Copied to clipboard',
                 downloaded: 'Downloaded', cancelled: 'Cancelled' };

async function doBackup() {
  const name = `jim-${dateStamp()}.json`;
  const how = await shareOrCopy(name, JSON.stringify(buildBackup()), 'application/json');
  if (how !== 'cancelled') {
    lastBackupAt = Date.now();
    await kvSet('lastBackupAt', lastBackupAt);
    updateBanner();
    renderBackupState();
  }
  toast(`${REPORT[how]}${how === 'cancelled' ? '' : ' — ' + name}`);
}

// ---- Note-format export (human-readable, in the original notation) ----
function noteSet(s) {
  if (s.drop != null) return `${s.w}→${s.drop}`;
  if (s.sec != null) return `${s.sec}s`;
  if (s.add != null) return s.reps != null ? `+${s.add}x${s.reps}` : `+${s.add}`;
  if (s.bw) return s.reps != null ? `${s.approx ? '~' : ''}${s.reps}` : 'BW';
  if (s.w != null) return s.reps != null ? `${s.w}(${s.reps})` : String(s.w);
  return '';
}

function noteText() {
  const out = [P.title, ...P.coachNotes, ''];
  for (const day of P.days) {
    out.push(`— ${day.name} —`);
    for (const group of day.groups) {
      for (const exId of group) {
        const ex = P.exercises[exId];
        const bits = [ex.name];
        if (ex.angle) bits.push(ex.angle);
        const sets = ex.sets.map(noteSet).filter(Boolean).join(', ');
        if (sets) bits.push(sets);
        let line = bits.join(' ');
        if (ex.note) line += ` (${ex.note})`;
        out.push(line);
      }
      out.push('');
    }
  }
  out.push(`exported ${dateStamp()} — current weights only, not a restorable backup`);
  return out.join('\n');
}

async function doNoteExport() {
  const how = await shareOrCopy(`jim-${dateStamp()}.txt`, noteText(), 'text/plain');
  toast(REPORT[how]);
}

// ---- Restore ----
async function applyBackup(obj) {
  if (!obj || obj.app !== 'jim') throw new Error('That file is not a Jim backup.');
  if (typeof obj.schema === 'number' && obj.schema > SCHEMA) {
    throw new Error('That backup came from a newer version of the app.');
  }
  if (!obj.program || !obj.program.exercises || !Array.isArray(obj.program.days)) {
    throw new Error('That backup is missing its program.');
  }
  const exCount = Object.keys(obj.program.exercises).length;
  const hist = Array.isArray(obj.history) ? obj.history : [];
  const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString() : 'an unknown date';
  const ok = confirm(
    `Restore the backup from ${when}?\n\n` +
    `${exCount} exercises · ${hist.length} history entries\n\n` +
    `This replaces everything currently in the app.`);
  if (!ok) return false;

  await wipe();
  P = obj.program;
  await kvSet('program', P);
  HIST = [];
  for (const h of hist) {
    const e = clone(h);
    await tx('history', 'readwrite', s => s.put(e));
    HIST.push(e);
  }
  CHECKLOG = (obj.checklog && typeof obj.checklog === 'object') ? obj.checklog : {};
  await kvSet('checklog', CHECKLOG);
  activeDay = P.days.some(d => d.id === obj.lastDay) ? obj.lastDay : P.days[0].id;
  await kvSet('lastDay', activeDay);

  // Rebuild today's on-screen ✓s from the diary, so restoring a backup taken mid-workout
  // doesn't silently un-check everything you'd already done.
  const today = todayKey(Date.now());
  DONE = { date: today, map: {} };
  for (const exId of CHECKLOG[today] || []) DONE.map[exId] = true;
  await kvSet('done', DONE);
  editedToday = new Set();
  for (const h of HIST) if (h.label === 'edit' && todayKey(h.ts) === today) editedToday.add(h.exId);

  render();
  updateBanner();
  renderBackupState();
  return true;
}

async function restoreFromText(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    toast("That doesn't look like JSON.");
    return;
  }
  try {
    if (await applyBackup(obj)) {
      closeData();
      toast(`Restored ${HIST.length} history entries.`);
    }
  } catch (e) {
    alert(`Restore failed.\n\n${e.message}\n\nNothing was changed.`);
  }
}

// ---- Calendar ----
let calY = 0, calM = 0, calSelected = null;

// dateKey -> { dayId -> { edited: [exId], checked: [exId] } }, from real activity only
// (weight edits and check-offs; seed snapshots don't count as training).
function activityByDate() {
  const exDay = {};
  for (const d of P.days) for (const g of d.groups) for (const id of g) exDay[id] = d.id;
  const map = {};
  const add = (key, exId, kind) => {
    const dayId = exDay[exId];
    if (!dayId) return; // exercise since removed
    const types = (map[key] = map[key] || {});
    const t = (types[dayId] = types[dayId] || { edited: [], checked: [] });
    if (!t[kind].includes(exId)) t[kind].push(exId);
  };
  for (const h of HIST) if (h.label === 'edit') add(todayKey(h.ts), h.exId, 'edited');
  for (const [key, ids] of Object.entries(CHECKLOG)) for (const id of ids) add(key, id, 'checked');
  return map;
}

function calChip(dayId) {
  const c = dayColor(dayId);
  return `<span class="cmk" style="background:${c}2e;box-shadow:inset 0 0 0 1px ${c}8c;color:${c}">${dayLetter(dayId)}</span>`;
}

function openCal() {
  const n = new Date();
  calY = n.getFullYear();
  calM = n.getMonth();
  calSelected = todayKey(Date.now());
  renderCal();
  $('calOverlay').classList.remove('hidden');
}

function renderCal() {
  const activity = activityByDate();
  $('calTitle').textContent = new Date(calY, calM, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // "this week" = the calendar week containing today, regardless of the viewed month
  const now = new Date();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  let weekN = 0;
  for (let i = 0; i < 7; i++) {
    const k = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i).toDateString();
    if (activity[k]) weekN++;
  }
  $('calWeek').textContent = `this week: ${weekN} workout${weekN === 1 ? '' : 's'}`;

  $('calDow').innerHTML = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<span>${d}</span>`).join('');

  const first = new Date(calY, calM, 1).getDay();
  const days = new Date(calY, calM + 1, 0).getDate();
  const today = todayKey(Date.now());
  let grid = '';
  for (let i = 0; i < first; i++) grid += '<div class="ccell"></div>';
  for (let d = 1; d <= days; d++) {
    const key = new Date(calY, calM, d).toDateString();
    const has = activity[key];
    const cls = 'ccell' + (has ? ' has' : '') + (key === today ? ' today' : '') + (key === calSelected ? ' sel' : '');
    const marks = has ? P.days.filter(dd => has[dd.id]).map(dd => calChip(dd.id)).join('') : '';
    grid += `<div class="${cls}" data-key="${key}"><div class="cnum">${d}</div><div class="cmarks">${marks}</div></div>`;
  }
  $('calGrid').innerHTML = grid;

  // detail for the selected date
  const det = $('calDetail');
  const sel = calSelected && activity[calSelected];
  if (!sel) {
    det.innerHTML = calSelected ? `<p class="raw">${fmtDate(new Date(calSelected).getTime())} — nothing logged.</p>` : '';
    return;
  }
  let html = `<p class="raw">${fmtDate(new Date(calSelected).getTime())}</p>`;
  for (const day of P.days) {
    const t = sel[day.id];
    if (!t) continue;
    html += `<div class="cday"><div class="cdayhead" style="color:${dayColor(day.id)}">` +
            `${dayIconSvg(day.id, 16) || calChip(day.id)}<span>${day.name}</span></div>`;
    const seen = new Set();
    for (const exId of t.edited) {
      if (!P.exercises[exId] || seen.has(exId)) continue;
      seen.add(exId);
      const h = HIST.find(x => x.exId === exId && x.label === 'edit' && todayKey(x.ts) === calSelected);
      const sets = h && h.sets.length ? h.sets.map(chipText).join(', ') : '—';
      const check = t.checked.includes(exId) ? '✓ ' : '';
      html += `<div class="cline">${check}${P.exercises[exId].name} — ${sets}</div>`;
    }
    for (const exId of t.checked) {
      if (!P.exercises[exId] || seen.has(exId)) continue;
      seen.add(exId);
      html += `<div class="cline">✓ ${P.exercises[exId].name}</div>`;
    }
    html += '</div>';
  }
  det.innerHTML = html;
}

// ---- Staleness banner ----
let bannerDismissed = false;
let lastBackupAt = 0;

function lastChangeAt() {
  let t = 0;
  for (const h of HIST) if (h.label === 'edit' && h.ts > t) t = h.ts;
  return t;
}

function daysSince(ts) { return Math.floor((Date.now() - ts) / 864e5); }

function updateBanner() {
  const el = $('banner');
  const changed = lastChangeAt();
  const unsaved = changed > lastBackupAt;
  const age = lastBackupAt ? daysSince(lastBackupAt) : daysSince(changed || Date.now());
  const show = !bannerDismissed && changed > 0 && unsaved && age >= STALE_DAYS;
  el.classList.toggle('hidden', !show);
  if (show) {
    el.textContent = lastBackupAt
      ? `Last backup ${age} days ago — tap to back up`
      : `Never backed up — tap to back up`;
  }
}

function renderBackupState() {
  $('backupState').textContent = lastBackupAt
    ? `Last backup ${fmtDate(lastBackupAt)} (${daysSince(lastBackupAt)}d ago) · ${HIST.length} history entries`
    : `Never backed up · ${HIST.length} history entries`;
}

function openData() {
  renderBackupState();
  $('pasteWrap').classList.add('hidden');
  $('pasteBox').value = '';
  $('dataOverlay').classList.remove('hidden');
}
function closeData() { $('dataOverlay').classList.add('hidden'); }

// ---- Wire up ----
$('saveEdit').onclick = saveEdit;
$('cancelEdit').onclick = closeEdit;
$('delSet').onclick = deleteSet;
$('closeHist').onclick = () => $('histOverlay').classList.add('hidden');
// The click synthesized at the end of a long-press lands on the overlay that just
// appeared under the pointer — ignore background clicks in the first 400ms.
$('editOverlay').onclick = e => { if (e.target === $('editOverlay') && Date.now() - editOpenedAt > 400) closeEdit(); };
$('actDone').onclick = async () => { const id = actCtx; closeActions(); await toggleDoneEx(id); };
$('actBump').onclick = async () => { const id = actCtx; closeActions(); await applyBump(id); };
$('actUp').onclick = () => moveEx(actCtx, -1);   // sheet stays open for repeated taps
$('actDown').onclick = () => moveEx(actCtx, +1);
$('actRemove').onclick = async () => { const id = actCtx; closeActions(); await removeEx(id); };
$('actCancel').onclick = closeActions;
$('actOverlay').onclick = e => { if (e.target === $('actOverlay') && Date.now() - actOpenedAt > 400) closeActions(); };
$('histOverlay').onclick = e => { if (e.target === $('histOverlay')) $('histOverlay').classList.add('hidden'); };
$('eraseAll').onclick = async () => {
  if (!confirm('Erase the program and ALL history from this device?\n\nMake sure you have a backup first — there is no undo.')) return;
  await wipe();
  location.reload();
};

$('dataBtn').onclick = openData;
$('calBtn').onclick = openCal;
$('closeCal').onclick = () => $('calOverlay').classList.add('hidden');
$('calOverlay').onclick = e => { if (e.target === $('calOverlay')) $('calOverlay').classList.add('hidden'); };
$('calPrev').onclick = () => { calM--; if (calM < 0) { calM = 11; calY--; } renderCal(); };
$('calNext').onclick = () => { calM++; if (calM > 11) { calM = 0; calY++; } renderCal(); };
$('calGrid').onclick = e => {
  const c = e.target.closest('.ccell');
  if (c && c.dataset.key) { calSelected = c.dataset.key; renderCal(); }
};
$('closeData').onclick = closeData;
$('dataOverlay').onclick = e => { if (e.target === $('dataOverlay')) closeData(); };
$('banner').onclick = () => { bannerDismissed = true; updateBanner(); openData(); };
$('doBackup').onclick = doBackup;
$('doNote').onclick = doNoteExport;
$('doImportFile').onclick = () => $('fileInput').click();
$('fileInput').onchange = async e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) await restoreFromText(await f.text());
};
$('doImportPaste').onclick = () => {
  $('pasteWrap').classList.remove('hidden');
  $('pasteBox').focus();
};
$('pasteCancel').onclick = () => $('pasteWrap').classList.add('hidden');
$('pasteGo').onclick = () => restoreFromText($('pasteBox').value.trim());

// ---- PWA ----
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Ask the browser to shield IndexedDB from storage-pressure eviction. Best-effort;
// installed home-screen apps usually get it without asking.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

init();
