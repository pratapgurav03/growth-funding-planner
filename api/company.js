// Hosted lookup (Vercel). Same code as the local server, behind a function.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeCompanyApi } from '../src/planner/company-api.js';

let api = null;
function get() {
  if (!api) {
    let snapshot = null;
    try { snapshot = JSON.parse(readFileSync(join(process.cwd(), 'data', 'snapshot.json'), 'utf8')); } catch { /* no saved copy */ }
    api = makeCompanyApi({ userAgent: (process.env.SEC_USER_AGENT || '').trim(), snapshot });
  }
  return api;
}

export default async function handler(req, res) {
  const send = (status, body, cache) => { res.setHeader('Cache-Control', cache || 'no-store'); res.status(status).json(body); };
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'GET only.' });
  try {
    const params = new URLSearchParams();
    for (const k of ['q', 'cik', 'years']) { const v = req.query && req.query[k]; if (typeof v === 'string') params.set(k, v.slice(0, 80)); }
    const out = await get().company(params);
    // Let the edge keep answers for 15 minutes, so repeat lookups never touch SEC. A saved copy is never cached.
    return send(200, out, out.fromSnapshot || out.choices ? 'no-store' : 'public, s-maxage=900, stale-while-revalidate=3600');
  } catch (e) {
    console.error(`${JSON.stringify(req.query)} -> ${e.status || 500}: ${e.message}`);
    return send(e.status || 500, { error: e.status ? e.message : 'Server error. Please try again.' });
  }
}
