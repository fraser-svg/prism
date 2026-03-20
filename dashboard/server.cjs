#!/usr/bin/env node

// Prism Dashboard Server
// Serves the dashboard and proxies .prism/ file reads via a simple API.
// Usage: node server.js [--port 3333] [--prism-dir /path/to/.prism]

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- Args ---
const args = process.argv.slice(2);
function getArg(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(getArg('--port', '3333'), 10);
const PRISM_DIR = path.resolve(getArg('--prism-dir', path.join(process.cwd(), '.prism')));
const DASHBOARD_DIR = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

// --- Server ---
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS (for iframe and local dev)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: read state.json
  if (pathname === '/api/state') {
    const file = path.join(PRISM_DIR, 'state.json');
    return serveFile(res, file, 'application/json');
  }

  // API: read history.jsonl
  if (pathname === '/api/history') {
    const file = path.join(PRISM_DIR, 'history.jsonl');
    return serveFile(res, file, 'text/plain');
  }

  // API: chat (GET = read, POST = append user message)
  if (pathname === '/api/chat') {
    const chatFile = path.join(PRISM_DIR, 'chat.jsonl');

    if (req.method === 'POST') {
      return readBody(req, (err, body) => {
        if (err) { res.writeHead(400); return res.end('Bad request'); }
        try {
          const data = JSON.parse(body);
          const text = (data.text || '').trim();
          if (!text) { res.writeHead(400); return res.end('Empty message'); }
          const entry = JSON.stringify({
            ts: new Date().toISOString(),
            from: 'user',
            text: text
          }) + '\n';
          fs.appendFile(chatFile, entry, (err) => {
            if (err) { res.writeHead(500); return res.end('Write error'); }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          });
        } catch {
          res.writeHead(400);
          res.end('Invalid JSON');
        }
      });
    }

    // GET
    return serveFile(res, chatFile, 'text/plain');
  }

  // API: story — product journey assembled from history + state
  if (pathname === '/api/story') {
    const stateFile = path.join(PRISM_DIR, 'state.json');
    const historyFile = path.join(PRISM_DIR, 'history.jsonl');

    return buildStory(stateFile, historyFile, (err, story) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(story));
    });
  }

  // API: read intent.md
  if (pathname === '/api/intent') {
    const file = path.join(PRISM_DIR, 'intent.md');
    return serveFile(res, file, 'text/plain');
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(DASHBOARD_DIR, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(DASHBOARD_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const ext = path.extname(filePath);
  serveFile(res, filePath, MIME[ext] || 'text/plain');
});

function readBody(req, cb) {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 64 * 1024) { cb(new Error('Too large')); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => cb(null, Buffer.concat(chunks).toString()));
  req.on('error', cb);
}

function buildStory(stateFile, historyFile, cb) {
  // Read both files in parallel
  let stateData = null;
  let historyLines = [];
  let pending = 2;
  let failed = false;

  function done() {
    if (failed) return;
    if (--pending > 0) return;

    // Extract sessions from state
    const sessions = (stateData && stateData.sessions) ? stateData.sessions : [];

    // Parse history entries
    const entries = [];
    for (const line of historyLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { entries.push(JSON.parse(trimmed)); } catch (_) { /* skip malformed */ }
    }

    // Build milestones from significant events
    const milestones = [];
    for (const e of entries) {
      const action = (e.action || '').toLowerCase();
      const text = e.action || '';
      const ts = e.ts || '';

      // Vision captured
      if (action.includes('vision') || action.includes('intent captured') || action.includes('brief confirmed')) {
        milestones.push({ ts, type: 'vision', text: text });
      }
      // Feature completions
      else if (action.includes('feature complete') || action.includes('feature built') || action.includes('magic moment') || (action.includes('built') && e.feature)) {
        milestones.push({ ts, type: 'feature', text: e.feature ? `Built: ${e.feature}` : text });
      }
      // Stage transitions
      else if (action.includes('enter') && (action.includes('creating') || action.includes('polishing') || action.includes('shipping') || action.includes('done'))) {
        milestones.push({ ts, type: 'stage', text: text });
      }
      // Ship events
      else if (action.includes('ship') || action.includes('deploy') || action.includes('launched') || action.includes('went live')) {
        milestones.push({ ts, type: 'ship', text: text });
      }
    }

    // Compute stats
    const totalActions = entries.length;
    const featuresBuilt = (stateData && typeof stateData.features_built === 'number')
      ? stateData.features_built
      : milestones.filter(m => m.type === 'feature').length;

    let firstAction = null;
    let lastAction = null;
    let daysActive = 0;

    if (entries.length > 0) {
      const timestamps = entries.map(e => e.ts).filter(Boolean).sort();
      firstAction = timestamps[0] || null;
      lastAction = timestamps[timestamps.length - 1] || null;

      if (firstAction && lastAction) {
        const msPerDay = 86400000;
        const diffMs = new Date(lastAction).getTime() - new Date(firstAction).getTime();
        daysActive = Math.max(1, Math.ceil(diffMs / msPerDay));
      }
    }

    cb(null, {
      sessions,
      milestones,
      stats: {
        total_actions: totalActions,
        features_built: featuresBuilt,
        days_active: daysActive,
        first_action: firstAction,
        last_action: lastAction,
      }
    });
  }

  // Read state.json
  fs.readFile(stateFile, 'utf8', (err, raw) => {
    if (!err) {
      try { stateData = JSON.parse(raw); } catch (_) { /* ignore parse errors */ }
    }
    done();
  });

  // Read history.jsonl
  fs.readFile(historyFile, 'utf8', (err, raw) => {
    if (!err && raw) {
      historyLines = raw.split('\n');
    }
    done();
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        return res.end('Not found');
      }
      res.writeHead(500);
      return res.end('Server error');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

server.listen(PORT, () => {
  console.log(`\n  ◆ Prism Dashboard`);
  console.log(`    http://localhost:${PORT}`);
  console.log(`    Reading from: ${PRISM_DIR}\n`);
});
