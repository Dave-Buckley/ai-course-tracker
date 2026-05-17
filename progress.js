// Canonical worksheet progress — source of truth for which blocks are done.
//
// How it works:
//   - The local tracker server (server.js) reads/writes this file.
//   - Open the tracker via http://localhost:3000/... (started by start-tracker.bat).
//   - Tick a box → page POSTs /api/progress → server updates the object below.
//   - If the server is offline, ticks fall back to localStorage and re-sync once
//     the server is reachable again (next page load with server up).
//
// To mark a block complete by hand: set its key to `true` below. Missing keys = false.

window.PROGRESS = {
  '01-git-hygiene':           { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true },
  '02-python-basics':         { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true, 9: true, 10: true },
  '03-c-quickstart':          {  },
  '04-python-intermediate':   {  },
  '05-dsa-patterns':          {  },
  '06-web-fundamentals':      {  },
  '07-typescript':            {  },
  '08-nextjs':                {  },
  '09-sql-postgres':          {  },
  '10-vercel-ai-sdk':         {  },
  '11-python-data-science':   {  },
  '12-ml-maths':              {  },
  '13-fastai-prep':           {  },
  '14-python-apis':           {  },
  '15-rag':                   {  },
  '16-agents':                {  },
  '17-mlops-docker':          {  },
};

// True when this page was loaded from the tracker server (http://localhost:3000)
// rather than directly from disk (file://). Disk loads can't POST — they fall back to localStorage.
const SERVER_MODE = typeof location !== 'undefined' && location.protocol.startsWith('http');

// One random ID per tab — used so the server knows which tabs are still alive.
function makeSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// POST that ignores transport errors so a tick never throws if the server is down.
function postJson(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Init helper used by every worksheet's inline script. Reads localStorage first
// (manual override), falls back to window.PROGRESS for that slug, then renders.
window.initTracker = function (slug) {
  const defaults = (window.PROGRESS && window.PROGRESS[slug]) || {};

  document.querySelectorAll('input[type="checkbox"][data-block]').forEach((cb) => {
    const key = `progress.${slug}.${cb.dataset.block}`;
    const stored = localStorage.getItem(key);
    cb.checked = stored !== null ? stored === '1' : defaults[cb.dataset.block] === true;
    cb.addEventListener('change', () => {
      const done = cb.checked;
      const block = Number(cb.dataset.block);
      localStorage.setItem(key, done ? '1' : '0');
      window.updateTrackerProgress();
      if (SERVER_MODE) {
        postJson('/api/progress', { slug, block, done })
          .then((r) => {
            if (r.ok) {
              // Server has the canonical record now — drop the local override.
              localStorage.removeItem(key);
            }
          })
          .catch(() => {
            // Server unreachable — localStorage holds the change until next sync.
          });
      }
    });
  });

  window.updateTrackerProgress();

  if (SERVER_MODE && !window.__trackerLifeline) {
    window.__trackerLifeline = true;
    const sessionId = makeSessionId();
    const heartbeat = () => postJson('/api/heartbeat', { id: sessionId }).catch(() => {});
    heartbeat();
    setInterval(heartbeat, 5000);
    window.addEventListener('beforeunload', () => {
      // sendBeacon survives the page tear-down so the server learns about the close.
      try {
        const blob = new Blob([JSON.stringify({ id: sessionId })], { type: 'application/json' });
        navigator.sendBeacon('/api/goodbye', blob);
      } catch {
        // best-effort: server will time the session out within ~30s anyway
      }
    });
  }
};

window.updateTrackerProgress = function () {
  const all = document.querySelectorAll('input[type="checkbox"][data-block]');
  const done = [...all].filter((c) => c.checked).length;
  const bar = document.querySelector('.progress-fill');
  if (bar) bar.style.width = `${all.length ? (done / all.length) * 100 : 0}%`;
};

// Reset all localStorage overrides for a worksheet, so the server/canonical state takes over.
window.resetTracker = function (slug) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(`progress.${slug}.`)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  location.reload();
};
