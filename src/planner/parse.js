// Import: turn pasted statement text or a CSV file into planner fields.
// Best effort by design. The page shows every mapped value for review before it is used.
// Pure functions, no DOM.

export const MAPPED_KEYS = [
  'sales', 'cogs', 'opex', 'depreciation', 'interest', 'taxes', 'dividends',
  'cash', 'receivables', 'inventory', 'otherCurrentAssets', 'netFixedAssets', 'otherNonCurrentAssets',
  'payables', 'otherCurrentLiabilities', 'notesPayable', 'longTermDebt', 'otherLongTermLiabilities',
  'commonStock', 'retainedEarnings', 'otherEquity',
];

// ---------------------------------------------------------------- numbers

// "(1,234)" is negative. A dash alone means zero. Returns null for anything else.
export function parseNumber(tok) {
  if (tok === undefined || tok === null) return null;
  let t = String(tok).trim();
  if (t === '') return null;
  if (/^[-\u2013\u2014]+$/.test(t)) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[$€£,\s]/g, '');
  if (t.startsWith('-')) { neg = !neg; t = t.slice(1); }
  if (t.endsWith('%')) return null;
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = parseFloat(t);
  return neg ? -v : v;
}

// Number tokens in a free-text line: $ 1,234   (1,234)   12.5   dash.
const NUM_RE = /\(?-?\$?\s?\d[\d,]*(?:\.\d+)?\)?%?|(?<=\s|^)[\u2013\u2014](?=\s|$)/g;

function splitFreeText(line) {
  const m = [...line.matchAll(NUM_RE)];
  if (!m.length) return { label: line.trim(), values: [] };
  const first = m[0].index;
  const label = line.slice(0, first).replace(/[$\s:]+$/, '').trim();
  const values = [];
  for (const x of m) {
    if (x[0].endsWith('%')) continue;
    const v = parseNumber(x[0]);
    if (v !== null) values.push(v);
  }
  return { label, values };
}

// Minimal CSV: quotes, escaped quotes, commas and tabs inside quotes.
export function parseCsv(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const src = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------- label rules

const SKIP = /per share|per ordinary|% of|percent|growth|margin|ratio|accumulated depreciation|^less\b|weighted|shares (issued|outstanding)|diluted|basic/;

// First match wins, so order matters. mode: add (sum several lines), set (take one),
// total (a reported subtotal used only as a cross-check), ctx (debt, depends on position).
const RULES = [
  { key: 'tca', mode: 'total', re: /^total current assets/ },
  { key: 'ta', mode: 'total', re: /^total assets/ },
  { key: 'tcl', mode: 'total', re: /^total current liabilities/ },
  { key: 'tl', mode: 'total', re: /^total liabilities( and|$)/ },
  { key: 'te', mode: 'total', re: /^total (shareholders|stockholders|owners|share ?holders)[' ]*s?[' ]*(equity|deficit)|^total equity/ },
  { key: 'netIncome', mode: 'total', re: /^net (income|earnings|loss)/ },
  { key: 'opexTotal', mode: 'total', re: /^total operating expenses/ },

  { key: 'cogs', mode: 'set', re: /^cost of (goods sold|sales|revenues?|products? sold|merchandise)|^cost of goods/ },
  { key: 'opex', mode: 'add', re: /selling|general and administrative|general & administrative|sg&a|sales and marketing|marketing|research and development|^other operating expenses?|^operating expenses?$/ },
  { key: 'depreciation', mode: 'set', re: /^depreciation|^amortization/ },
  { key: 'interest', mode: 'set', re: /^interest expense|^interest and (other )?(debt )?expense|^interest, net|^net interest expense/ },
  { key: 'taxes', mode: 'set', re: /^(provision for |benefit from )?income tax(es)?( expense| provision)?$|^provision for income taxes|^income tax expense|^taxes$/ },
  { key: 'dividends', mode: 'set', re: /dividends?( paid| declared)?|cash dividends/ },
  { key: 'sales', mode: 'set', re: /^(total |net )*(net )?(sales|revenues?)\b/ },

  { key: 'cash', mode: 'set', re: /^cash( and cash equivalents| and equivalents)?$/ },
  { key: 'receivables', mode: 'add', re: /receivables?/ },
  { key: 'inventory', mode: 'add', re: /^inventor(y|ies)/ },
  { key: 'otherCurrentAssets', mode: 'add', re: /prepaid|other current assets|marketable securities|short[- ]term investments|vendor non-trade|current assets/ },
  { key: 'netFixedAssets', mode: 'add', re: /property,? plant|^net plant|fixed assets|^pp&e|^plant and equipment/ },
  { key: 'otherNonCurrentAssets', mode: 'add', re: /goodwill|intangible|other (non-?current|long[- ]term) assets|right-of-use|operating lease assets|deferred (income )?tax assets|long[- ]term investments|non-marketable|^investments/ },

  { key: 'payables', mode: 'add', re: /^accounts payable|^trade (accounts )?payables?|^payables/ },
  { key: 'notesPayable', mode: 'add', re: /^notes payable,? (short|current)|short[- ]term (debt|borrowings|notes)|current (portion|maturities) of (long[- ]term )?(debt|borrowings|notes)|commercial paper|^current portion/ },
  { key: 'otherCurrentLiabilities', mode: 'add', re: /accrued|other current liabilities|deferred revenue|unearned|income taxes? payable|customer deposits|current (operating )?lease liabilit/ },
  { key: 'longTermDebt', mode: 'add', re: /long[- ]term (debt|borrowings|notes)|non-?current (debt|portion|borrowings)|senior notes|bonds? payable|debentures/ },
  { key: 'ctxDebt', mode: 'ctx', re: /^(term debt|debt|borrowings|notes payable)$/ },
  { key: 'otherLongTermLiabilities', mode: 'add', re: /other (non-?current|long[- ]term) liabilities|deferred (income )?tax(es)? liabilit|non-?current (lease|operating lease) liabilit|operating lease liabilit|pension|deferred revenue/ },

  { key: 'commonStock', mode: 'add', re: /common stock|paid[- ]in|capital stock|share capital/ },
  { key: 'retainedEarnings', mode: 'add', re: /retained earnings|accumulated deficit|earnings reinvested/ },
  { key: 'otherEquity', mode: 'add', re: /accumulated other comprehensive|treasury|noncontrolling|non-controlling|other equity/ },
];

function normLabel(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s*\(\d+\)\s*$/, '') // footnote marks
    .replace(/\s+/g, ' ')
    .replace(/[:*]+$/, '')
    .trim();
}

// ---------------------------------------------------------------- format detection

function nonEmptyLines(text) {
  return String(text).split(/\r?\n/).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim() !== '');
}

// CSV when most lines look like  Label,number,number  with no digits in the label.
export function detectFormat(text) {
  const lines = nonEmptyLines(text);
  if (!lines.length) return 'text';
  const tabs = lines.filter((l) => l.includes('\t')).length;
  if (tabs >= Math.max(1, lines.length / 3)) return 'tsv';
  const csv = lines.filter((l) => /^"?[^",\d]*"?,/.test(l)).length;
  return csv >= Math.max(1, lines.length / 2) ? 'csv' : 'text';
}

function yearsIn(str) {
  const m = String(str).match(/\b(?:19|20)\d{2}\b/g);
  return m ? m.map(Number) : [];
}

// ---------------------------------------------------------------- main entry

// Returns { years, columns, data, unmatched, notes, format }.
// years is oldest first, or null when the text carries none. data[key][i] lines up with years[i].
export function importStatements(text, opts = {}) {
  const notes = [];
  const format = opts.format || detectFormat(text);
  let rows = [];
  if (format === 'csv') rows = parseCsv(text, ',').map((r) => ({ label: r[0] || '', cells: r.slice(1) }));
  else if (format === 'tsv') rows = parseCsv(text, '\t').map((r) => ({ label: r[0] || '', cells: r.slice(1) }));
  else rows = nonEmptyLines(text).map((l) => ({ line: l }));

  // Header: first row naming two or more years.
  let years = null;
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const raw = r.line !== undefined ? r.line : [r.label, ...r.cells].join(' ');
    const ys = yearsIn(raw);
    const numericCells = r.line !== undefined ? splitFreeText(r.line).values.filter((v) => !(v >= 1900 && v <= 2100)).length : r.cells.map(parseNumber).filter((v) => v !== null && !(v >= 1900 && v <= 2100)).length;
    if (new Set(ys).size >= 2 && numericCells === 0) { years = ys; headerIndex = i; break; }
  }

  const sums = {};
  const sets = {};
  const totals = {};
  const unmatched = [];
  let seenTCL = false;
  let seenPayables = false;

  const record = (key, mode, values, label) => {
    const target = mode === 'add' ? sums : mode === 'total' ? totals : sets;
    if (mode === 'add') {
      const prev = sums[key] || [];
      sums[key] = values.map((v, i) => (prev[i] || 0) + v);
    } else if (!(key in target)) target[key] = values; // set: first line wins
  };

  rows.forEach((r, idx) => {
    if (idx === headerIndex) return;
    let label;
    let values;
    if (r.line !== undefined) ({ label, values } = splitFreeText(r.line));
    else {
      label = r.label;
      values = r.cells.map(parseNumber).filter((v) => v !== null);
    }
    if (!label || !values.length) return;
    const n = normLabel(label);
    if (SKIP.test(n)) return;
    const rule = RULES.find((x) => x.re.test(n));
    if (!rule) { unmatched.push(label); return; }

    if (rule.key === 'tcl') seenTCL = true;
    if (rule.key === 'payables') seenPayables = true;
    if (rule.mode === 'ctx') {
      const key = seenPayables && !seenTCL ? 'notesPayable' : 'longTermDebt';
      record(key, 'add', values, label);
      return;
    }
    const vals = rule.key === 'dividends' ? values.map(Math.abs) : values;
    record(rule.key, rule.mode, vals, label);
  });

  // Column count: from the header when present, else the longest row.
  const lengths = [...Object.values(sums), ...Object.values(sets), ...Object.values(totals)].map((v) => v.length);
  let columns = years ? years.length : Math.max(0, ...lengths);
  if (years && lengths.length && Math.max(...lengths) !== years.length) {
    notes.push(`The header lists ${years.length} years but the rows have up to ${Math.max(...lengths)} numbers. The first ${years.length} numbers of each row were used.`);
  }

  // Order. 10-K tables list the newest year first; the header years decide.
  let reverse = false;
  if (opts.order === 'desc') reverse = true;
  else if (opts.order === 'asc') reverse = false;
  else if (years && years[0] > years[years.length - 1]) reverse = true;
  else if (!years) notes.push('No year header found. Columns were read oldest to newest. Flip the order if the newest year comes first.');

  const orient = (arr) => {
    const a = arr.slice(0, columns);
    while (a.length < columns) a.push(0);
    return reverse ? a.reverse() : a;
  };
  const data = {};
  for (const k of MAPPED_KEYS) {
    if (k === 'opex') continue;
    if (sums[k]) data[k] = orient(sums[k]);
    else if (sets[k]) data[k] = orient(sets[k]);
  }
  // Operating expenses: a reported total beats the sum of its parts.
  if (totals.opexTotal) data.opex = orient(totals.opexTotal);
  else if (sums.opex) data.opex = orient(sums.opex);
  if (years) years = (reverse ? [...years].reverse() : [...years]);

  const reported = {};
  for (const k of ['ta', 'tca', 'tcl', 'tl', 'te', 'netIncome']) if (totals[k]) reported[k] = orient(totals[k]);

  if (!data.sales) notes.push('No sales line was recognised. Enter it by hand.');
  if (!data.cogs) notes.push('No cost of goods sold line was recognised. If the statement groups costs differently, enter total costs in the cost of goods sold row.');
  return { format, years, columns, data, reported, unmatched, notes };
}

// A CSV the importer reads back exactly. fields: [{ key, label }], years: ascending labels.
export function csvTemplate(fields, years) {
  const q = (s) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [['Item', ...years].join(',')];
  for (const f of fields) lines.push([q(f.label), ...years.map(() => '')].join(','));
  return lines.join('\n');
}

// Turn an import into year objects the engine accepts.
export function toYears(parsed) {
  const out = [];
  for (let i = 0; i < parsed.columns; i++) {
    const y = { label: parsed.years ? String(parsed.years[i]) : `Year ${i + 1}` };
    for (const k of MAPPED_KEYS) y[k] = parsed.data[k] ? parsed.data[k][i] || 0 : 0;
    out.push(y);
  }
  return out;
}
