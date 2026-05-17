// AI Course Tracker — tiny local server.
//
// Purpose:
//   - Serve the 17 worksheet HTML pages (plus index, styles, progress.js) on localhost:3000.
//   - Persist checkbox state to progress.js on disk every time you tick or untick a box.
//   - Auto-shut-down once you close the last tracker tab, so it doesn't hang around.
//
// How it stays alive:
//   - Every open tracker tab POSTs /api/heartbeat every 5 seconds (registered by random session id).
//   - The server prunes sessions that haven't checked in for 30 seconds.
//   - When sessions hit zero, the server schedules its own shutdown 30 seconds later.
//     If a tab reconnects in that window, the shutdown is cancelled.
//   - Tabs also fire navigator.sendBeacon('/api/goodbye') on close, so shutdown can happen sooner.
//
// Run: `node server.js` (or `npm start`). No external dependencies — uses Node built-ins only.

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const ROOT = __dirname;
const PROGRESS_FILE = path.join(ROOT, 'progress.js');
const HEARTBEAT_TIMEOUT_MS = 30_000;
const IDLE_SHUTDOWN_MS = 30_000;
const CHECK_INTERVAL_MS = 5_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.md':   'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
  '.txt':  'text/plain; charset=utf-8',
};

const sessions = new Map(); // sessionId -> last-seen timestamp
let shutdownTimer = null;

function readProgress() {
  const text = fs.readFileSync(PROGRESS_FILE, 'utf8');
  const m = text.match(/window\.PROGRESS\s*=\s*(\{[\s\S]*?\n\});/);
  if (!m) return {};
  return new Function('return ' + m[1])();
}

function writeProgress(progress) {
  const text = fs.readFileSync(PROGRESS_FILE, 'utf8');
  const slugs = Object.keys(progress).sort();
  const lines = slugs.map((slug) => {
    const blocks = progress[slug] || {};
    const keys = Object.keys(blocks).map(Number).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    const parts = keys.filter((k) => blocks[k] === true).map((k) => `${k}: true`).join(', ');
    const pad = ' '.repeat(Math.max(1, 25 - slug.length));
    return `  '${slug}':${pad}{ ${parts} },`;
  });
  const newBlock = `window.PROGRESS = {\n${lines.join('\n')}\n};`;
  const updated = text.replace(/window\.PROGRESS\s*=\s*\{[\s\S]*?\n\};/, newBlock);
  fs.writeFileSync(PROGRESS_FILE, updated, 'utf8');
}

function pruneSessions() {
  const now = Date.now();
  for (const [id, ts] of sessions) {
    if (now - ts > HEARTBEAT_TIMEOUT_MS) sessions.delete(id);
  }
}

function scheduleIdleCheck() {
  setInterval(() => {
    pruneSessions();
    if (sessions.size === 0) {
      if (!shutdownTimer) {
        console.log(`No active tabs. Server will shut down in ${IDLE_SHUTDOWN_MS / 1000}s if none reconnect.`);
        shutdownTimer = setTimeout(() => {
          console.log('Shutting down (idle).');
          process.exit(0);
        }, IDLE_SHUTDOWN_MS);
      }
    } else if (shutdownTimer) {
      console.log('Tab reconnected — cancelling shutdown.');
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  }, CHECK_INTERVAL_MS);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && parsed.pathname === '/api/progress') {
    try {
      const body = await readBody(req);
      const { slug, block, done } = JSON.parse(body);
      if (!slug || block == null) return jsonResponse(res, 400, { error: 'slug and block required' });
      const progress = readProgress();
      if (!progress[slug]) progress[slug] = {};
      if (done) progress[slug][block] = true;
      else delete progress[slug][block];
      writeProgress(progress);
      console.log(`progress.${slug}.${block} = ${done}`);
      return jsonResponse(res, 200, { ok: true, slug, block, done });
    } catch (err) {
      return jsonResponse(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST' && parsed.pathname === '/api/heartbeat') {
    try {
      const body = await readBody(req);
      const { id } = JSON.parse(body);
      if (id) {
        const isNew = !sessions.has(id);
        sessions.set(id, Date.now());
        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
          shutdownTimer = null;
          console.log('Shutdown cancelled — tab reconnected.');
        }
        if (isNew) console.log(`New tab connected (${sessions.size} active).`);
      }
      res.writeHead(204);
      return res.end();
    } catch {
      res.writeHead(400);
      return res.end();
    }
  }

  if (req.method === 'POST' && parsed.pathname === '/api/goodbye') {
    try {
      const body = await readBody(req);
      const { id } = JSON.parse(body);
      if (id && sessions.delete(id)) console.log(`Tab closed (${sessions.size} active).`);
      res.writeHead(204);
      return res.end();
    } catch {
      res.writeHead(400);
      return res.end();
    }
  }

  // Static files
  let relPath = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  let filePath = path.join(ROOT, decodeURIComponent(relPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found: ' + parsed.pathname);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} already in use — assuming tracker server is already running. Exiting.`);
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`AI Course Tracker server: http://localhost:${PORT}/`);
  console.log(`Auto-shuts down ~${(HEARTBEAT_TIMEOUT_MS + IDLE_SHUTDOWN_MS) / 1000}s after the last tab closes.`);
  scheduleIdleCheck();
});
