# Working notes for Claude

## What this is
A growth funding planner (Ross, Westerfield & Jordan ch.3-4) with SEC EDGAR company data and a
DCF valuation. Built by Pratap Gurav (NYU Tandon, MS Management of Technology '27) alongside a
corporate finance course. Two audiences: coursework practice, and a work sample for
conversations with climate-tech companies. It was split out of project-finance-lab; the
methanol model lives there now and shares no code with this repo.

## Rules for this repo

**Every number carries its source.** Built-in figures live in `docs/sources.md`. A figure
that is derived rather than published says DERIVED and shows the arithmetic.

**Say NOT FOUND rather than estimating.** `src/planner/sec.js` never estimates. A missing tag
becomes zero and is named in `notFound`. A plausible invented number is a liability, because
this gets shown to people who know the real figures.

**Test against textbook values.** The Rosengarten, Hoffman, Skandia and S&S Air cases check
the engine against the book. Prefer that over testing a function against its own output.

**No dependencies, one exception.** Node's built-in test runner, no npm install, no build
step. The page animates with GSAP, vendored as `web/vendor/gsap.min.js` so nothing is fetched at
run time. The 3D valuation surface is raw WebGL, no library. The maths in `src/` stays
dependency-free and the page imports the same modules, so there is one implementation.

**SEC data.** The server must send a real `SEC_USER_AGENT` and stay under SEC's rate limit.

**Valuation is a scenario, not a target.** It always ships with a sensitivity grid. Say what
drives the answer (terminal value share) and never present one price as a prediction.

**Motion.** One clock (the GSAP ticker), nothing that moves without a reason, reduced motion
respected. Chart colours are the validated blue, orange and aqua. Lime is an interface accent only.

## Style
No em dashes. Short sentences. Comments explain why, not what.

## Open items
- The Ross edition behind the book cases is not recorded. Add it to `docs/sources.md` and
  `src/planner/examples.js`.
- Run the SEC mapping against real filers (AAPL, WMT, a small company) and compare to filings.
  January year-end retailers are the likeliest gaps.
- A live share price feed would replace the typed-in price.
