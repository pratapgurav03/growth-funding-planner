// Planning engine. Ross, Westerfield & Jordan, Fundamentals of Corporate Finance,
// ch.3 (ratios) and ch.4 (financial planning). Pure functions, no DOM, no imports.
// The web page and the tests import this same file, so there is one implementation.

// ---------------------------------------------------------------- fields

// vary: default answer to "does this line move with sales?" (percentage of sales approach).
// Balance sheet lines only. Every income statement cost runs at last year's percentage of sales.
// Accounts payable moves spontaneously with sales. Notes payable and long-term debt
// are management choices, so they do not (Ross, section 4.3).
export const FIELDS = [
  { key: 'sales', label: 'Sales (revenue)', stmt: 'is' },
  { key: 'cogs', label: 'Cost of goods sold', stmt: 'is' },
  { key: 'opex', label: 'Operating expenses (SG&A, R&D, other)', stmt: 'is' },
  { key: 'depreciation', label: 'Depreciation and amortization', stmt: 'is' },
  { key: 'interest', label: 'Interest expense', stmt: 'is' },
  { key: 'taxes', label: 'Income taxes', stmt: 'is' },
  { key: 'dividends', label: 'Dividends paid', stmt: 'is' },

  { key: 'cash', label: 'Cash', stmt: 'bs', side: 'A', vary: true },
  { key: 'receivables', label: 'Accounts receivable', stmt: 'bs', side: 'A', vary: true },
  { key: 'inventory', label: 'Inventory', stmt: 'bs', side: 'A', vary: true },
  { key: 'otherCurrentAssets', label: 'Other current assets', stmt: 'bs', side: 'A', vary: true },
  { key: 'netFixedAssets', label: 'Net plant and equipment', stmt: 'bs', side: 'A', vary: true },
  { key: 'otherNonCurrentAssets', label: 'Other long-term assets', stmt: 'bs', side: 'A', vary: false },
  { key: 'payables', label: 'Accounts payable', stmt: 'bs', side: 'L', vary: true },
  { key: 'otherCurrentLiabilities', label: 'Other current liabilities', stmt: 'bs', side: 'L', vary: true },
  { key: 'notesPayable', label: 'Notes payable (short-term debt)', stmt: 'bs', side: 'L', vary: false },
  { key: 'longTermDebt', label: 'Long-term debt', stmt: 'bs', side: 'L', vary: false },
  { key: 'otherLongTermLiabilities', label: 'Other long-term liabilities', stmt: 'bs', side: 'L', vary: false },
  { key: 'commonStock', label: 'Common stock and paid-in surplus', stmt: 'bs', side: 'E', vary: false },
  { key: 'retainedEarnings', label: 'Retained earnings', stmt: 'bs', side: 'E' },
  { key: 'otherEquity', label: 'Other equity (treasury stock, AOCI)', stmt: 'bs', side: 'E', vary: false },
];

export const FIELD_KEYS = FIELDS.map((f) => f.key);

export function defaultVaries() {
  const v = {};
  for (const f of FIELDS) if (f.vary !== undefined) v[f.key] = f.vary;
  return v;
}

const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const div = (a, b) => (!Number.isFinite(a) || !Number.isFinite(b) || b === 0 ? null : a / b);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------- statements

export function normalize(raw = {}) {
  const out = {};
  for (const k of FIELD_KEYS) out[k] = num(raw[k]);
  return out;
}

// Adds every subtotal the planning model and the ratios need.
export function summarize(raw) {
  const s = normalize(raw);
  const grossProfit = s.sales - s.cogs;
  const ebit = grossProfit - s.opex - s.depreciation;
  const taxable = ebit - s.interest;
  const netIncome = taxable - s.taxes;
  const currentAssets = s.cash + s.receivables + s.inventory + s.otherCurrentAssets;
  const totalAssets = currentAssets + s.netFixedAssets + s.otherNonCurrentAssets;
  const currentLiabilities = s.payables + s.otherCurrentLiabilities + s.notesPayable;
  const totalLiabilities = currentLiabilities + s.longTermDebt + s.otherLongTermLiabilities;
  const equity = s.commonStock + s.retainedEarnings + s.otherEquity;
  return {
    ...s,
    grossProfit,
    ebit,
    ebitda: ebit + s.depreciation,
    taxable,
    netIncome,
    addToRE: netIncome - s.dividends,
    currentAssets,
    totalAssets,
    currentLiabilities,
    totalLiabilities,
    equity,
    totalLiabilitiesAndEquity: totalLiabilities + equity,
    imbalance: totalAssets - (totalLiabilities + equity),
    nwc: currentAssets - currentLiabilities,
  };
}

// Plain-language problems with the inputs. An empty list means the year is usable.
export function validate(raw) {
  const s = summarize(raw);
  const out = [];
  if (!(s.sales > 0)) out.push('Sales must be greater than zero.');
  if (s.totalAssets <= 0) out.push('Total assets are zero. Enter the balance sheet.');
  const tol = Math.max(1, Math.abs(s.totalAssets) * 0.001);
  if (s.totalAssets > 0 && Math.abs(s.imbalance) > tol) {
    out.push(
      `The balance sheet does not balance: assets exceed liabilities plus equity by ${s.imbalance.toFixed(2)}. ` +
        'Check for a missing line, for example other long-term items.'
    );
  }
  return out;
}

// ---------------------------------------------------------------- ratios (ch.3)

export const RATIO_DEFS = [
  { key: 'currentRatio', group: 'Liquidity', label: 'Current ratio', fmt: 'x', formula: 'Current assets / current liabilities', calc: (s) => div(s.currentAssets, s.currentLiabilities) },
  { key: 'quickRatio', group: 'Liquidity', label: 'Quick ratio', fmt: 'x', formula: '(Current assets - inventory) / current liabilities', calc: (s) => div(s.currentAssets - s.inventory, s.currentLiabilities) },
  { key: 'cashRatio', group: 'Liquidity', label: 'Cash ratio', fmt: 'x', formula: 'Cash / current liabilities', calc: (s) => div(s.cash, s.currentLiabilities) },
  { key: 'nwcToAssets', group: 'Liquidity', label: 'Net working capital to total assets', fmt: 'pct', formula: 'Net working capital / total assets', calc: (s) => div(s.nwc, s.totalAssets) },

  { key: 'totalDebtRatio', group: 'Leverage', label: 'Total debt ratio', fmt: 'pct', formula: '(Total assets - total equity) / total assets', calc: (s) => div(s.totalAssets - s.equity, s.totalAssets) },
  { key: 'debtEquity', group: 'Leverage', label: 'Debt-equity ratio', fmt: 'x', formula: 'Total debt / total equity', calc: (s) => div(s.totalAssets - s.equity, s.equity) },
  { key: 'equityMultiplier', group: 'Leverage', label: 'Equity multiplier', fmt: 'x', formula: 'Total assets / total equity', calc: (s) => div(s.totalAssets, s.equity) },
  { key: 'ltDebtRatio', group: 'Leverage', label: 'Long-term debt ratio', fmt: 'pct', formula: 'Long-term debt / (long-term debt + total equity)', calc: (s) => div(s.longTermDebt, s.longTermDebt + s.equity) },
  { key: 'timesInterestEarned', group: 'Leverage', label: 'Times interest earned', fmt: 'x', formula: 'EBIT / interest', calc: (s) => div(s.ebit, s.interest) },
  { key: 'cashCoverage', group: 'Leverage', label: 'Cash coverage', fmt: 'x', formula: '(EBIT + depreciation) / interest', calc: (s) => div(s.ebit + s.depreciation, s.interest) },

  { key: 'inventoryTurnover', group: 'Asset use', label: 'Inventory turnover', fmt: 'x', formula: 'Cost of goods sold / inventory', calc: (s) => div(s.cogs, s.inventory) },
  { key: 'daysInventory', group: 'Asset use', label: 'Days in inventory', fmt: 'days', formula: '365 / inventory turnover', calc: (s) => div(365 * s.inventory, s.cogs) },
  { key: 'receivablesTurnover', group: 'Asset use', label: 'Receivables turnover', fmt: 'x', formula: 'Sales / accounts receivable', calc: (s) => div(s.sales, s.receivables) },
  { key: 'daysReceivables', group: 'Asset use', label: 'Days in receivables', fmt: 'days', formula: '365 / receivables turnover', calc: (s) => div(365 * s.receivables, s.sales) },
  { key: 'nwcTurnover', group: 'Asset use', label: 'NWC turnover', fmt: 'x', formula: 'Sales / net working capital', calc: (s) => div(s.sales, s.nwc) },
  { key: 'fixedAssetTurnover', group: 'Asset use', label: 'Fixed asset turnover', fmt: 'x', formula: 'Sales / net fixed assets', calc: (s) => div(s.sales, s.netFixedAssets) },
  { key: 'totalAssetTurnover', group: 'Asset use', label: 'Total asset turnover', fmt: 'x', formula: 'Sales / total assets', calc: (s) => div(s.sales, s.totalAssets) },
  { key: 'capitalIntensity', group: 'Asset use', label: 'Capital intensity', fmt: 'x', formula: 'Total assets / sales', calc: (s) => div(s.totalAssets, s.sales) },

  { key: 'grossMargin', group: 'Profitability', label: 'Gross margin', fmt: 'pct', formula: '(Sales - COGS) / sales', calc: (s) => div(s.grossProfit, s.sales) },
  { key: 'operatingMargin', group: 'Profitability', label: 'Operating margin', fmt: 'pct', formula: 'EBIT / sales', calc: (s) => div(s.ebit, s.sales) },
  { key: 'ebitdaMargin', group: 'Profitability', label: 'EBITDA margin', fmt: 'pct', formula: 'EBITDA / sales', calc: (s) => div(s.ebitda, s.sales) },
  { key: 'profitMargin', group: 'Profitability', label: 'Profit margin', fmt: 'pct', formula: 'Net income / sales', calc: (s) => div(s.netIncome, s.sales) },
  { key: 'roa', group: 'Profitability', label: 'Return on assets (ROA)', fmt: 'pct', formula: 'Net income / total assets', calc: (s) => div(s.netIncome, s.totalAssets) },
  { key: 'roe', group: 'Profitability', label: 'Return on equity (ROE)', fmt: 'pct', formula: 'Net income / total equity', calc: (s) => div(s.netIncome, s.equity) },
  { key: 'payout', group: 'Profitability', label: 'Dividend payout ratio', fmt: 'pct', formula: 'Dividends / net income', calc: (s) => (s.netIncome > 0 ? div(s.dividends, s.netIncome) : null) },
  { key: 'retention', group: 'Profitability', label: 'Retention (plowback) ratio', fmt: 'pct', formula: '1 - payout ratio', calc: (s) => (s.netIncome > 0 ? 1 - s.dividends / s.netIncome : null) },
];

export function ratios(raw) {
  const s = raw && raw.totalAssets !== undefined ? raw : summarize(raw);
  const out = {};
  for (const d of RATIO_DEFS) out[d.key] = d.calc(s);
  return out;
}

// Cash flow ratios (Ross ch.3 cash flow discussion). `cf` is a year's cash flow statement as
// read from the filing: cfo, capex (a positive outflow), dividends, buybacks. Missing items give null.
export const CASH_FLOW_RATIO_DEFS = [
  { key: 'fcf', label: 'Free cash flow', fmt: 'money', formula: 'Operating cash flow - capital expenditure', calc: (s, cf) => (isNum(cf.cfo) && isNum(cf.capex) ? cf.cfo - cf.capex : null) },
  { key: 'fcfMargin', label: 'Free cash flow margin', fmt: 'pct', formula: 'Free cash flow / sales', calc: (s, cf) => (isNum(cf.cfo) && isNum(cf.capex) ? div(cf.cfo - cf.capex, s.sales) : null) },
  { key: 'cashConversion', label: 'Cash conversion', fmt: 'x', formula: 'Operating cash flow / net income', calc: (s, cf) => (isNum(cf.cfo) && s.netIncome > 0 ? cf.cfo / s.netIncome : null) },
  { key: 'capexToSales', label: 'Capital expenditure to sales', fmt: 'pct', formula: 'Capital expenditure / sales', calc: (s, cf) => (isNum(cf.capex) ? div(cf.capex, s.sales) : null) },
  { key: 'capexToDep', label: 'Capital expenditure to depreciation', fmt: 'x', formula: 'Capital expenditure / depreciation', calc: (s, cf) => (isNum(cf.capex) ? div(cf.capex, s.depreciation) : null) },
  { key: 'cfoToDebt', label: 'Operating cash flow to debt', fmt: 'pct', formula: 'Operating cash flow / (notes payable + long-term debt)', calc: (s, cf) => (isNum(cf.cfo) ? div(cf.cfo, s.notesPayable + s.longTermDebt) : null) },
  { key: 'shareholderReturn', label: 'Dividends and buybacks to operating cash flow', fmt: 'pct', formula: '(Dividends + share repurchases) / operating cash flow', calc: (s, cf) => (isNum(cf.cfo) && cf.cfo > 0 ? ((cf.dividends || 0) + (cf.buybacks || 0)) / cf.cfo : null) },
];

export function cashFlowRatios(raw, cf) {
  const s = raw && raw.totalAssets !== undefined ? raw : summarize(raw);
  const out = {};
  for (const d of CASH_FLOW_RATIO_DEFS) out[d.key] = cf ? d.calc(s, cf) : null;
  return out;
}

// ROE = profit margin x total asset turnover x equity multiplier (Ross, ch.3 DuPont identity).
export function dupont(raw) {
  const s = summarize(raw);
  const pm = div(s.netIncome, s.sales);
  const tat = div(s.sales, s.totalAssets);
  const em = div(s.totalAssets, s.equity);
  const roe = pm !== null && tat !== null && em !== null ? pm * tat * em : null;
  return { profitMargin: pm, totalAssetTurnover: tat, equityMultiplier: em, roe };
}

// ---------------------------------------------------------------- growth rates (ch.4)

// Internal growth = ROA x b / (1 - ROA x b). No outside financing of any kind.
export function internalGrowthRate(raw) {
  const s = summarize(raw);
  if (s.netIncome <= 0 || s.totalAssets <= 0) return null;
  const b = 1 - s.dividends / s.netIncome;
  const x = (s.netIncome / s.totalAssets) * b;
  return x >= 1 ? null : x / (1 - x);
}

// Sustainable growth = ROE x b / (1 - ROE x b). No new equity, debt-equity ratio held.
// Uses ending equity, the version the book computes (section 4.4 note).
export function sustainableGrowthRate(raw) {
  const s = summarize(raw);
  if (s.netIncome <= 0 || s.equity <= 0) return null;
  const b = 1 - s.dividends / s.netIncome;
  const x = (s.netIncome / s.equity) * b;
  return x >= 1 ? null : x / (1 - x);
}

// ---------------------------------------------------------------- sales trend

// series: sales, oldest first. Growth rates are the only forecast an income
// statement can support. The book takes the growth rate as given (ch.4).
export function growthFromHistory(series) {
  const s = (series || []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const n = s.length;
  const out = { n, yoy: [], avg: null, cagr: null, std: null, linear: null };
  if (n < 2) return out;
  for (let i = 1; i < n; i++) out.yoy.push(s[i] / s[i - 1] - 1);
  out.avg = out.yoy.reduce((a, b) => a + b, 0) / out.yoy.length;
  out.cagr = Math.pow(s[n - 1] / s[0], 1 / (n - 1)) - 1;
  if (out.yoy.length >= 2) {
    const m = out.avg;
    out.std = Math.sqrt(out.yoy.reduce((a, b) => a + (b - m) ** 2, 0) / (out.yoy.length - 1));
  }
  if (n >= 3) {
    // Least squares line through the points, projected one step ahead.
    const tBar = (n - 1) / 2;
    const yBar = s.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let t = 0; t < n; t++) {
      sxy += (t - tBar) * (s[t] - yBar);
      sxx += (t - tBar) ** 2;
    }
    const slope = sxy / sxx;
    const next = yBar + slope * (n - tBar);
    out.linear = { nextSales: next, growth: next / s[n - 1] - 1 };
  }
  return out;
}

// Low, base and high growth. The band is one standard deviation of year-on-year growth
// when there are three or more years, otherwise a stated assumption (default 5 points).
export function scenarioRates(hist, { method = 'cagr', assumedSpread = 0.05 } = {}) {
  let base = null;
  if (method === 'avg') base = hist.avg;
  else if (method === 'linear') base = hist.linear ? hist.linear.growth : null;
  else base = hist.cagr;
  if (base === null) return null;
  const fromData = hist.std !== null;
  const spread = fromData ? hist.std : assumedSpread;
  return { base, low: base - spread, high: base + spread, spread, spreadSource: fromData ? 'history' : 'assumed' };
}

// ---------------------------------------------------------------- pro forma (ch.4)

export const DEFAULTS = {
  growth: 0.1,
  capacityUtilization: 1, // 1 means fixed assets are fully used, so they grow with sales
  fixedAssetStep: null, // lump-sum fixed asset purchase, replaces proportional growth when set
  interest: 'flat', // 'flat' keeps interest at last year's dollars; 'scale' is the textbook version
  plug: 'longTermDebt', // where positive EFN goes: longTermDebt, notesPayable or equity
  // Used only when the base year has no taxable income to infer a rate from.
  // src: US federal corporate rate, 26 U.S.C. 11(b), 21% since the Tax Cuts and Jobs Act of 2017. State tax excluded.
  taxRateFallback: 0.21,
};

const PLUG_KEY = { longTermDebt: 'longTermDebt', notesPayable: 'notesPayable', equity: 'commonStock' };

// Percentage of sales pro forma. EFN = projected assets - projected liabilities and equity,
// before any new financing. Then EFN is placed in the plug, and a surplus pays down debt.
export function proForma(rawBase, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const varies = { ...defaultVaries(), ...(opts.varies || {}) };
  const b = summarize(rawBase);
  if (!(b.sales > 0)) return { error: 'Sales must be greater than zero.' };

  const g = num(o.growth);
  const k = 1 + g;
  const flags = [];
  let u = num(o.capacityUtilization);
  if (!(u > 0 && u <= 1)) u = 1;

  // Income statement. All costs run at last year's percentage of sales (constant margin).
  const sales = b.sales * k;
  const cogs = b.cogs * k;
  const opex = b.opex * k;
  const depreciation = b.depreciation * k;
  const interest = o.interest === 'scale' ? b.interest * k : b.interest;
  const ebit = sales - cogs - opex - depreciation;
  const taxable = ebit - interest;
  let taxRate = b.taxable > 0 ? b.taxes / b.taxable : null;
  if (taxRate === null) {
    taxRate = num(o.taxRateFallback);
    flags.push(`Last year had no taxable income, so a ${(taxRate * 100).toFixed(0)}% tax rate is assumed.`);
  }
  const taxes = taxable > 0 ? taxable * taxRate : 0;
  const netIncome = taxable - taxes;
  let payout = 0;
  if (b.netIncome > 0) payout = Math.max(0, b.dividends / b.netIncome);
  else flags.push('Last year had no profit, so the dividend payout ratio is set to zero.');
  const dividends = netIncome > 0 ? netIncome * payout : 0;
  const addToRE = netIncome - dividends;

  // Balance sheet before any new financing.
  const scaled = (key) => (varies[key] ? b[key] * k : b[key]);
  const pre = {
    cash: scaled('cash'),
    receivables: scaled('receivables'),
    inventory: scaled('inventory'),
    otherCurrentAssets: scaled('otherCurrentAssets'),
    otherNonCurrentAssets: scaled('otherNonCurrentAssets'),
    payables: scaled('payables'),
    otherCurrentLiabilities: scaled('otherCurrentLiabilities'),
    notesPayable: scaled('notesPayable'),
    longTermDebt: scaled('longTermDebt'),
    otherLongTermLiabilities: scaled('otherLongTermLiabilities'),
    commonStock: scaled('commonStock'),
    otherEquity: scaled('otherEquity'),
    retainedEarnings: b.retainedEarnings + addToRE,
  };
  // Fixed assets. Below full capacity, existing plant absorbs growth until sales reach
  // full-capacity sales = sales / utilization (Ross, example 4.1).
  const step = o.fixedAssetStep === null || o.fixedAssetStep === '' || o.fixedAssetStep === undefined ? null : num(o.fixedAssetStep);
  if (step !== null) pre.netFixedAssets = b.netFixedAssets + step;
  else if (!varies.netFixedAssets) pre.netFixedAssets = b.netFixedAssets;
  else pre.netFixedAssets = b.netFixedAssets * (u < 1 ? Math.max(1, k * u) : k);

  const income = { sales, cogs, opex, depreciation, interest, taxes, dividends };
  const preSummary = summarize({ ...income, ...pre });
  const efn = preSummary.totalAssets - preSummary.totalLiabilitiesAndEquity;

  // Financing. A shortfall goes to the chosen plug. A surplus retires notes, then long-term debt,
  // and anything left piles up as cash.
  const post = { ...pre };
  const financing = { notesPayable: 0, longTermDebt: 0, commonStock: 0, cash: 0 };
  if (efn > 0) {
    const key = PLUG_KEY[o.plug] || 'longTermDebt';
    post[key] += efn;
    financing[key] += efn;
  } else if (efn < 0) {
    let s = -efn;
    const n = Math.min(s, post.notesPayable);
    post.notesPayable -= n;
    financing.notesPayable -= n;
    s -= n;
    const l = Math.min(s, post.longTermDebt);
    post.longTermDebt -= l;
    financing.longTermDebt -= l;
    s -= l;
    post.cash += s;
    financing.cash += s;
  }
  const projected = summarize({ ...income, ...post });

  return {
    growth: g,
    utilization: u,
    taxRate,
    payout,
    income: { ...income, ebit, taxable, netIncome, addToRE },
    pre,
    preSummary,
    efn,
    post,
    financing,
    projected,
    base: b,
    flags,
  };
}

// EFN across a range of growth rates (the data behind ch.4, table 4.8 and figure 4.1).
export function efnCurve(rawBase, opts, growths) {
  const out = [];
  for (const g of growths) {
    const r = proForma(rawBase, { ...opts, growth: g });
    if (r.error) continue;
    out.push({
      growth: g,
      assetIncrease: r.preSummary.totalAssets - r.base.totalAssets,
      addToRE: r.income.addToRE,
      efn: r.efn,
      debtEquity: ratios(r.projected).debtEquity,
    });
  }
  return out;
}

// Growth rate at which EFN is exactly zero, under the same assumptions as the pro forma.
// Equals the textbook internal growth rate only when no liability moves with sales.
export function zeroEfnGrowth(rawBase, opts = {}) {
  const f = (g) => {
    const r = proForma(rawBase, { ...opts, growth: g });
    return r.error ? NaN : r.efn;
  };
  let lo = -0.5;
  let hi = 3;
  const flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (fm * f(lo) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- insights

// Every line is computed from the numbers above. Thresholds are stated in the text.
// f = { money, pct, x } formatters supplied by the caller (units belong to the page).
export function insights(ctx, f) {
  const { pf, internal, sustainable, zeroEfn, baseRatios, pfRatios, histRatios } = ctx;
  const out = [];
  if (!pf || pf.error) return out;
  const g = pf.growth;
  const newSales = pf.income.sales - pf.base.sales;

  if (pf.efn > 0) {
    out.push({
      level: 'watch',
      title: 'Outside financing is needed',
      text: `At ${f.pct(g)} growth, sales rise from ${f.money(pf.base.sales)} to ${f.money(pf.income.sales)}. Assets grow faster than retained earnings and spontaneous liabilities, leaving a gap of ${f.money(pf.efn)}, about ${f.pct(pf.efn / newSales)} of the new sales.`,
    });
  } else {
    out.push({
      level: 'good',
      title: 'Growth funds itself',
      text: `At ${f.pct(g)} growth the plan generates a surplus of ${f.money(-pf.efn)}. It can retire debt, build cash or be paid out.`,
    });
  }

  if (internal !== null) {
    out.push(
      g > internal
        ? { level: 'watch', title: 'Above the internal growth rate', text: `Planned growth of ${f.pct(g)} is above the internal growth rate of ${f.pct(internal)}, the most the firm can grow with no outside financing of any kind.` }
        : { level: 'good', title: 'Within the internal growth rate', text: `Planned growth of ${f.pct(g)} is below the internal growth rate of ${f.pct(internal)}.` }
    );
  }
  if (sustainable !== null) {
    out.push(
      g > sustainable
        ? { level: 'watch', title: 'Above the sustainable growth rate', text: `The sustainable growth rate is ${f.pct(sustainable)}. Growing faster with a constant debt-equity ratio needs a higher profit margin, more retention, better asset turnover, or new equity.` }
        : { level: 'good', title: 'Within the sustainable growth rate', text: `Planned growth of ${f.pct(g)} is below the sustainable rate of ${f.pct(sustainable)}, so leverage need not rise.` }
    );
  }
  if (zeroEfn !== null && internal !== null && Math.abs(zeroEfn - internal) > 0.0025) {
    out.push({
      level: 'info',
      title: 'Break-even growth differs from the textbook formula',
      text: `EFN reaches zero at ${f.pct(zeroEfn)} growth under your settings, not at the formula's ${f.pct(internal)}. The formula assumes no liability moves with sales and fixed assets are at full capacity.`,
    });
  }

  const de0 = baseRatios.debtEquity;
  const de1 = pfRatios.debtEquity;
  if (de0 !== null && de1 !== null && Math.abs(de1 - de0) >= 0.01) {
    out.push({
      level: de1 > de0 ? 'watch' : 'info',
      title: de1 > de0 ? 'Leverage rises' : 'Leverage falls',
      text: `After the financing plug, the debt-equity ratio moves from ${f.x(de0)} to ${f.x(de1)}.`,
    });
  }
  if (pfRatios.currentRatio !== null && pfRatios.currentRatio < 1) {
    out.push({ level: 'watch', title: 'Current ratio below 1', text: `The pro forma current ratio is ${f.x(pfRatios.currentRatio)}. Current liabilities exceed current assets.` });
  }
  if (baseRatios.timesInterestEarned !== null && baseRatios.timesInterestEarned < 2) {
    out.push({ level: 'watch', title: 'Thin interest coverage', text: `Times interest earned is ${f.x(baseRatios.timesInterestEarned)}, below 2.` });
  }
  if (pf.utilization === 1 && pf.base.netFixedAssets > 0 && ctx.fixedAssetsVary) {
    out.push({
      level: 'info',
      title: 'Full capacity is assumed',
      text: `Each $1 of sales needs ${f.x(pf.base.netFixedAssets / pf.base.sales)} of fixed assets. If the plant has slack, enter the capacity utilization to lower EFN.`,
    });
  }

  if (histRatios && histRatios.length >= 2) {
    const first = histRatios[0];
    const last = histRatios[histRatios.length - 1];
    const pm0 = first.r.profitMargin;
    const pm1 = last.r.profitMargin;
    if (pm0 !== null && pm1 !== null && Math.abs(pm1 - pm0) >= 0.01) {
      out.push({
        level: pm1 < pm0 ? 'watch' : 'good',
        title: pm1 < pm0 ? 'Profit margin is falling' : 'Profit margin is rising',
        text: `Profit margin moved from ${f.pct(pm0)} in ${first.label} to ${f.pct(pm1)} in ${last.label}. The forecast holds it at ${f.pct(pfRatios.profitMargin)}.`,
      });
    }
    const d0 = first.r.daysReceivables;
    const d1 = last.r.daysReceivables;
    if (d0 !== null && d1 !== null && Math.abs(d1 - d0) >= 5) {
      out.push({
        level: d1 > d0 ? 'watch' : 'good',
        title: d1 > d0 ? 'Customers are paying slower' : 'Customers are paying faster',
        text: `Days in receivables moved from ${d0.toFixed(0)} to ${d1.toFixed(0)}.`,
      });
    }
  }
  return out;
}
