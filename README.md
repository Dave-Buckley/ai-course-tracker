# AI Course Tracker

Personal study hub for the 18-month AI/SE pivot. The HTML page is a daily landing pad — local clickable hub on desktop, public read-only view on GitHub Pages.

- **Live URL**: https://dave-buckley.github.io/ai-course-tracker/
- **Local file**: `C:\Users\David\Documents\AI Course\AI Course - Today.html` (with working `file://` buttons for local actions)
- **Master roadmap**: `AI Projects/GSD Sessions/AI Career/.planning/LEARNING_ROADMAP.md`

## How it updates

Claude refreshes `index.html` (and the local copy) whenever a Claude session starts in the AI Career project — current focus, progress table, "right now" block.

## Worksheet block progress

The tracker now runs as a tiny local server so checkbox ticks save straight to disk.

**Start it**: double-click `start-tracker.bat` (or set that as your desktop shortcut target). It:
1. Starts `server.js` on `http://localhost:3000` if it isn't already running (Node built-ins only, no deps).
2. Opens the course hub in your default browser.
3. Auto-shuts down ~60 seconds after you close the last tracker tab (lifeline pattern: every open tab heartbeats the server every 5s; if no heartbeats for 30s the server schedules its own exit 30s later).

**While running**, ticking a checkbox POSTs `{slug, block, done}` to `/api/progress`, which rewrites `progress.js` on disk. The page also writes `localStorage` first for instant UI feedback, then clears that entry once the server confirms — so disk stays the single source of truth.

**Offline fallback**: if you somehow load a worksheet over `file://` instead of `http://localhost:3000/`, the page detects the non-HTTP origin and keeps the older localStorage-only behaviour. The "Reset tracker to canonical state" link at the bottom of each worksheet clears those local overrides so the disk state takes over again.

**For Claude (manual edits)**: edit `progress.js` directly — set `window.PROGRESS['<slug>'][<blockNum>] = true`. The server reads/writes this object in place; never edit the HTML files for progress changes.

## Note on buttons

The quick-action buttons use `file://` URLs that resolve to David's local Documents folder. They work from the local desktop hub. They don't work from the public Pages URL — the Pages version is for read-only progress glance from any device.

## License

Personal project. No license; all content is private study material made public for accountability.
