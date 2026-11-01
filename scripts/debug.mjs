// Shows why one company maps the way it does.   node scripts/debug.mjs XOM GE DE
import { buildStatements } from '../src/planner/sec.js';
import { client, TICKERS_URL, FACTS_URL, companies } from './lib.mjs';
const get = client();
const t = await get(TICKERS_URL);
const all = companies(t.json);
for (const tk of process.argv.slice(2)) {
  const c = all.find((x) => x.ticker.toUpperCase() === tk.toUpperCase());
  if (!c) { console.log(tk, 'not in SEC list'); continue; }
  const r = await get(FACTS_URL(c.cik));
  if (!r.json) { console.log(tk, 'no facts', r.failed || ''); continue; }
  const g = r.json.facts['us-gaap'] || {};
  const last = (k) => { const u = (g[k] && g[k].units && g[k].units.USD) || []; return u.length ? u.map((x) => x.end).sort().pop() : '-'; };
  const annual = (k) => ((g[k] && g[k].units && g[k].units.USD) || []).filter((x) => /^10-K/.test(x.form) && x.start && (Date.parse(x.end) - Date.parse(x.start)) / 864e5 > 340).length;
  console.log(`\n${tk} ${c.title} cik ${c.cik}`);
  console.log(' us-gaap tags:', Object.keys(g).length, '| revenue tags with annual rows:', ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'].map((k) => `${k.slice(0, 22)}=${annual(k)}`).join(' '));
  console.log(' bank tags last seen: Deposits', last('Deposits'), 'IFILL', last('InterestAndFeeIncomeLoansAndLeases'), 'Premiums', last('PremiumsEarnedNet'));
  const b = buildStatements(r.json, { years: 5 });
  console.log(' result:', b.error ? 'REFUSED: ' + b.error : `ok ${b.years.length} years, latest ${b.years[b.years.length - 1].end}, shares ${b.shares}`);
  if (!b.error) {
    // Where does the net income gap come from? Print the usual suspects for each year.
    const val = (k, end) => { const u = (g[k] && g[k].units && g[k].units.USD) || []; const rows = u.filter((x) => x.end === end && /^10-K/.test(x.form) && x.start && (Date.parse(end) - Date.parse(x.start)) / 864e5 > 340); return rows.length ? rows[rows.length - 1].val : null; };
    const m = (v) => (v === null ? '-' : (v / 1e6).toFixed(0));
    for (const y of b.years.slice(-3)) {
      const pre = ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'].map((k) => `${k.length > 80 ? 'ExclEq' : 'Std'}=${m(val(k, y.end))}`).join(' ');
      console.log(`  ${y.end} NI ${m(val('NetIncomeLoss', y.end))} ProfitLoss ${m(val('ProfitLoss', y.end))} | pretax ${pre} | tax ${m(val('IncomeTaxExpenseBenefit', y.end))} | eqInc ${m(val('IncomeLossFromEquityMethodInvestments', y.end))} disc ${m(val('IncomeLossFromDiscontinuedOperationsNetOfTax', y.end))} NCI ${m(val('NetIncomeLossAttributableToNoncontrollingInterest', y.end))} contOps ${m(val('IncomeLossFromContinuingOperations', y.end))} (USD m)`);
    }
  }
  if (!b.error) for (const n of b.notes.filter((x) => !/^Derived lines/.test(x))) console.log('  -', n.slice(0, 160));
}
