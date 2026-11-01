// Tests use the book's own worked examples, not the engine's own output.
// Ross, Westerfield & Jordan, Fundamentals of Corporate Finance, 12e, ch.4.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize, validate, ratios, dupont, proForma, efnCurve, zeroEfnGrowth,
  internalGrowthRate, sustainableGrowthRate, growthFromHistory, scenarioRates, insights,
} from '../src/planner/engine.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);

// Rosengarten Corporation, tables 4.1 and 4.3.
const rosengarten = {
  sales: 1000, cogs: 833, taxes: 35, dividends: 44,
  cash: 160, receivables: 440, inventory: 600, netFixedAssets: 1800,
  payables: 300, notesPayable: 100, longTermDebt: 800, commonStock: 800, retainedEarnings: 1000,
};
// Hoffman Company, table 4.6. Current assets and debt are single lines in the book.
const hoffman = {
  sales: 500, cogs: 416.5, taxes: 17.5, dividends: 22,
  otherCurrentAssets: 200, netFixedAssets: 300, longTermDebt: 250, retainedEarnings: 250,
};
// Skandia Mining, self-test problem 4.1.
const skandia = {
  sales: 4250, cogs: 3936.7, taxes: 65.8, dividends: 82.6,
  otherCurrentAssets: 900, netFixedAssets: 2200,
  otherCurrentLiabilities: 500, longTermDebt: 1800, retainedEarnings: 800,
};

test('base statements reproduce the book net income and balance', () => {
  near(summarize(rosengarten).netIncome, 132, 0.01);
  near(summarize(hoffman).netIncome, 66, 0.01);
  near(summarize(skandia).netIncome, 247.5, 0.01);
  assert.deepEqual(validate(rosengarten), []);
  assert.deepEqual(validate(hoffman), []);
  assert.deepEqual(validate(skandia), []);
});

test('Rosengarten: 25% growth needs $565 of external financing (table 4.4)', () => {
  const r = proForma(rosengarten, { growth: 0.25 });
  near(r.income.netIncome, 165, 0.01);
  near(r.income.addToRE, 110, 0.01);
  near(r.preSummary.totalAssets, 3750, 0.01);
  near(r.preSummary.totalLiabilitiesAndEquity, 3185, 0.01);
  near(r.efn, 565, 0.01);
});

test('Rosengarten: capacity use changes EFN to $115 at 70% and $340 at 90%', () => {
  near(proForma(rosengarten, { growth: 0.25, capacityUtilization: 0.7 }).efn, 115, 0.01);
  near(proForma(rosengarten, { growth: 0.25, capacityUtilization: 0.9 }).efn, 340, 0.01);
});

test('Hoffman: table 4.8 EFN and debt-equity at each growth rate', () => {
  const book = [
    [0.0, -44.0, 0.70], [0.05, -21.2, 0.77], [0.10, 1.6, 0.84],
    [0.15, 24.4, 0.91], [0.20, 47.2, 0.98], [0.25, 70.0, 1.05],
  ];
  const rows = efnCurve(hoffman, {}, book.map((b) => b[0]));
  rows.forEach((row, i) => {
    near(row.efn, book[i][1], 0.1, `EFN at ${book[i][0]}`);
    near(row.debtEquity, book[i][2], 0.01, `D/E at ${book[i][0]}`);
  });
});

test('Hoffman: internal growth 9.64% and sustainable growth 21.35%', () => {
  near(internalGrowthRate(hoffman), 0.0964, 0.0002);
  near(sustainableGrowthRate(hoffman), 0.2135, 0.0002);
});

test('Hoffman at the sustainable rate: EFN 53.4 and debt-equity 1.0 (example 4.2)', () => {
  const r = proForma(hoffman, { growth: 0.2135 });
  near(r.efn, 53.4, 0.15);
  near(ratios(r.projected).debtEquity, 1.0, 0.01);
});

test('Skandia: EFN 78.6 at 10% growth, and with 60% and 95% capacity', () => {
  near(proForma(skandia, { growth: 0.10 }).efn, 78.6, 0.15);
  near(proForma(skandia, { growth: 0.10, capacityUtilization: 0.6 }).efn, -141.4, 0.15);
  near(proForma(skandia, { growth: 0.10, capacityUtilization: 0.95 }).efn, -42.4, 0.15);
});

test('Skandia: internal growth 5.62% and sustainable growth 25.97%', () => {
  near(internalGrowthRate(skandia), 0.0562, 0.0002);
  near(sustainableGrowthRate(skandia), 0.2597, 0.0002);
});

test('the zero-EFN growth rate matches the internal growth formula when no liability moves with sales', () => {
  near(zeroEfnGrowth(hoffman), internalGrowthRate(hoffman), 0.0002);
});

test('with spontaneous liabilities the zero-EFN rate is higher than the formula', () => {
  assert.ok(zeroEfnGrowth(skandia) > internalGrowthRate(skandia) + 0.001);
});

test('after the financing plug the pro forma balance sheet balances', () => {
  for (const [base, g] of [[rosengarten, 0.25], [hoffman, 0.0], [hoffman, 0.3], [skandia, 0.1]]) {
    const r = proForma(base, { growth: g });
    near(r.projected.imbalance, 0, 1e-6);
  }
  // Surplus larger than all debt ends up as cash and still balances.
  const r = proForma(hoffman, { growth: 0, interest: 'flat' });
  near(r.projected.imbalance, 0, 1e-6);
});

test('a surplus retires debt before it becomes cash', () => {
  const r = proForma(hoffman, { growth: 0 });
  near(r.post.longTermDebt, 206, 0.01);
  near(r.financing.cash, 0, 1e-9);
});

test('lump-sum fixed asset purchase replaces proportional growth', () => {
  const lumpy = proForma(rosengarten, { growth: 0.25, fixedAssetStep: 450 });
  near(lumpy.efn, 565, 0.01); // same $450 as 25% of 1800, so unchanged
  const bigger = proForma(rosengarten, { growth: 0.25, fixedAssetStep: 1000 });
  near(bigger.efn, 565 + 550, 0.01);
});

test('interest held flat raises profit versus scaling it with sales', () => {
  const base = { ...rosengarten, interest: 50, cogs: 783 };
  const flat = proForma(base, { growth: 0.25, interest: 'flat' });
  const scale = proForma(base, { growth: 0.25, interest: 'scale' });
  assert.ok(flat.income.netIncome > scale.income.netIncome);
});

test('ratios: current ratio, DuPont identity and capital intensity', () => {
  const s = summarize(rosengarten);
  const r = ratios(rosengarten);
  near(r.currentRatio, 1200 / 400, 1e-9);
  near(r.capitalIntensity, 3, 1e-9);
  near(r.profitMargin, 0.132, 1e-9);
  const d = dupont(rosengarten);
  near(d.roe, s.netIncome / s.equity, 1e-9);
});

test('ratios return null instead of dividing by zero', () => {
  const r = ratios({ sales: 100, cogs: 60 });
  assert.equal(r.currentRatio, null);
  assert.equal(r.timesInterestEarned, null);
});

test('sales history: growth, CAGR and one-step linear trend', () => {
  const h = growthFromHistory([100, 110, 121]);
  near(h.cagr, 0.10, 1e-9);
  near(h.avg, 0.10, 1e-9);
  near(h.std, 0, 1e-9);
  // Hand check: slope 10.5, intercept 99.83, value at t=3 is 99.83 + 31.5 = 131.33.
  near(h.linear.nextSales, 131.333, 0.01);
  const two = growthFromHistory([100, 120]);
  near(two.cagr, 0.2, 1e-9);
  assert.equal(two.std, null);
  assert.equal(two.linear, null);
  assert.equal(growthFromHistory([100]).cagr, null);
});

test('scenario band uses history spread when available, otherwise a stated assumption', () => {
  const rich = scenarioRates(growthFromHistory([100, 108, 125, 130]));
  assert.equal(rich.spreadSource, 'history');
  assert.ok(rich.high > rich.base && rich.low < rich.base);
  const thin = scenarioRates(growthFromHistory([100, 120]), { assumedSpread: 0.04 });
  assert.equal(thin.spreadSource, 'assumed');
  near(thin.high - thin.base, 0.04, 1e-9);
  assert.equal(scenarioRates(growthFromHistory([100])), null);
});

test('insights flag a financing gap and growth above the internal rate', () => {
  const pf = proForma(hoffman, { growth: 0.2 });
  const f = { money: (v) => `$${v.toFixed(1)}`, pct: (v) => `${(v * 100).toFixed(1)}%`, x: (v) => `${v.toFixed(2)}x` };
  const out = insights({
    pf,
    internal: internalGrowthRate(hoffman),
    sustainable: sustainableGrowthRate(hoffman),
    zeroEfn: zeroEfnGrowth(hoffman),
    baseRatios: ratios(hoffman),
    pfRatios: ratios(pf.projected),
    fixedAssetsVary: true,
  }, f);
  assert.ok(out.some((i) => i.title === 'Outside financing is needed' && i.text.includes('$47.2')));
  assert.ok(out.some((i) => i.title === 'Above the internal growth rate'));
});

test('zero sales is rejected cleanly', () => {
  assert.ok(proForma({ sales: 0 }, { growth: 0.1 }).error);
  assert.ok(validate({}).length > 0);
});
