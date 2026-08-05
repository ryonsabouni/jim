# Jim

A local-first workout tracker, built to replace the Apple Note I'd been logging lifts in for ~8 years.

It keeps the habit that actually works — one screen per training day, current working weights, edited in place —
and fixes the thing Notes couldn't do: every edit is quietly versioned, so the history accumulates instead of
being overwritten.

## Why not a normal workout app

The note is edited, not appended. Nobody wants to "start a workout session" and tap through a wizard mid-set.
The app mirrors the note: exercises with their current weights, tap a number to change it. History happens for free.

## Status

Working prototype (vanilla JS + IndexedDB, no build step, no dependencies).

The app ships **empty**: no program is embedded in the source. First run offers a restore
from a backup file; the owner's program and history live in their backups and on their
devices, never in this repo.

- Training days as tabs (chest, back, shoulders, legs/PT, abs in the original)
- Sets shown in the original notation — `70(8)`, `+45×8`, `70→30`, `60s`
- Tap a set to edit; long-press a card for **Mark complete** / **Bump** (the ladder advances one rung)
- `last: 60, 65, 70(8) · Jul 22` per exercise, with a ↑ hint when the last session hit the rep target
- Per-exercise history, one entry per training day
- Everything stored locally in IndexedDB
- Backup to a dated JSON via the share sheet (append it to a note as a new attachment each
  time — old restore points stay alive), restore from file or pasted text, note-format export
- Installable PWA: manifest, icons, service worker (network-first with offline fallback)

Not built yet: hosting, calendar view, per-type icons in the day tabs.

## Notation

Bare weight means the usual rep target (10) was hit; parentheses record a session that missed it.

| Written | Means |
| --- | --- |
| `60, 65, 70` | three sets, one weight each, target reps |
| `70(8)` | 70 for 8 reps — under target |
| `+45×8` | bodyweight plus 45, 8 reps |
| `70→30` | drop set |
| `60s` | timed set |

## Running it

```
python3 devserver.py
```

Then open http://localhost:8743. The dev server exists only to serve the files with no-store headers;
the app itself is static.

## Layout

```
index.html, style.css, app.js   the app
manifest.webmanifest, sw.js     PWA shell (service worker is network-first, cache fallback)
icon-*.png, apple-touch-icon…   app icons, generated — do not edit by hand
devserver.py                    local static server
mockup-*.html                   design comparisons (not part of the app)
tools/gen_*.js                  node generators for the mockups and the icon
```

Mockups and icons are generated — edit the generator in `tools/` and re-run it, don't hand-edit
the output. Mockups are deliberately JavaScript-free so they render in any viewer. To regenerate
icons after changing `tools/gen_icon.js`:

```
node tools/gen_icon.js
sips -z 512 512 tools/icon-1024.png --out icon-512.png
sips -z 192 192 tools/icon-1024.png --out icon-192.png
sips -z 180 180 tools/icon-1024.png --out apple-touch-icon.png
```
