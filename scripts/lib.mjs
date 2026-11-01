// Shared by coverage.mjs and snapshot.mjs. Same pacing and identity rules as server.js.
import { readFileSync } from 'node:fs';
import { loadUserAgent } from '../server.js';
export { factsCik } from '../src/planner/sec.js';

export const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
export const FACTS_URL = (cik) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

export function client({ gapMs = 150 } = {}) {
  const ua = loadUserAgent();
  if (!ua) { console.error('Set SEC_USER_AGENT or fill .sec-user-agent first.'); process.exit(1); }
  let last = 0;
  return async function get(url, tries = 3) {
    for (let i = 0; i < tries; i++) {
      const wait = last + gapMs - Date.now();
      last = Date.now() + Math.max(0, wait);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        const res = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
        if (res.status === 429 || res.status === 403) { await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
        if (res.status === 404) return { missing: true };
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { json: await res.json() };
      } catch (e) { if (i === tries - 1) return { failed: e.message }; await new Promise((r) => setTimeout(r, 2000)); }
    }
    return { failed: 'rate limited' };
  };
}

// Orders SEC's list by its own rank (roughly size), one row per company.
export function companies(tickers) {
  const seen = new Set(); const out = [];
  for (const k of Object.keys(tickers)) {
    const r = tickers[k]; const cik = String(r.cik_str).padStart(10, '0');
    if (seen.has(cik)) continue; seen.add(cik);
    out.push({ cik, ticker: r.ticker, title: r.title });
  }
  return out;
}

// Seeded shuffle so a rerun tests the same companies.
export function pick(list, n, seed = 7) {
  const a = list.slice(); let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

// Sorts one built result into: clean, flagged (usable, but a human should look) or refused.
export function grade(built, today = new Date()) {
  if (built.error) return { grade: 'refused', why: [built.error.slice(0, 60)] };
  const why = [];
  const y = built.years[built.years.length - 1];
  const ageMonths = (today - Date.parse(y.end)) / (30.44 * 864e5);
  if (ageMonths > 18) why.push('stale: latest year ended ' + y.end);
  if (!(y.sales > 0)) why.push('no sales');
  for (const n of built.notes) {
    const gap = /net income rebuilt from the lines is (-?\d+), the closest figure in the filing is (-?\d+)/.exec(n);
    if (gap) { const a = +gap[1], b = +gap[2]; if (Math.abs(a - b) > Math.max(1, Math.abs(b) * 0.05)) why.push('NI gap over 5%'); }
    else if (/derived .* is negative/.test(n)) why.push('negative derived line');
    else if (/appears to include depreciation/.test(n)) why.push('cogs overlap, adjusted');
    else if (/operating costs came out negative/.test(n)) why.push('negative opex');
    else if (/skipped/.test(n)) why.push('year skipped');
  }
  const core = ['sales', 'cash', 'netFixedAssets', 'commonStock', 'retainedEarnings'];
  for (const k of core) if (built.notFound.some((m) => m.toLowerCase().includes(k.replace('netFixedAssets', 'fixed')))) why.push('missing ' + k);
  if (built.years.length < 3) why.push('under 3 years');
  if (built.shares == null) why.push('no share count (enter on Valuation tab)');
  return { grade: why.length ? 'flagged' : 'clean', why: [...new Set(why)] };
}

// True when the filer has ever filed a 10-K, which is what the planner reads. Foreign filers (20-F, 40-F) have none.
export function files10K(facts) {
  const g = facts && facts.facts && facts.facts['us-gaap'];
  if (!g) return false;
  for (const tag of ['Assets', 'Revenues', 'StockholdersEquity', 'NetIncomeLoss']) {
    const u = g[tag] && g[tag].units && g[tag].units.USD;
    if (u && u.some((r) => /^10-K/.test(r.form))) return true;
  }
  return false;
}
