// Saves a copy of popular filers so the planner still answers if SEC is unreachable during a demo.
//   node scripts/snapshot.mjs
// Writes data/snapshot.json. Rerun before any live demo to refresh it.
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildStatements } from '../src/planner/sec.js';
import { client, TICKERS_URL, FACTS_URL, companies, factsCik } from './lib.mjs';

const WANT = `AAPL MSFT GOOGL AMZN NVDA META TSLA NFLX AMD INTC ORCL CRM ADBE CSCO IBM QCOM TXN AVGO MU UBER ABNB PYPL SHOP SNOW PLTR
WMT COST TGT HD LOW NKE SBUX MCD KO PEP PG JNJ PFE MRK ABBV LLY UNH CVS DIS CMCSA T VZ TMUS
XOM CVX COP SLB OXY ENPH FSLR NEE DUK SO BE PLUG RIVN LCID F GM
BA LMT GE CAT DE HON MMM UPS FDX DAL UAL AAL LUV
DOW LYB DD APD LIN SHW ECL ALB LAC FCX NEM
KHC GIS HSY MDLZ CL KMB EL TSN HRL
NATH GME AMC CROX LULU DKS BBY ROST TJX DG DLTR KR`.split(/\s+/).filter(Boolean);

const get = client();
const t = await get(TICKERS_URL);
if (!t.json) { console.error('Could not fetch the company list:', t.failed || 'not found'); process.exit(1); }
const all = companies(t.json);
const index = []; const out = {}; const skipped = [];
for (const [i, tk] of WANT.entries()) {
  const c = all.find((x) => x.ticker.toUpperCase() === tk);
  if (!c) { skipped.push(`${tk} (not in SEC list)`); continue; }
  const r = await get(FACTS_URL(factsCik(c.cik)));
  if (!r.json) { skipped.push(`${tk} (${r.failed || 'no XBRL'})`); continue; }
  const b = buildStatements(r.json, { years: 5 });
  if (b.error) { skipped.push(`${tk} (${b.error.slice(0, 40)})`); continue; }
  index.push(c);
  out[c.cik] = { ...b, company: { name: c.title, ticker: c.ticker, cik: c.cik }, source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=10-K`, fetchedAt: new Date().toISOString() };
  if ((i + 1) % 20 === 0) console.log(`${i + 1}/${WANT.length}`);
}
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../data/snapshot.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), index, companies: out }));
console.log(`Saved ${index.length} companies to data/snapshot.json.`);
if (skipped.length) console.log('Skipped:', skipped.join('; '));
