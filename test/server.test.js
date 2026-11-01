import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../server.js';
import { make } from './fixtures/acme.js';

const T = { 0: { cik_str: 1234567, ticker: 'ACME', title: 'ACME INC' }, 1: { cik_str: 7654321, ticker: 'ACRN', title: 'ACORN CORP' } };
let mode = 'ok';
const fetchImpl = async (u) => {
  if (mode === 'down') throw new Error('getaddrinfo ENOTFOUND');
  if (mode === '403') return { ok: false, status: 403, json: async () => ({}) };
  if (mode === '404facts' && !u.includes('tickers')) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => (u.includes('tickers') ? T : make()) };
};

async function boot(userAgent = 'Test t@example.com', snapshot = null) {
  const app = createApp({ userAgent, minGapMs: 0, fetchImpl, snapshot });
  const srv = createServer(app.handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => srv.close() };
}
const get = async (base, path, method = 'GET') => { const r = await fetch(base + path, { method, redirect: 'manual' }); const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } return { status: r.status, text, json, headers: r.headers }; };

test('API: status, validation and lookups', async () => {
  const s = await boot();
  try {
    assert.equal((await get(s.base, '/api/status')).json.userAgentSet, true);
    assert.equal((await get(s.base, '/api/company')).status, 400);
    assert.equal((await get(s.base, '/api/company?q=%20')).status, 400);
    const ok = await get(s.base, '/api/company?q=acme');
    assert.equal(ok.status, 200); assert.equal(ok.json.years.length, 3);
    assert.equal((await get(s.base, '/api/company?cik=0001234567')).status, 200);
    assert.equal((await get(s.base, '/api/company?cik=999')).status, 404);
    assert.equal((await get(s.base, '/api/company?q=ZZZZ')).status, 404);
    const many = await get(s.base, '/api/company?q=ac');
    assert.ok(Array.isArray(many.json.choices) && many.json.choices.length === 2);
    for (const y of ['0', 'abc', '-3', '99']) assert.equal((await get(s.base, `/api/company?q=ACME&years=${y}`)).status, 200);
    assert.equal((await get(s.base, '/api/company?q=ACME', 'POST')).status, 405);
  } finally { s.close(); }
});

test('API: refuses without a SEC identity', async () => {
  const s = await boot('');
  try {
    assert.equal((await get(s.base, '/api/status')).json.userAgentSet, false);
    assert.equal((await get(s.base, '/api/company?q=ACME')).status, 503);
  } finally { s.close(); }
});

test('API: upstream failures become clear 4xx/5xx messages, never a crash', async () => {
  for (const [m, status, re] of [['down', 502, /Could not reach SEC/], ['403', 502, /refused/], ['404facts', 404, /no XBRL/]]) {
    mode = m;
    const s = await boot();
    try { const r = await get(s.base, '/api/company?q=ACME'); assert.equal(r.status, status); assert.match(r.json.error, re); } finally { s.close(); mode = 'ok'; }
  }
});

test('static files: served from web and src only, traversal and bad URLs refused', async () => {
  const s = await boot();
  try {
    assert.equal((await get(s.base, '/web/standalone.html')).status, 200);
    assert.equal((await get(s.base, '/src/planner/sec.js')).status, 200);
    for (const p of ['/web/../server.js', '/web/..%2Fserver.js', '/web/%2e%2e/server.js', '/.sec-user-agent', '/package.json', '/.git/config']) {
      const r = await get(s.base, p); assert.equal(r.status, 404, p); assert.ok(!r.text.includes('createApp'), p);
    }
    assert.equal((await get(s.base, '/web/%E0%A4%A')).status, 400);
    assert.equal((await get(s.base, '/web')).status, 302);
    assert.equal((await get(s.base, '/')).status, 302);
    assert.equal((await get(s.base, '/nope')).status, 404);
  } finally { s.close(); }
});

test('offline snapshot: used only when SEC is unreachable, and labelled', async () => {
  const hit = { years: [], notes: ['n'], company: { name: 'ACME INC', ticker: 'ACME', cik: '0001234567' } };
  const snap = { generatedAt: '2026-10-31T10:00:00Z', index: [{ cik: '0001234567', ticker: 'ACME', title: 'ACME INC' }], companies: { '0001234567': hit } };
  const s = await boot('Test t@example.com', snap);
  try {
    mode = 'down';
    const off = await get(s.base, '/api/company?q=acme');
    assert.equal(off.status, 200); assert.equal(off.json.fromSnapshot, true);
    assert.match(off.json.notes[0], /saved copy from 2026-10-31/);
    assert.equal((await get(s.base, '/api/company?q=NOPE')).status, 502);
  } finally { mode = 'ok'; s.close(); }
  const live = await boot('Test t@example.com', snap); // SEC up: the live answer wins
  try { assert.equal((await get(live.base, '/api/company?q=acme')).json.fromSnapshot, undefined); } finally { live.close(); }
});
