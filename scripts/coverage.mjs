// Measures how the SEC mapping holds up across many real filers. Run on a machine that can reach SEC:
//   node scripts/coverage.mjs            (500 largest + 300 random others, about 15 minutes)
//   node scripts/coverage.mjs 100 50     (100 largest + 50 random, quick check)
// Writes data/coverage.json and prints the pass rate and the most common problems.
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildStatements } from '../src/planner/sec.js';
import { client, TICKERS_URL, FACTS_URL, companies, pick, grade, factsCik, files10K } from './lib.mjs';

const top = parseInt(process.argv[2], 10) || 500;
const rand = parseInt(process.argv[3], 10) || 300;
const get = client();
const t = await get(TICKERS_URL);
if (!t.json) { console.error('Could not fetch the company list:', t.failed || 'not found'); process.exit(1); }
const all = companies(t.json);
const sample = [...all.slice(0, top), ...pick(all.slice(top), rand)];
console.log(`Testing ${sample.length} companies.`);

const rows = []; const t0 = Date.now();
for (const [i, c] of sample.entries()) {
  const r = await get(FACTS_URL(factsCik(c.cik)));
  let row;
  if (r.json) {
    try { const b = buildStatements(r.json, { years: 5 }); row = { ...c, domestic: files10K(r.json), ...grade(b), shares: b.shares, years: b.years ? b.years.length : 0, sales: b.years ? b.years[b.years.length - 1].sales : null, end: b.years ? b.years[b.years.length - 1].end : null }; }
    catch (e) { row = { ...c, domestic: false, grade: 'crash', why: [e.message.slice(0, 80)] }; }
  } else row = { ...c, domestic: false, grade: r.missing ? 'no-xbrl' : 'fetch-failed', why: [r.failed || 'no XBRL facts'] };
  rows.push(row);
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${sample.length}  ${Math.round((Date.now() - t0) / 1000)}s`);
}

const count = (f) => rows.filter(f).length;
const summary = { generatedAt: new Date().toISOString(), tested: rows.length };
for (const g of ['clean', 'flagged', 'refused', 'no-xbrl', 'fetch-failed', 'crash']) summary[g] = count((r) => r.grade === g);
const why = {};
for (const r of rows) for (const w of r.why || []) why[w.replace(/\d{4}-\d\d-\d\d/, '')] = (why[w.replace(/\d{4}-\d\d-\d\d/, '')] || 0) + 1;
// The score that matters: of US companies that file a 10-K and are not banks or insurers, how many load.
const isFin = (r) => r.grade === 'refused' && /bank or insurer/.test((r.why || [])[0] || '');
const dom = rows.filter((r) => r.domestic && !isFin(r));
const ok = dom.filter((r) => r.grade === 'clean' || r.grade === 'flagged');
const noRev = (r) => r.grade === 'refused' && /No annual revenue/.test((r.why || [])[0] || '');
const oper = dom.filter((r) => !noRev(r));
const okOper = oper.filter((r) => r.grade === 'clean' || r.grade === 'flagged');
summary.operating = { companies: oper.length, load: okOper.length, pctLoad: +(100 * okOper.length / oper.length).toFixed(1), excludedNoRevenue: dom.length - oper.length };
summary.domestic = { companies: dom.length, load: ok.length, clean: ok.filter((r) => r.grade === 'clean').length, pctLoad: +(100 * ok.length / dom.length).toFixed(1), pctClean: +(100 * ok.filter((r) => r.grade === 'clean').length / dom.length).toFixed(1), failed: dom.filter((r) => !ok.includes(r)).map((r) => `${r.ticker}: ${(r.why || [])[0]}`) };
summary.topProblems = Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/coverage.json', import.meta.url), JSON.stringify({ summary, rows }, null, 1));

const pct = (n) => (100 * n / rows.length).toFixed(1) + '%';
console.log(`\nclean ${summary.clean} (${pct(summary.clean)})  flagged ${summary.flagged} (${pct(summary.flagged)})  refused ${summary.refused} (${pct(summary.refused)})`);
console.log(`no XBRL ${summary['no-xbrl']}  fetch failed ${summary['fetch-failed']}  crashes ${summary.crash}`);
console.log('Top problems:'); for (const [w, n] of summary.topProblems) console.log(`  ${String(n).padStart(4)}  ${w}`);
const d = summary.domestic;
console.log(`\nUS 10-K filers, banks and insurers excluded: ${d.companies}. Load: ${d.load} (${d.pctLoad}%). Fully clean: ${d.clean} (${d.pctClean}%).`);
console.log(`Same, leaving out ${summary.operating.excludedNoRevenue} that report no revenue at all (SPACs, funds, pre-revenue shells): ${summary.operating.load} of ${summary.operating.companies} load (${summary.operating.pctLoad}%).`);
console.log('Did not load:'); for (const f of d.failed) console.log('  ' + f);
console.log('\nSaved data/coverage.json');
