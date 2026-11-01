// Local server: serves the web page and a small proxy to SEC EDGAR.
// The page cannot call data.sec.gov itself (no CORS headers), and SEC requires every client to
// identify itself, so the request goes through here.
//
//   SEC_USER_AGENT="Your Name your.email@example.com" npm run serve
//   open http://127.0.0.1:8787/web/
//
// No dependencies. Binds to 127.0.0.1 only. Needs Node 18+ for built-in fetch.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeCompanyApi, httpError } from './src/planner/company-api.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const DEFAULT_PAGE = '/web/';

// The SEC wants every client to name itself. Read it from the environment, else from a one-line
// file next to this script, so a double-click start works without typing anything.
export function loadUserAgent() {
  const env = (process.env.SEC_USER_AGENT || '').trim();
  if (env) return env;
  try { return readFileSync(new URL('./.sec-user-agent', import.meta.url), 'utf8').trim(); } catch { return ''; }
}

// Offline backup: a saved copy of popular filers, made by scripts/snapshot.mjs. Used only when SEC
// cannot be reached, and always labelled with its date so nobody mistakes it for live data.
export function loadSnapshot() {
  try { return JSON.parse(readFileSync(new URL('./data/snapshot.json', import.meta.url), 'utf8')); } catch { return null; }
}

export function createApp({ fetchImpl = fetch, userAgent = loadUserAgent(), now = () => Date.now(), minGapMs, snapshot = loadSnapshot() } = {}) {
  const api = makeCompanyApi({ fetchImpl, userAgent, now, minGapMs, snapshot });
  const { company, cache } = api;

  async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'GET only.' });
    try {
      if (url.pathname === '/api/status') return send(res, 200, { ok: true, userAgentSet: !!userAgent.trim() });
      if (url.pathname === '/api/company') { const out = await company(url.searchParams); console.log(`[${new Date().toLocaleTimeString()}] ${url.search} -> ok`); return send(res, 200, out); }
      if (url.pathname === '/' || url.pathname === '/web') { res.writeHead(302, { Location: DEFAULT_PAGE }); return res.end(); }
      return await serveStatic(url.pathname, res);
    } catch (e) {
      console.error(`[${new Date().toLocaleTimeString()}] ${req.url} -> ${e.status || 500}: ${e.message}`);
      return send(res, e.status || 500, { error: e.status ? e.message : `Server error: ${e.message}. Copy this line to whoever is helping you.` });
    }
  }

  return { handler, company, cache };
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(text);
}

async function serveStatic(pathname, res) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'Bad request.' }); }
  if (p.endsWith('/')) p += 'index.html';
  const file = resolve(ROOT, '.' + p);
  const allowed = [resolve(ROOT, 'web') + sep, resolve(ROOT, 'src') + sep];
  if (!allowed.some((a) => file.startsWith(a))) return send(res, 404, { error: 'Not found.' });
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'Not found.' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // 8787, not 8080: other tools often sit on 8080 and then the browser silently talks to them instead.
  const port = Number(process.env.PORT) || 8787;
  const app = createApp();
  const srv = createServer(app.handler);
  srv.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the other program, or run with PORT=<number>.` : e.message);
    process.exit(1);
  });
  srv.listen(port, '127.0.0.1', () => {
    console.log(`Growth Funding Planner: http://127.0.0.1:${port}${DEFAULT_PAGE}`);
    const ua = loadUserAgent();
    console.log(ua ? `SEC lookups on. Identifying as: ${ua}` : 'SEC lookups are off. Put "Your Name you@example.com" in a file named .sec-user-agent next to server.js, then restart.');
  });
}
