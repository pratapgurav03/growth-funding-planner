# Sources

Where every built-in figure in the planner came from, and how far to trust it. Company
numbers loaded from SEC EDGAR are not listed here: each load links to the filing list it
came from.

## Book cases and defaults (`src/planner/examples.js`)

The planner takes the user's own statements, so it has almost no assumptions of
its own. What it does carry:

| Input | Value | Source |
|---|---|---|
| Fallback tax rate | 21% | 26 U.S.C. 11(b), federal corporate rate since the Tax Cuts and Jobs Act of 2017. Used only when the base year has no taxable income. State tax excluded. |
| Rosengarten Corporation | statements | Ross, Westerfield & Jordan, ch.4, tables 4.1 and 4.3. Checks: EFN 565 at 25% growth (table 4.4); 115 at 70% capacity, 340 at 90%. |
| Hoffman Company | statements | Ross ch.4, table 4.6. Checks: EFN at each growth rate (table 4.8), internal growth 9.64%, sustainable growth 21.35%, EFN 53.4 at the sustainable rate (example 4.2). |
| Skandia Mining | statements | Ross ch.4, self-test problem 4.1. Checks: EFN 78.6 at 10% growth, internal growth 5.62%, sustainable growth 25.97%. |
| S&S Air | statements | Ross ch.4 minicase. The book labels taxes 21%, but its tax line is 25% of taxable income. The planner uses the dollars as printed. |
| Example Co. | statements | Invented. Built to show slowing receivables and a slipping margin. |

Growth defaults (10%, full capacity, flat interest dollars, long-term debt as the
plug) are starting positions for the controls, not claims about any firm.

NOT FOUND: the edition of Ross the book cases and table numbers were taken from.
Table and problem numbers shift between editions, so record it before citing a
table number outside this repo.

## Company data (`src/planner/sec.js`)

| Item | Source |
|---|---|
| Statements | SEC EDGAR XBRL company facts, `https://data.sec.gov/api/xbrl/companyfacts/`. The company's own 10-K tags, annual filings only. |
| Share count | Cover page of the latest filing (`dei:EntityCommonStockSharesOutstanding`). |
| Share price | Typed in by the user. SEC filings carry no live quotes. |
| EBIT | Derived: pre-tax income plus interest expense. |
| Other current assets, other long-term items, other equity | Derived: the tagged subtotal minus the tagged lines beneath it. |

A line the filer did not tag becomes zero and is named in the notes. Nothing is estimated.

## Valuation defaults (`src/planner/valuation.js`)

| Input | Value | Source |
|---|---|---|
| Discount rate (WACC) | 9% | Starting position, not a claim about any firm. The user changes it. |
| Terminal growth | 2.5% | Starting position, near long-run nominal growth. The user changes it. |
| Buy and Sell band | 15% | A rule of thumb for the call: upside of 15% or more is Buy, downside of 15% or more is Sell. |
| Explicit forecast | 5 years | Starting position. Growth fades in a straight line to the terminal rate. |

Everything else (margin, tax, depreciation, capital spending, working capital) starts from
the latest year of the loaded statements.

## NOT FOUND

- The edition of Ross the book cases and table numbers were taken from.
- A test of the SEC mapping against real filers. It is tested on a made-up company only.
