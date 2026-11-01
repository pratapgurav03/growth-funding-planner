// Parser tests use small invented statements shaped like a 10-K table. Nothing here is real company data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, parseCsv, detectFormat, importStatements, toYears } from '../src/planner/parse.js';
import { summarize, validate } from '../src/planner/engine.js';

test('numbers: thousands separators, parentheses, dashes, currency, percent', () => {
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber('(1,234)'), -1234);
  assert.equal(parseNumber('$ 2,000'), 2000);
  assert.equal(parseNumber('\u2014'), 0);
  assert.equal(parseNumber('-'), 0);
  assert.equal(parseNumber('-45'), -45);
  assert.equal(parseNumber('12%'), null);
  assert.equal(parseNumber('abc'), null);
});

test('csv: quoted commas and escaped quotes', () => {
  const rows = parseCsv('Label,2023,2024\n"Cash, and equivalents","1,000",1200\n');
  assert.deepEqual(rows[1], ['Cash, and equivalents', '1,000', '1200']);
});

test('format detection', () => {
  assert.equal(detectFormat('Sales\t100\t120\nCOGS\t60\t70'), 'tsv');
  assert.equal(detectFormat('Item,2023,2024\nSales,100,120\nCOGS,60,70'), 'csv');
  assert.equal(detectFormat('Net sales $ 391,035 $ 383,285\nCost of sales 210,352 214,137'), 'text');
});

// A 10-K style paste: newest year first, dollar signs, parentheses, section order as filed.
const TENK = `
Fiscal year ended   2024   2023
Net sales   $ 1,200   $ 1,000
Cost of sales   720   620
Selling, general and administrative   200   180
Research and development   40   30
Depreciation and amortization   50   45
Interest expense   20   18
Provision for income taxes   55   40
Net income   $ 115   $ 67
Earnings per share   1.15   0.67

Cash and cash equivalents   $ 100   $ 90
Accounts receivable, net   180   150
Inventories   240   200
Prepaid expenses and other current assets   30   25
Total current assets   550   465
Property, plant and equipment, net   600   540
Goodwill   100   100
Total assets   $ 1,250   $ 1,105
Accounts payable   150   130
Accrued expenses   70   60
Current portion of long-term debt   30   30
Total current liabilities   250   220
Long-term debt   400   380
Other long-term liabilities   50   45
Total liabilities   700   645
Common stock and paid-in capital   200   200
Retained earnings   350   260
Total shareholders' equity   550   460
Total liabilities and shareholders' equity   $ 1,250   $ 1,105
`;

test('10-K paste: maps lines, flips newest-first to oldest-first, ignores per-share lines', () => {
  const p = importStatements(TENK);
  assert.equal(p.format, 'text');
  assert.deepEqual(p.years, [2023, 2024]);
  assert.deepEqual(p.data.sales, [1000, 1200]);
  assert.deepEqual(p.data.cogs, [620, 720]);
  assert.deepEqual(p.data.opex, [210, 240]); // SG&A + R&D
  assert.deepEqual(p.data.receivables, [150, 180]);
  assert.deepEqual(p.data.notesPayable, [30, 30]);
  assert.deepEqual(p.data.longTermDebt, [380, 400]);
  assert.deepEqual(p.data.otherNonCurrentAssets, [100, 100]);
  assert.deepEqual(p.data.commonStock, [200, 200]);
  assert.deepEqual(p.data.retainedEarnings, [260, 350]);
  assert.ok(!p.unmatched.some((l) => /per share/i.test(l)));
});

test('10-K paste: the imported years balance and net income matches the reported line', () => {
  const p = importStatements(TENK);
  const years = toYears(p);
  for (const y of years) assert.deepEqual(validate(y), [], y.label);
  assert.equal(summarize(years[1]).netIncome, p.reported.netIncome[1]);
  assert.equal(summarize(years[0]).netIncome, p.reported.netIncome[0]);
});

test('csv template round trip, oldest first', () => {
  const csv = 'Item,2022,2023,2024\nSales,100,110,121\nCost of goods sold,60,66,72\nCash,10,11,12\n';
  const p = importStatements(csv);
  assert.equal(p.format, 'csv');
  assert.deepEqual(p.years, [2022, 2023, 2024]);
  assert.deepEqual(p.data.sales, [100, 110, 121]);
  assert.deepEqual(p.data.cash, [10, 11, 12]);
});

test('no header: assumes oldest first, says so, and the order can be forced', () => {
  const t = 'Sales\t100\t120\nCost of goods sold\t60\t70';
  const a = importStatements(t);
  assert.deepEqual(a.data.sales, [100, 120]);
  assert.ok(a.notes.some((n) => /No year header/.test(n)));
  const d = importStatements(t, { order: 'desc' });
  assert.deepEqual(d.data.sales, [120, 100]);
});

test('ambiguous "Term debt" is current before total current liabilities and long-term after', () => {
  const t = 'Accounts payable 100\nTerm debt 20\nTotal current liabilities 120\nTerm debt 300';
  const p = importStatements(t);
  assert.deepEqual(p.data.notesPayable, [20]);
  assert.deepEqual(p.data.longTermDebt, [300]);
});

test('dividends shown as negatives are stored as positive amounts', () => {
  const p = importStatements('Dividends paid (25)');
  assert.deepEqual(p.data.dividends, [25]);
});

test('unrecognised lines are reported, not guessed', () => {
  const p = importStatements('Sales 100\nGibberish widgets 55');
  assert.ok(p.unmatched.includes('Gibberish widgets'));
});

test('missing sales is called out', () => {
  const p = importStatements('Cash 10');
  assert.ok(p.notes.some((n) => /No sales line/.test(n)));
});
