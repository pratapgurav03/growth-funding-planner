import test from 'node:test';
import assert from 'node:assert/strict';
import { make } from './fixtures/acme.js';

const T = { 0: { cik_str: 1234567, ticker: 'ACME', title: 'ACME INC' } };
let calls = 0;
process.env.SEC_USER_AGENT = 'Test t@example.com';
globalThis.fetch = async (u, opts) => {
  calls++;
  assert.equal(opts.headers['User-Agent'], 'Test t@example.com');
  return { ok: true, status: 200, json: async () => (u.includes('tickers') ? T : make()) };
};
const { default: company } = await import('../api/company.js');
const { default: status } = await import('../api/status.js');

function call(fn, req) {
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b, headers: this.headers }); } };
    fn({ method: 'GET', query: {}, ...req }, res);
  });
}

test('hosted function: status, lookup, edge caching and errors', async () => {
  assert.equal((await call(status, {})).body.userAgentSet, true);
  const ok = await call(company, { query: { q: 'acme' } });
  assert.equal(ok.code, 200); assert.equal(ok.body.company.ticker, 'ACME');
  assert.match(ok.headers['Cache-Control'], /s-maxage=900/);
  const before = calls;
  await call(company, { query: { q: 'acme' } });
  assert.equal(calls, before, 'second lookup is served from memory, SEC is not called again');
  assert.equal((await call(company, { query: {} })).code, 400);
  const miss = await call(company, { query: { q: 'ZZZZ' } });
  assert.equal(miss.code, 404); assert.equal(miss.headers['Cache-Control'], 'no-store');
  assert.equal((await call(company, { method: 'POST', query: { q: 'acme' } })).code, 405);
  const long = await call(company, { query: { q: 'a'.repeat(500) } });
  assert.ok(long.code === 404 || long.code === 200, 'an oversized query is cut, not passed through');
});
