// Made-up company in the shape of SEC's companyfacts JSON, used by the tests and for offline demos.
// A made-up company in the shape of SEC's companyfacts JSON. Three fiscal years ending late September.
const ENDS = ['2023-09-30', '2024-09-28', '2025-09-27'];
const STARTS = ['2022-10-01', '2023-10-01', '2024-09-29'];
const FILED = ['2023-11-02', '2024-11-01', '2025-11-03'];
export const Y = [
  { sales: 1000, cogs: 600, dep: 50, pretax: 200, interest: 20, tax: 40, ni: 160, div: 30, cfo: 210, capex: 70,
    assets: 1600, ca: 640, cash: 240, ar: 200, inv: 120, ppe: 750, ap: 160, dc: 30, lc: 330, ltd: 450, eq: 700, par: 10, apic: 170, re: 600 },
  { sales: 1100, cogs: 650, dep: 55, pretax: 230, interest: 20, tax: 46, ni: 184, div: 35, cfo: 235, capex: 75,
    assets: 1800, ca: 700, cash: 250, ar: 230, inv: 140, ppe: 850, ap: 180, dc: 40, lc: 360, ltd: 480, eq: 800, par: 10, apic: 180, re: 700 },
  { sales: 1250, cogs: 720, dep: 60, pretax: 280, interest: 25, tax: 56, ni: 224, div: 40, cfo: 260, capex: 80,
    assets: 2000, ca: 800, cash: 300, ar: 250, inv: 150, ppe: 900, ap: 200, dc: 50, lc: 400, ltd: 500, eq: 900, par: 10, apic: 190, re: 800 },
];

export function make({ revenueTagFirstYear = 'SalesRevenueNet' } = {}) {
  const us = {};
  const add = (tag, row) => { (us[tag] = us[tag] || { units: { USD: [] } }).units.USD.push(row); };
  const dur = (tag, f) => Y.forEach((y, i) => add(tag, { start: STARTS[i], end: ENDS[i], val: f(y), accn: `a${i}`, fy: 2023 + i, fp: 'FY', form: '10-K', filed: FILED[i] }));
  const inst = (tag, f) => Y.forEach((y, i) => add(tag, { end: ENDS[i], val: f(y), accn: `a${i}`, fy: 2023 + i, fp: 'FY', form: '10-K', filed: FILED[i] }));

  // Revenue tag changes in 2024. 2024 is first filed at 1090, then restated to 1100 in the next 10-K.
  add(revenueTagFirstYear, { start: STARTS[0], end: ENDS[0], val: 1000, fy: 2023, fp: 'FY', form: '10-K', filed: FILED[0] });
  add('RevenueFromContractWithCustomerExcludingAssessedTax', { start: STARTS[1], end: ENDS[1], val: 1090, fy: 2024, fp: 'FY', form: '10-K', filed: FILED[1] });
  add('RevenueFromContractWithCustomerExcludingAssessedTax', { start: STARTS[1], end: ENDS[1], val: 1100, fy: 2025, fp: 'FY', form: '10-K', filed: FILED[2] });
  add('RevenueFromContractWithCustomerExcludingAssessedTax', { start: STARTS[2], end: ENDS[2], val: 1250, fy: 2025, fp: 'FY', form: '10-K', filed: FILED[2] });
  // A quarter and a 10-Q balance sheet that must be ignored.
  add('RevenueFromContractWithCustomerExcludingAssessedTax', { start: '2025-03-30', end: '2025-06-28', val: 999999, fy: 2025, fp: 'Q3', form: '10-Q', filed: '2025-08-01' });
  add('Assets', { end: '2025-06-28', val: 123456, fy: 2025, fp: 'Q3', form: '10-Q', filed: '2025-08-01' });

  dur('CostOfRevenue', (y) => y.cogs);
  dur('DepreciationDepletionAndAmortization', (y) => y.dep);
  dur('IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', (y) => y.pretax);
  dur('InterestExpense', (y) => y.interest);
  dur('IncomeTaxExpenseBenefit', (y) => y.tax);
  dur('NetIncomeLoss', (y) => y.ni);
  dur('PaymentsOfDividends', (y) => y.div);
  dur('NetCashProvidedByUsedInOperatingActivities', (y) => y.cfo);
  dur('PaymentsToAcquirePropertyPlantAndEquipment', (y) => y.capex);
  inst('Assets', (y) => y.assets);
  inst('AssetsCurrent', (y) => y.ca);
  inst('CashAndCashEquivalentsAtCarryingValue', (y) => y.cash);
  inst('AccountsReceivableNetCurrent', (y) => y.ar);
  inst('InventoryNet', (y) => y.inv);
  inst('PropertyPlantAndEquipmentNet', (y) => y.ppe);
  inst('AccountsPayableCurrent', (y) => y.ap);
  inst('DebtCurrent', (y) => y.dc);
  inst('LiabilitiesCurrent', (y) => y.lc);
  inst('LongTermDebtNoncurrent', (y) => y.ltd);
  inst('StockholdersEquity', (y) => y.eq);
  inst('LiabilitiesAndStockholdersEquity', (y) => y.assets);
  inst('CommonStockValue', (y) => y.par);
  inst('AdditionalPaidInCapital', (y) => y.apic);
  inst('RetainedEarningsAccumulatedDeficit', (y) => y.re);
  const dei = { EntityCommonStockSharesOutstanding: { units: { shares: [
    { end: '2025-07-18', val: 490000, form: '10-Q', filed: '2025-08-01' },
    { end: '2025-10-20', val: 500000, form: '10-K', filed: '2025-11-03' }] } } };
  return { cik: 1234567, entityName: 'ACME INC', facts: { 'us-gaap': us, dei } };
}
