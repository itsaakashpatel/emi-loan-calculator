# EMI Calculator & Loan Manager

An iOS app for working out loan EMIs, tracking repayments, and planning investments — a functional
clone of *EMI Calculator : Loan Manager* built with Expo SDK 57.

Everything runs on-device. The only network call in the app is the exchange-rate lookup for the
currency converter.

## Running it

```bash
pnpm install
pnpm ios          # opens in Expo Go on the iOS Simulator
```

`pnpm` is required, and `.npmrc` pins `node-linker=hoisted` — Metro does not resolve pnpm's
symlinked `node_modules` reliably.

```bash
pnpm test         # 229 tests: finance maths, SQLite layer, chart layout, PDF templates
pnpm typecheck    # tsc --noEmit
pnpm doctor       # expo-doctor
```

## Design

The layout follows the current shipping version of the app being cloned: a sky-blue-to-white
gradient backdrop behind everything, five tabs in a floating pill bar, and each tab root a grid of
white tiles rather than a list. Titles are large and left-aligned with a round frosted action button
in the corner — history always top-right. Detail screens use a transparent header over the same
gradient, a circular back button, label-left/input-right form rows, and a grey Reset / blue
Calculate pill pair.

The gradient is painted once above the navigator and the navigation container is themed transparent,
so the header, tab scene and screen content all sit on one continuous fade.

## Features

**Home — loans**
- Solve for **any** of the four variables — EMI, loan amount, interest rate or tenure — by fixing the
  other three, the way the original app's selector works
- Quick Calculator (amount / rate / period only), Loan Affordability (income + down payment → the
  property price you can afford), Loan Refinance (existing vs new loan, net of switching cost)
- Results-first layout: the figure, spelled out in words, a principal-vs-interest donut, and the cost
  breakdown above the inputs
- Amortisation schedule, year-wise and expandable to months, plus a yearly outflow chart
- Calculation history, saved automatically and reloadable
- Loan eligibility from income and FOIR
- Part payments — one-time or recurring, either reducing the tenure or reducing the EMI
- Advance EMI (instalments collected at disbursement)
- Moratorium / EMI holiday — full (interest capitalises) or interest-only, recovering by extending
  the tenure or raising the EMI
- Floating-rate changes mid-loan
- Side-by-side comparison of up to 3 scenarios, ranked by total outflow including fees
- Saved loans with a payment log, progress rings, next-due and overdue tracking
- EMI reminders — a local notification three days before an instalment is due, on the day, and one
  after if it stays unpaid, at a time of day you choose (default 7:00 PM)

**Banking** — FD, RD, PPF, simple and compound interest, Inflation Impact.

**SIP** — SIP (with annual step-up), SWP, STP, Lumpsum, SIP With Inflation. All eleven investment
calculators are driven from one declarative registry (`src/lib/finance/calculators.ts`) rendered by a
single screen, so adding one is a registry entry rather than a new screen.

**Other** — GST calculator, currency converter.

Data tables show **full amounts** with the currency stated once per table rather than in every cell —
that is what lets four columns of real numbers fit a phone without horizontal scrolling. Charts size
themselves to their measured container, so nothing clips or overflows.

**Tools** — GST (add/remove, CGST/SGST or IGST), currency converter with offline-cached rates.

**Everything else** — PDF export for loan summaries, schedules, comparisons and investment results;
light/dark themes; INR with Indian digit grouping as the single display currency.

## Layout

```
app/                     expo-router routes
  (tabs)/                EMI · My Loans · Invest · Tools
  emi/                   schedule, advanced options
  loan/                  [id] detail, form (create/edit)
  invest/[type].tsx      one screen driving all 8 calculators
  tools/                 gst, currency
src/
  lib/finance/           amortisation engine + every calculator (pure TS, no RN imports)
  lib/format/            money and date formatting
  lib/fx.ts              exchange rates with cache fallback
  db/                    SQLite client, migrations, repositories
  store/                 zustand: settings, calculator, loans
  components/            theme-aware UI kit, charts (react-native-svg), schedule table
  pdf/                   HTML templates + share
__tests__/               finance, deposits, investments, format, tools, db, pdf
```

`src/lib/finance` is the single source of truth for every number the UI and PDFs show, and is pure
TypeScript so it is directly unit-testable.

## How the maths works

Schedules are computed in **integer paise** so they always balance: each row rounds to 2dp and the
final instalment absorbs the residual, making `sum(principal) === principal`. The EMI is rounded
**up** to the paisa the way lenders quote it — rounding to nearest leaves it a fraction short and
forces a spurious extra instalment.

Reference values pinned by the test suite:

| Calculation | Input | Result |
|---|---|---|
| EMI | ₹10,00,000 @ 8.5%, 20 yr | ₹8,678 (₹10,82,774 interest) |
| EMI | ₹5,00,000 @ 10%, 5 yr | ₹10,624 |
| SIP | ₹10,000/mo @ 12%, 10 yr | ₹23,23,391 |
| PPF | ₹1,50,000/yr @ 7.1%, 15 yr | ₹40,68,209 |
| FD | ₹1,00,000 @ 7% quarterly, 5 yr | ₹1,41,478 |

Modelling choices worth knowing:

- **Advance EMI** — `k` instalments collected upfront, so `E = P / (k + a(n−k, r))`. The upfront cash
  is pure principal, which lowers both the EMI and the total interest.
- **PPF** — one deposit at the start of each year, annually compounded (the standard approximation;
  the scheme itself pays on the lowest monthly balance).
- **RD** — each instalment compounds only for the months it stays invested, so the effective return
  sits below the headline rate.
- **SWP** — withdrawals are taken at month end, after that month's growth.

Results are indicative. Taxes, TDS and exit loads are not deducted, and a lender's schedule may
differ slightly through day-count conventions.

## Deliberately out of scope

Ads, in-app purchases and premium gating (the original is freemium; this is entirely free).
