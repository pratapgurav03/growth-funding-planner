# Growth Funding Planner

A dependency-free planner built on Ross, Westerfield & Jordan chapters 3 and 4. Load any US
public company from SEC EDGAR, or type your own statements. It forecasts sales, builds a pro
forma, shows how much outside money growth needs, computes ratios, and runs a DCF valuation.

Built as coursework practice and a work sample. Every number carries its source.

## Run it

```bash
npm test                                                   # 70 tests
./start.command                                            # macOS double-click: starts the server and opens the page
node server.js                                             # same, by hand; then open http://127.0.0.1:8787/web/
npm run standalone                                         # web/standalone.html, opens by double-click
```

The standalone page works for typed-in or example statements but cannot reach SEC. Live
company data needs the server, because the browser cannot call SEC directly and SEC requires
every client to identify itself. Put `Your Name you@example.com` in a one-line file named `.sec-user-agent`
(git-ignored) or set `SEC_USER_AGENT`. Banks and insurers are refused with a message, foreign filers (20-F) do not
load, and companies with several share classes load with shares left blank.

## Views

Overview (health scorecard and charts), Statements, Forecast, Valuation (with a 3D surface of
value across discount rate and terminal growth) and Ratios.

## Real company data

The server (`server.js`) is a small proxy to SEC EDGAR's XBRL data. It caches results for 15
minutes and stays well under SEC's 10 requests a second. Limits: US GAAP annual filings only.
Foreign filers, banks and insurers often tag statements differently and may not load. A line the
filer did not tag is set to zero and named in the notes. Check any company you rely on against its
filing. The mapping is tested on a made-up company and has not been run against every filer.

## Valuation

Free cash flow to the firm, WACC discounting, a Gordon growth terminal value, an equity bridge,
a WACC by terminal growth grid and a Buy, Hold or Sell call at 15% upside or downside. It is a
scenario, not a prediction, and the terminal value usually drives most of the answer.

## Layout

```
src/planner/engine.js      percentage-of-sales pro forma, ratios, growth rates
src/planner/parse.js       statement import
src/planner/examples.js    Ross book cases
src/planner/sec.js         SEC XBRL to statements
src/planner/valuation.js   DCF, sensitivity grid, surface grid
server.js                  local SEC proxy and static server
web/index.html             the page, imports src/ directly
web/vendor/gsap.min.js     GSAP, vendored for the animations
test/                      textbook values and internal consistency
docs/sources.md            where every built-in figure came from
```

Its sibling is [project-finance-lab](../project-finance-lab): a project finance engine and a
CO2-to-methanol model. The two share no code.

Illustrative coursework. Not investment advice.

## Before a live demo

- `npm run coverage` tests the SEC mapping on about 800 real filers (500 largest, 300 random) and writes `data/coverage.json` with the clean, flagged and refused counts. Quote those numbers, not a guess.
- `npm run snapshot` saves about 100 popular filers to `data/snapshot.json`. If SEC cannot be reached, the server answers from that copy and labels it with its date. Rerun it before each demo.
