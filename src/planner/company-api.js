// Looks a company up on SEC EDGAR and turns it into planner years. Shared by the local server and the hosted
// function, so there is one implementation. Pure of any web framework: it takes URL search params and returns an object
// or throws an error with a .status.
import { buildStatements, matchCompany, factsCik } from './sec.js';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const FACTS_URL = (cik) => `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
export const MIN_GAP_MS = 150; // SEC allows 10 requests a second. Stay well under.

export function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export function makeCompanyApi({ fetchImpl = fetch, userAgent = '', now = () => Date.now(), minGapMs = MIN_GAP_MS, snapshot = null } = {}) {
  const cache = new Map(); // key -> { at, ttl, value }
  let lastCall = 0;

  async function cached(key, ttl, make) {
    const hit = cache.get(key);
    if (hit && now() - hit.at < hit.ttl) return hit.value;
    const value = await make();
    cache.set(key, { at: now(), ttl, value });
    return value;
  }

  async function sec(url) {
    const wait = lastCall + minGapMs - Date.now();
    lastCall = Date.now() + Math.max(0, wait);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    let res;
    try {
      res = await fetchImpl(url, { headers: { 'User-Agent': userAgent, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
    } catch (e) {
      throw httpError(502, `Could not reach SEC (${e.name === 'TimeoutError' ? 'timed out' : e.message}). Check your internet connection.`);
    }
    if (res.status === 403 || res.status === 429) throw httpError(502, `SEC refused the request (${res.status}). Set SEC_USER_AGENT to your name and email, and wait a minute if you fetched a lot.`);
    if (res.status === 404) throw httpError(404, 'SEC has no XBRL data for this company.');
    if (!res.ok) throw httpError(502, `SEC answered ${res.status}.`);
    return res.json();
  }

  async function liveCompany(params) {
    if (!userAgent.trim()) throw httpError(503, 'Set SEC_USER_AGENT before starting the server, for example SEC_USER_AGENT="Your Name you@example.com" npm run serve. SEC requires every client to identify itself.');
    const years = Math.min(10, Math.max(1, parseInt(params.get('years'), 10) || 5));
    const cikParam = (params.get('cik') || '').replace(/\D/g, '');
    const q = (params.get('q') || '').trim();
    if (!cikParam && !q) throw httpError(400, 'Type a ticker, company name or CIK.');

    const tickers = await cached('tickers', 24 * 3600 * 1000, () => sec(TICKERS_URL));
    let pick;
    if (cikParam) {
      pick = matchCompany(tickers, cikParam)[0];
      if (!pick) throw httpError(404, `No listed company has CIK ${cikParam}.`);
    } else {
      const matches = matchCompany(tickers, q);
      if (!matches.length) throw httpError(404, `No US-listed company matches "${q}". Try the ticker.`);
      const exact = matches[0].ticker.toUpperCase() === q.toUpperCase() || (/^\d+$/.test(q) && matches[0].cik === q.padStart(10, '0'));
      if (!exact && matches.length > 1) return { choices: matches };
      pick = matches[0];
    }
    const fcik = factsCik(pick.cik);
    const built = await cached(`facts:${fcik}:${years}`, 15 * 60 * 1000, async () => buildStatements(await sec(FACTS_URL(fcik)), { years }));
    if (built.error) throw httpError(422, `${pick.name}: ${built.error}`);
    return {
      ...built,
      company: { name: pick.name, ticker: pick.ticker, cik: pick.cik },
      source: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pick.cik}&type=10-K`,
      fetchedAt: new Date(now()).toISOString(),
    };
  }

  function fromSnapshot(params) {
    const q = (params.get('q') || '').trim();
    const cikParam = (params.get('cik') || '').replace(/\D/g, '');
    const raw = Object.fromEntries(snapshot.index.map((r, i) => [i, { cik_str: r.cik, ticker: r.ticker, title: r.title }]));
    const matches = matchCompany(raw, cikParam || q);
    if (!matches.length) return null;
    const exact = !q || matches[0].ticker.toUpperCase() === q.toUpperCase() || /^\d+$/.test(q);
    if (!exact && matches.length > 1) return { choices: matches };
    const hit = snapshot.companies[matches[0].cik];
    if (!hit) return null;
    const day = String(snapshot.generatedAt).slice(0, 10);
    return { ...hit, notes: [`SEC could not be reached, so this is the saved copy from ${day}. Reconnect for live data.`, ...hit.notes], fromSnapshot: true, snapshotDate: day };
  }

  async function company(params) {
    try { return await liveCompany(params); } catch (e) {
      if (e.status === 502 && snapshot && snapshot.index) { const out = fromSnapshot(params); if (out) return out; }
      throw e;
    }
  }

  return { company, cache };
}
