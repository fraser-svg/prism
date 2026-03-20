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
