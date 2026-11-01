import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES } from '../src/planner/examples.js';
import { FIELDS, validate, summarize, proForma } from '../src/planner/engine.js';
import { csvTemplate, importStatements } from '../src/planner/parse.js';

test('every example year balances', () => {
  for (const ex of EXAMPLES) {
    for (const y of ex.years) assert.deepEqual(validate(y), [], `${ex.id} ${y.label}`);
  }
});

test('Example Co. net income agrees with the invented statements', () => {
  const ex = EXAMPLES.find((e) => e.id === 'exco');
  const ni = ex.years.map((y) => summarize(y).netIncome);
  assert.deepEqual(ni, [777, 859, 935, 996]);
});

test('S&S Air reproduces the book income statement and balance sheet totals', () => {
  const y = EXAMPLES.find((e) => e.id === 'sands').years[0];
  const s = summarize(y);
  assert.equal(s.ebit, 3815484);
  assert.equal(s.taxable, 3090386);
  assert.equal(s.netIncome, 2317789);
  assert.equal(s.currentAssets, 2603218);
  assert.equal(s.totalAssets, 22985163);
  assert.equal(s.currentLiabilities, 3507909);
  assert.equal(s.equity, 13177254);
});

test('S&S Air: a $5M lump-sum fixed asset purchase replaces proportional plant growth in the EFN', () => {
  const y = EXAMPLES.find((e) => e.id === 'sands').years[0];
  const prop = proForma(y, { growth: 0.12 });
  const lump = proForma(y, { growth: 0.12, fixedAssetStep: 5000000 });
  // Proportional growth adds 12% of 20,381,945 = 2,445,833 of plant; the lump adds 5,000,000.
  assert.ok(Math.abs(lump.efn - prop.efn - (5000000 - 0.12 * 20381945)) < 1);
});

test('the CSV template reads back with every field recognised', () => {
  const csv = csvTemplate(FIELDS, [2022, 2023]).split('\n');
  const filled = csv.map((line, i) => (i === 0 ? line : line.replace(/,,$/, ',10,20')));
  const p = importStatements(filled.join('\n'));
  for (const f of FIELDS) assert.ok(p.data[f.key], `template label not recognised: ${f.label}`);
  assert.deepEqual(p.years, [2022, 2023]);
  assert.deepEqual(p.unmatched, []);
});
