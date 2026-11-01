import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { buildStatements, matchCompany, yearLabel } from '../src/planner/sec.js';
import { validate, summarize, cashFlowRatios } from '../src/planner/engine.js';
import { createApp } from '../server.js';
import { make, Y } from './fixtures/acme.js';

test('three fiscal years come out oldest first, labelled by year end', () => {
  const r = buildStatements(make());
  assert.equal(r.error, undefined);
  assert.deepEqual(r.years.map((y) => y.label), ['Sep 2023', 'Sep 2024', 'Sep 2025']);
  assert.equal(r.company.cik, '0001234567');
});

test('a renamed revenue tag still reads, and the latest filing wins for a restated year', () => {
  const r = buildStatements(make());
  assert.deepEqual(r.years.map((y) => y.sales), [1000, 1100, 1250]);
});

test('the latest cover-page share count is read', () => {
  const r = buildStatements(make());
  assert.equal(r.shares, 500000);
  assert.equal(r.sharesAsOf, '2025-10-20');
  assert.match(r.notes.join(' '), /Shares outstanding/);
  const f = make(); delete f.facts.dei;
  assert.equal(buildStatements(f).shares, null);
});

test('quarterly and 10-Q facts are ignored', () => {
  const r = buildStatements(make());
  assert.ok(!r.years.some((y) => y.sales === 999999 || y.end === '2025-06-28'));
});

test('every year balances by construction and net income matches the filing', () => {
  const r = buildStatements(make());
  r.years.forEach((y, i) => {
    assert.deepEqual(validate(y), [], y.label);
    assert.ok(Math.abs(summarize(y).netIncome - Y[i].ni) < 1e-9, `${y.label} net income`);
  });
});

test('derived lines are the tagged subtotal minus the tagged parts', () => {
  const y = buildStatements(make()).years[2];
  assert.equal(y.otherCurrentAssets, 800 - 300 - 250 - 150);
  assert.equal(y.otherNonCurrentAssets, 2000 - 800 - 900);
  assert.equal(y.otherCurrentLiabilities, 400 - 200 - 50);
  assert.equal(y.otherLongTermLiabilities, (2000 - 900) - 400 - 500);
  assert.equal(y.commonStock, 200);
  assert.equal(y.otherEquity, 900 - 200 - 800);
  assert.equal(y.notesPayable, 50);
});

test('EBIT is pre-tax income plus interest, so operating cost is the remainder', () => {
  const y = buildStatements(make()).years[2];
  const s = summarize(y);
  assert.equal(s.ebit, 280 + 25);
  assert.equal(y.opex, 1250 - 720 - 60 - 305);
});

test('cash flow lines and free cash flow come from the cash flow tags', () => {
  const y = buildStatements(make()).years[2];
  assert.equal(y.cf.cfo, 260);
  assert.equal(y.cf.capex, 80);
  assert.equal(y.cf.fcf, 180);
  const r = cashFlowRatios(y, y.cf);
  assert.equal(r.fcf, 180);
  assert.ok(Math.abs(r.fcfMargin - 180 / 1250) < 1e-12);
  assert.ok(Math.abs(r.cashConversion - 260 / 224) < 1e-12);
});

test('tags that are missing are reported, not invented', () => {
  const f = make();
  delete f.facts['us-gaap'].PaymentsOfDividends;            // missing in every year
  f.facts['us-gaap'].InventoryNet.units.USD.shift();         // missing in the oldest year only
  const r = buildStatements(f);
  assert.deepEqual(r.notFound, ['Dividends paid']);
  assert.ok(r.years.every((y) => y.dividends === 0));
  assert.equal(r.years[0].inventory, 0);
  assert.equal(r.years[1].inventory, 140);
  const text = r.notes.join(' ');
  assert.match(text, /Not tagged in any year, set to zero: Dividends paid/);
  assert.match(text, /Not tagged in some years, set to zero there: Inventory \(Sep 2023\)/);
  r.years.forEach((y) => assert.deepEqual(validate(y), [], y.label));
});

test('asking for fewer years returns the most recent ones', () => {
  const r = buildStatements(make(), { years: 2 });
  assert.deepEqual(r.years.map((y) => y.label), ['Sep 2024', 'Sep 2025']);
});

test('a filer with no US GAAP data gets a plain error', () => {
  assert.match(buildStatements({ facts: { 'ifrs-full': {} } }).error, /US GAAP/);
  assert.match(buildStatements({ facts: { 'us-gaap': { Assets: { units: { USD: [] } } } } }).error, /revenue/);
});

test('a reported net income gap is flagged', () => {
  const f = make();
  f.facts['us-gaap'].NetIncomeLoss.units.USD[2].val = 150; // filing says 150, lines rebuild 224
  assert.match(buildStatements(f).notes.join(' '), /net income rebuilt/);
});

test('year labels and company matching', () => {
  assert.equal(yearLabel('2025-01-31'), 'Jan 2025');
  const t = { 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' }, 1: { cik_str: 1, ticker: 'APLE', title: 'Apple Hospitality REIT, Inc.' }, 2: { cik_str: 789019, ticker: 'MSFT', title: 'MICROSOFT CORP' } };
  assert.equal(matchCompany(t, 'aapl')[0].ticker, 'AAPL');
  assert.equal(matchCompany(t, '320193')[0].cik, '0000320193');
  assert.deepEqual(matchCompany(t, 'apple').map((m) => m.ticker), ['AAPL', 'APLE']);
  assert.equal(matchCompany(t, 'zzzz').length, 0);
});

// ---------------------------------------------------------------- server

const TICKERS = { 0: { cik_str: 1234567, ticker: 'ACME', title: 'ACME INC' }, 1: { cik_str: 7654321, ticker: 'ACRN', title: 'ACORN CORP' } };

function fakeFetch(log, status = 200) {
  return async (url) => {
    log.push(url);
    if (status !== 200) return { ok: false, status, json: async () => ({}) };
    if (url.includes('company_tickers')) return { ok: true, status: 200, json: async () => TICKERS };
    return { ok: true, status: 200, json: async () => make() };
  };
}

async function withServer(opts, fn) {
  const app = createApp({ minGapMs: 0, ...opts });
  const srv = createServer(app.handler);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try { await fn(base, app); } finally { await new Promise((r) => srv.close(r)); }
}

test('server: ticker lookup returns statements, and a second call is served from cache', async () => {
  const log = [];
  await withServer({ fetchImpl: fakeFetch(log), userAgent: 'Test test@example.com' }, async (base) => {
    const a = await (await fetch(`${base}/api/company?q=acme`)).json();
    assert.equal(a.company.ticker, 'ACME');
    assert.equal(a.years.length, 3);
    assert.match(a.source, /CIK=0001234567/);
    await fetch(`${base}/api/company?q=ACME`);
    assert.equal(log.filter((u) => u.includes('companyfacts')).length, 1);
    assert.ok(log.every((u) => u.startsWith('https://www.sec.gov/') || u.startsWith('https://data.sec.gov/')));
  });
});

test('server: a vague name returns choices instead of guessing', async () => {
  await withServer({ fetchImpl: fakeFetch([]), userAgent: 'Test test@example.com' }, async (base) => {
    const r = await (await fetch(`${base}/api/company?q=ac`)).json();
    assert.deepEqual(r.choices.map((c) => c.ticker).sort(), ['ACME', 'ACRN']);
    const pick = await (await fetch(`${base}/api/company?cik=${r.choices[0].cik}`)).json();
    assert.ok(pick.years);
  });
});

test('server: refuses to call SEC without a user agent, and explains', async () => {
  const log = [];
  await withServer({ fetchImpl: fakeFetch(log), userAgent: '' }, async (base) => {
    const res = await fetch(`${base}/api/company?q=acme`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /SEC_USER_AGENT/);
    assert.equal(log.length, 0);
  });
});

test('server: unknown company is a 404, SEC refusal is a clear 502', async () => {
  await withServer({ fetchImpl: fakeFetch([]), userAgent: 'Test test@example.com' }, async (base) => {
    assert.equal((await fetch(`${base}/api/company?q=zzzzzz`)).status, 404);
  });
  await withServer({ fetchImpl: fakeFetch([], 403), userAgent: 'Test test@example.com' }, async (base) => {
    const res = await fetch(`${base}/api/company?q=acme`);
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /SEC_USER_AGENT/);
  });
});

test('server: serves web and src, nothing else', async () => {
  await withServer({ fetchImpl: fakeFetch([]), userAgent: 'x' }, async (base) => {
    assert.equal((await fetch(`${base}/src/planner/sec.js`)).status, 200);
    assert.equal((await fetch(`${base}/web/`)).status, 200);
    assert.equal((await fetch(`${base}/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/%2e%2e/server.js`)).status, 404);
    assert.equal((await fetch(`${base}/package.json`)).status, 404);
  });
});

test('a bank is refused instead of being graded like an industrial company', () => {
  const f = make();
  f.facts['us-gaap'].Deposits = { units: { USD: [{ end: '2025-09-27', val: 5e9, form: '10-K', fp: 'FY', filed: '2025-11-03' }] } };
  const r = buildStatements(f);
  assert.match(r.error, /bank or insurer/);
});

test('several share classes on the same cover date leave shares blank with a note', () => {
  const f = make();
  f.facts.dei = { EntityCommonStockSharesOutstanding: { units: { shares: [
    { end: '2025-10-20', val: 1400000, form: '10-K', filed: '2025-11-03' },
    { end: '2025-10-20', val: 2200000000, form: '10-K', filed: '2025-11-03' },
  ] } } };
  const r = buildStatements(f);
  assert.equal(r.shares, null);
  assert.ok(r.notes.some((n) => /several share classes/.test(n)));
});

test('a stale cover-page share count is dropped instead of valuing the company on it', () => {
  const f = make();
  f.facts.dei = { EntityCommonStockSharesOutstanding: { units: { shares: [{ end: '2011-04-29', val: 941000, form: '10-K', filed: '2011-05-01' }] } } };
  const r = buildStatements(f);
  assert.equal(r.shares, null);
  assert.ok(r.notes.some((n) => /only share count on file is from 2011-04-29/.test(n)));
});

test('bank detection ignores old tags and catches current ones', async () => {
  const { make } = await import('./fixtures/acme.js');
  const old = make(); old.facts['us-gaap'].Deposits = { units: { USD: [{ end: '2015-09-30', val: 5, fy: 2015, fp: 'FY', form: '10-K', filed: '2015-11-01' }] } };
  assert.ok(!buildStatements(old, { years: 3 }).error, 'a ten-year-old Deposits tag must not refuse the company');
  const now = make(); now.facts['us-gaap'].Deposits = { units: { USD: [{ end: '2025-09-27', val: 5, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-11-03' }] } };
  assert.match(buildStatements(now, { years: 3 }).error, /bank or insurer/);
});

test('cost of sales that already holds depreciation is split, EBIT and net income stay as filed', async () => {
  const { make } = await import('./fixtures/acme.js');
  const f = make();
  // Cost of revenue 700 already includes the 60 of depreciation: pretax 280 + interest 25 = EBIT 305, so sales 1250 - 305 = 945 total cost.
  f.facts['us-gaap'].CostOfRevenue.units.USD.find((r) => r.end === '2025-09-27').val = 900;
  const y = buildStatements(f, { years: 3 }).years.at(-1);
  assert.equal(y.opex, 0);
  assert.equal(y.cogs + y.opex + y.depreciation, 1250 - 305);
  assert.ok(buildStatements(f, { years: 3 }).notes.some((n) => /appears to include depreciation/.test(n)));
});

test('net income check accepts continuing-operations income, so minority interest and discontinued operations are not flagged', async () => {
  const { make } = await import('./fixtures/acme.js');
  const f = make();
  const us = f.facts['us-gaap'];
  const row = (v) => ({ start: '2024-09-29', end: '2025-09-27', val: v, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-11-03' });
  us.NetIncomeLoss.units.USD.find((r) => r.end === '2025-09-27').val = 500; // parent income after a big discontinued gain
  us.IncomeLossFromContinuingOperations = { units: { USD: [row(224)] } };
  assert.ok(!buildStatements(f, { years: 3 }).notes.some((n) => /net income rebuilt/.test(n)));
  delete us.IncomeLossFromContinuingOperations;
  assert.ok(buildStatements(f, { years: 3 }).notes.some((n) => /net income rebuilt/.test(n)), 'with no matching figure it must still flag');
});

test('a holding company with no history points at its predecessor', async () => {
  const { factsCik } = await import('../src/planner/sec.js');
  assert.equal(factsCik('0002115436'), '0000034088');
  assert.equal(factsCik('0000320193'), '0000320193');
});

test('partnerships report partners capital, and a missing pre-tax tag is derived from net income plus tax', async () => {
  const { make } = await import('./fixtures/acme.js');
  const f = make(); const us = f.facts['us-gaap'];
  us.PartnersCapital = us.StockholdersEquity; delete us.StockholdersEquity;
  delete us.IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest;
  delete us.IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments;
  us.ProfitLoss = us.NetIncomeLoss;
  const out = buildStatements(f, { years: 3 });
  assert.ok(!out.error, 'partners capital must count as equity');
  assert.equal(out.years.length, 3);
  assert.ok(out.notes.some((n) => /Pre-tax income is not tagged/.test(n)));
  assert.ok(!out.notes.some((n) => /net income rebuilt/.test(n)), 'derived pre-tax reproduces net income');
});
