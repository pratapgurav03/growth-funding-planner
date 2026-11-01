// SEC EDGAR "companyfacts" JSON -> planner statements. Pure: no network, no imports.
// Source of truth is the XBRL data each US filer submits with its 10-K, served by
// https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json (US GAAP, annual filings only).
//
// Every figure is read from a tagged fact. Lines the planner needs but filers do not
// tag one-to-one (other current assets, other long-term liabilities and so on) are
// DERIVED as the difference between a tagged subtotal and the tagged lines under it,
// so the balance sheet balances by construction. A tag that is missing is reported in
// `notFound` and set to zero. Nothing is estimated.

const DAY = 86400000;
const ANNUAL_FORMS = new Set(['10-K', '10-K/A', '10-KT', '10-KT/A']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// First tag that has a value for the year wins, so a company that renamed a tag
// part-way through its history still reads cleanly.
export const TAGS = {
  sales: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueGoodsNet', 'SalesRevenueServicesNet'],
  cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold', 'CostOfServices'],
  operatingIncome: ['OperatingIncomeLoss'],
  pretax: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments'],
  taxes: ['IncomeTaxExpenseBenefit'],
  interest: ['InterestExpense', 'InterestExpenseNonoperating', 'InterestExpenseDebt', 'InterestAndDebtExpense'],
  depreciation: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet', 'Depreciation'],
  netIncome: ['NetIncomeLoss'],
  profitLoss: ['ProfitLoss'],
  continuingIncome: ['IncomeLossFromContinuingOperations'],
  dividends: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock', 'PaymentsOfOrdinaryDividends'],

  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  receivables: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsAndOtherReceivablesNetCurrent'],
  inventory: ['InventoryNet'],
  assetsCurrent: ['AssetsCurrent'],
  ppe: ['PropertyPlantAndEquipmentNet', 'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization'],
  assets: ['Assets'],
  payables: ['AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent'],
  liabilitiesCurrent: ['LiabilitiesCurrent'],
  debtCurrent: ['DebtCurrent'],
  shortBorrowings: ['ShortTermBorrowings'],
  commercialPaper: ['CommercialPaper'],
  ltdCurrent: ['LongTermDebtCurrent'],
  ltdNoncurrent: ['LongTermDebtNoncurrent', 'LongTermNotesPayable'],
  ltdTotal: ['LongTermDebt'],
  equityTotal: ['StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'StockholdersEquity', 'PartnersCapitalIncludingPortionAttributableToNoncontrollingInterest', 'PartnersCapital', 'MembersEquity'],
  liabilitiesAndEquity: ['LiabilitiesAndStockholdersEquity'],
  stockPlusApic: ['CommonStocksIncludingAdditionalPaidInCapital'],
  commonStockPar: ['CommonStockValue'],
  apic: ['AdditionalPaidInCapital', 'AdditionalPaidInCapitalCommonStock'],
  retainedEarnings: ['RetainedEarningsAccumulatedDeficit'],

  cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  cfi: ['NetCashProvidedByUsedInInvestingActivities', 'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations'],
  cff: ['NetCashProvidedByUsedInFinancingActivities', 'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  buybacks: ['PaymentsForRepurchaseOfCommonStock'],
  debtIssued: ['ProceedsFromIssuanceOfLongTermDebt', 'ProceedsFromIssuanceOfDebt'],
  debtRepaid: ['RepaymentsOfLongTermDebt', 'RepaymentsOfDebt'],
  sbc: ['ShareBasedCompensation'],
  netChangeCash: ['CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect', 'CashAndCashEquivalentsPeriodIncreaseDecrease'],
};

const DURATION = new Set(['sales', 'cogs', 'operatingIncome', 'pretax', 'taxes', 'interest', 'depreciation', 'netIncome', 'profitLoss', 'continuingIncome', 'dividends',
  'cfo', 'cfi', 'cff', 'capex', 'buybacks', 'debtIssued', 'debtRepaid', 'sbc', 'netChangeCash']);

const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

// end date -> value, annual 10-K facts only, latest filing wins (so restatements replace old numbers).
function annualSeries(usgaap, tag, duration) {
  const rows = usgaap[tag] && usgaap[tag].units && usgaap[tag].units.USD;
  const out = new Map();
  if (!Array.isArray(rows)) return out;
  const filedAt = new Map();
  for (const r of rows) {
    if (!ANNUAL_FORMS.has(r.form) || typeof r.val !== 'number' || !r.end) continue;
    if (duration) {
      if (!r.start) continue;
      const d = days(r.start, r.end);
      if (d < 340 || d > 380) continue;
    } else if (r.start) continue;
    const prev = filedAt.get(r.end);
    if (prev === undefined || String(r.filed) >= prev) { filedAt.set(r.end, String(r.filed)); out.set(r.end, r.val); }
  }
  return out;
}

export function yearLabel(end) {
  const [y, m] = end.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

const FIELD_KEYS = ['sales', 'cogs', 'opex', 'depreciation', 'interest', 'taxes', 'dividends',
  'cash', 'receivables', 'inventory', 'otherCurrentAssets', 'netFixedAssets', 'otherNonCurrentAssets',
  'payables', 'otherCurrentLiabilities', 'notesPayable', 'longTermDebt', 'otherLongTermLiabilities',
  'commonStock', 'retainedEarnings', 'otherEquity'];

const PLAIN = {
  cogs: 'Cost of goods sold', depreciation: 'Depreciation and amortization', interest: 'Interest expense', taxes: 'Income taxes',
  dividends: 'Dividends paid', cash: 'Cash', receivables: 'Accounts receivable', inventory: 'Inventory', netFixedAssets: 'Net plant and equipment',
  payables: 'Accounts payable', retainedEarnings: 'Retained earnings', capex: 'Capital expenditure', cfo: 'Operating cash flow',
  cfi: 'Investing cash flow', cff: 'Financing cash flow', buybacks: 'Share repurchases', pretax: 'Pre-tax income',
};

// SEC's ticker list sometimes points a ticker at a new holding company that has no filing history yet.
// The financials still sit under the old registrant, so look there. Add a line when it happens again.
export const PREDECESSOR = {
  '0002115436': '0000034088', // ExxonMobil Holdings Corp (XOM) took over from Exxon Mobil Corp in 2026
};
export const factsCik = (cik) => PREDECESSOR[cik] || cik;

// Turns the companyfacts JSON into planner years (oldest first). Amounts are whole dollars.
export function buildStatements(facts, { years = 5 } = {}) {
  const usgaap = facts && facts.facts && facts.facts['us-gaap'];
  if (!usgaap || !Object.keys(usgaap).length) {
    return { error: 'No US GAAP annual data for this company. Foreign filers (20-F, IFRS) are not supported.' };
  }
  // Banks and insurers have no current assets, cost of goods sold or inventory, so every ratio here would mislead.
  // Only a tag that is still being reported counts. GE, Freeport and Deere carry bank or insurance tags from ten years ago.
  const lastEnd = (tag) => { const u = usgaap[tag] && usgaap[tag].units && usgaap[tag].units.USD; return Array.isArray(u) && u.length ? u.reduce((m, r) => (r.end > m ? r.end : m), '') : ''; };
  let latest = '';
  for (const tag of ['Assets', 'Liabilities', 'StockholdersEquity']) { const e = lastEnd(tag); if (e > latest) latest = e; }
  const recent = (tag) => { const e = lastEnd(tag); return !!e && (!latest || Date.parse(latest) - Date.parse(e) < 800 * DAY); };
  const hasUsd = (tag) => recent(tag);
  if (['Deposits', 'InterestAndFeeIncomeLoansAndLeases', 'PremiumsEarnedNet'].some(hasUsd)) {
    return { error: 'This looks like a bank or insurer. They do not report current assets or cost of goods sold, so the planner ratios and forecast would mislead. Not supported.' };
  }
  const cache = {};
  const series = (k) => cache[k] || (cache[k] = TAGS[k].map((t) => annualSeries(usgaap, t, DURATION.has(k))));
  const get = (k, end) => { for (const m of series(k)) if (m.has(end)) return m.get(end); return null; };

  const salesEnds = new Set();
  for (const m of series('sales')) for (const e of m.keys()) salesEnds.add(e);
  if (!salesEnds.size) return { error: 'No annual revenue found in 10-K filings. Banks, insurers and some utilities tag revenue differently and are not supported yet.' };
  const ends = [...salesEnds].filter((e) => get('assets', e) !== null).sort().slice(-Math.max(1, years));
  if (!ends.length) return { error: 'No balance sheet found for the years with revenue.' };

  const missingAll = new Set();
  const missingSome = {};
  const notes = [];
  const out = [];
  const checks = [];
  let derivedPretax = null;

  for (const end of ends) {
    const lab = yearLabel(end);
    const miss = (k) => { (missingSome[k] = missingSome[k] || []).push(lab); };
    const g = (k, label) => { const v = get(k, end); if (v === null && label) miss(label); return v; };
    const z = (k, key) => { const v = get(k, end); if (v === null) miss(key); return v === null ? 0 : v; };

    const sales = get('sales', end);
    const assets = get('assets', end);
    let cogs = z('cogs', 'cogs');
    const dep = z('depreciation', 'depreciation');
    const interest = z('interest', 'interest');
    const taxes = z('taxes', 'taxes');
    const dividends = z('dividends', 'dividends');

    // EBIT = pre-tax income + interest expense, so other income sits inside operating cost
    // and reported net income is reproduced exactly. Reported operating income is the fallback.
    let pretax = get('pretax', end);
    if (pretax === null) {
      // No pre-tax tag: consolidated income from continuing operations plus income tax is the same figure.
      const ci = get('continuingIncome', end) !== null ? get('continuingIncome', end) : get('profitLoss', end);
      const tx = get('taxes', end);
      if (ci !== null && tx !== null) { pretax = ci + tx; (derivedPretax = derivedPretax || []).push(lab); }
    }
    let ebit;
    if (pretax !== null) ebit = pretax + interest;
    else {
      const oi = get('operatingIncome', end);
      if (oi !== null) { ebit = oi; miss('pretax'); } else { ebit = sales - cogs; miss('pretax'); }
    }
    let opex = sales - cogs - dep - ebit;
    if (opex < 0) {
      // The filer's cost of sales already contains depreciation or other operating cost, so counting both overstates cost.
      // Moving the overlap out of cost of goods sold keeps EBIT and net income exactly as filed.
      if (cogs + opex >= 0) {
        notes.push(`${lab}: cost of goods sold (${Math.round(cogs)}) appears to include depreciation or other operating cost. ${Math.round(-opex)} was taken out of it so that EBIT matches the filing, and operating expenses are zero.`);
        cogs += opex; opex = 0;
      } else notes.push(`${lab}: operating costs came out negative (${Math.round(opex)}). Depreciation is probably larger than the operating cost left after cost of goods sold.`);
    }

    const cash = z('cash', 'cash');
    const receivables = z('receivables', 'receivables');
    const inventory = z('inventory', 'inventory');
    const ca = get('assetsCurrent', end);
    const currentAssets = ca === null ? cash + receivables + inventory : ca;
    if (ca === null) miss('assetsCurrent');
    const ppe = z('ppe', 'netFixedAssets');
    const otherCurrentAssets = currentAssets - cash - receivables - inventory;
    const otherNonCurrentAssets = assets - currentAssets - ppe;

    const equityTotal = get('equityTotal', end);
    if (equityTotal === null) { notes.push(`${lab}: stockholders' equity is not tagged, so the year was skipped.`); continue; }
    const le = get('liabilitiesAndEquity', end);
    const totalLiab = (le === null ? assets : le) - equityTotal;

    const payables = z('payables', 'payables');
    const dc = get('debtCurrent', end);
    const notesPayable = dc !== null ? dc : (get('shortBorrowings', end) || 0) + (get('commercialPaper', end) || 0) + (get('ltdCurrent', end) || 0);
    const lc = get('liabilitiesCurrent', end);
    const currentLiab = lc === null ? payables + notesPayable : lc;
    if (lc === null) miss('liabilitiesCurrent');
    const lnc = get('ltdNoncurrent', end);
    let longTermDebt;
    if (lnc !== null) longTermDebt = lnc;
    else { const lt = get('ltdTotal', end); longTermDebt = lt === null ? 0 : lt - (get('ltdCurrent', end) || 0); if (lt === null) miss('longTermDebt'); }
    const otherCurrentLiabilities = currentLiab - payables - notesPayable;
    const otherLongTermLiabilities = totalLiab - currentLiab - longTermDebt;

    const combined = get('stockPlusApic', end);
    const commonStock = combined !== null ? combined : (get('commonStockPar', end) || 0) + (get('apic', end) || 0);
    const retainedEarnings = z('retainedEarnings', 'retainedEarnings');
    const otherEquity = equityTotal - commonStock - retainedEarnings;

    const y = { label: lab, end, sales, cogs, opex, depreciation: dep, interest, taxes, dividends,
      cash, receivables, inventory, otherCurrentAssets, netFixedAssets: ppe, otherNonCurrentAssets,
      payables, otherCurrentLiabilities, notesPayable, longTermDebt, otherLongTermLiabilities,
      commonStock, retainedEarnings, otherEquity };
    for (const k of ['otherCurrentAssets', 'otherCurrentLiabilities', 'otherLongTermLiabilities', 'otherNonCurrentAssets']) {
      if (y[k] < -Math.abs(assets) * 0.005) notes.push(`${lab}: derived ${k} is negative (${Math.round(y[k])}). A tag the filer uses probably overlaps another line, so check this year by hand.`);
    }

    const cfoV = g('cfo'), capexV = g('capex');
    y.cf = {
      netIncome: get('netIncome', end) !== null ? get('netIncome', end) : get('profitLoss', end), depreciation: get('depreciation', end), sbc: get('sbc', end),
      cfo: cfoV, capex: capexV, cfi: get('cfi', end), cff: get('cff', end),
      dividends: get('dividends', end), buybacks: get('buybacks', end),
      debtIssued: get('debtIssued', end), debtRepaid: get('debtRepaid', end), netChangeCash: get('netChangeCash', end),
      fcf: cfoV !== null && capexV !== null ? cfoV - capexV : null,
    };
    if (cfoV === null) miss('cfo');
    if (capexV === null) miss('capex');

    const built = pretax !== null ? pretax - taxes : ebit - interest - taxes;
    // Net income attributable to the parent includes discontinued operations and drops minority interest, which the
    // planner does not model. Consolidated income from continuing operations is the like-for-like measure, so the
    // rebuilt figure only counts as wrong when it matches none of the figures the filer reports.
    const refs = [get('continuingIncome', end), get('netIncome', end), get('profitLoss', end)].filter((v) => v !== null);
    checks.push({ label: lab, netIncomeBuilt: built, netIncomeReported: y.cf.netIncome, refs });
    out.push(y);
  }

  if (!out.length) return { error: 'No usable fiscal year was found.' };

  const total = out.length;
  const notFound = [];
  const partial = [];
  for (const [k, labs] of Object.entries(missingSome)) {
    const name = PLAIN[k] || k;
    if (labs.length >= total) { notFound.push(name); missingAll.add(k); }
    else partial.push(`${name} (${labs.join(', ')})`);
  }
  if (derivedPretax) notes.push(`Pre-tax income is not tagged in ${derivedPretax.join(', ')}, so it is income from continuing operations plus income taxes.`);
  if (notFound.length) notes.push(`Not tagged in any year, set to zero: ${notFound.join('; ')}.`);
  if (partial.length) notes.push(`Not tagged in some years, set to zero there: ${partial.join('; ')}.`);

  for (const c of checks) {
    if (!c.refs.length) continue;
    const near = (v) => Math.abs(c.netIncomeBuilt - v) <= Math.max(1, Math.abs(v) * 0.01);
    if (c.refs.some(near)) continue;
    const rep = c.refs.reduce((best, v) => (Math.abs(v - c.netIncomeBuilt) < Math.abs(best - c.netIncomeBuilt) ? v : best));
    notes.push(`${c.label}: net income rebuilt from the lines is ${Math.round(c.netIncomeBuilt)}, the closest figure in the filing is ${Math.round(rep)}. The gap is usually minority interest, equity-method income or discontinued operations.`);
  }
  notes.push('Derived lines: EBIT is pre-tax income plus interest expense. Operating expenses are what is left after cost of goods sold, depreciation and EBIT. Other current assets, other long-term assets, other current and long-term liabilities and other equity are the differences between tagged subtotals and the tagged lines under them.');
  if (out.length < years) notes.push(`Only ${out.length} fiscal year${out.length === 1 ? '' : 's'} of annual data with a balance sheet were found.`);

  // Cover-page share count: the most recent value the company reported, from any filing type.
  let shares = null, sharesAsOf = null, sharesFiled = '', manyClasses = false;
  const deiRows = facts.facts.dei && facts.facts.dei.EntityCommonStockSharesOutstanding && facts.facts.dei.EntityCommonStockSharesOutstanding.units && facts.facts.dei.EntityCommonStockSharesOutstanding.units.shares;
  if (Array.isArray(deiRows)) {
    for (const r of deiRows) {
      if (typeof r.val !== 'number' || !r.end) continue;
      const filed = String(r.filed || '');
      if (sharesAsOf === null || r.end > sharesAsOf || (r.end === sharesAsOf && filed >= sharesFiled)) { shares = r.val; sharesAsOf = r.end; sharesFiled = filed; }
    }
    // Several share classes report on the same cover date. One number would be wrong by orders of magnitude.
    if (sharesAsOf !== null) manyClasses = new Set(deiRows.filter((r) => r.end === sharesAsOf && typeof r.val === 'number').map((r) => r.val)).size > 1;
  }
  if (manyClasses) { notes.push(`The cover page lists several share classes as of ${sharesAsOf}, so shares outstanding were left blank. Enter the total on the Valuation tab.`); shares = null; }
  // Berkshire's cover-page count in the SEC feed is from 2011. A stale count gives a per-share value that is wrong by a wide margin.
  if (shares !== null && out.length && Date.parse(out[out.length - 1].end) - Date.parse(sharesAsOf) > 400 * DAY) {
    notes.push(`The only share count on file is from ${sharesAsOf}, well before the latest fiscal year, so shares outstanding were left blank. Enter the total on the Valuation tab.`);
    shares = null;
  }
  if (shares !== null) notes.push(`Shares outstanding (${shares.toLocaleString('en-US')}, as of ${sharesAsOf}) come from the filing cover page. Companies with several share classes may show only one class, so check it before relying on a per-share value.`);

  return {
    shares,
    sharesAsOf,
    company: { name: facts.entityName || null, cik: facts.cik === undefined ? null : String(facts.cik).padStart(10, '0') },
    units: 'ones',
    years: out,
    notFound,
    notes,
    fieldKeys: FIELD_KEYS,
  };
}

// Picks the company a user meant from SEC's company_tickers.json ({"0": {cik_str, ticker, title}, ...}).
export function matchCompany(tickers, query, limit = 8) {
  const q = String(query || '').trim();
  if (!q) return [];
  const rows = Object.values(tickers || {}).map((r) => ({ cik: String(r.cik_str).padStart(10, '0'), ticker: String(r.ticker), name: String(r.title) }));
  const up = q.toUpperCase();
  const lower = q.toLowerCase();
  const digits = /^\d+$/.test(q) ? q.padStart(10, '0') : null;
  const score = (r) => {
    if (r.ticker.toUpperCase() === up) return 0;
    if (digits && r.cik === digits) return 0;
    const n = r.name.toLowerCase();
    if (n === lower) return 1;
    if (n.startsWith(lower)) return 2;
    if (n.includes(lower)) return 3;
    return 9;
  };
  return rows.map((r) => ({ r, s: score(r) })).filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.r.name.length - b.r.name.length)
    .slice(0, limit).map((x) => x.r);
}
