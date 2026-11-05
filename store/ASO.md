# ASO and search notes, 5 November 2026

Market: India (App Store `in`, Google `India`). Sources: DataForSEO Google keyword data (volume,
difficulty), DataForSEO live Google results, and Apple's iTunes Search API for the App Store.
Google volumes are web searches. They point to demand. They are not App Store search counts.

## Where the app ranked before this release (top 50, India)

Our app ranked below 50 for nearly every term. The only hit was `prepayment calculator` at 14.

| Term | Top app (ratings) | Reading |
| --- | --- | --- |
| emi calculator, loan emi calculator, home loan emi calculator | EMI Calculator : Loan Manager (29,983) | One app holds the head terms. Not a near-term target. |
| sip calculator | SIP Calculator - Lumpsum Plan (4,852) | Same. |
| hra calculator | Income Tax Calculator 2026 (4) | Open. |
| retirement calculator | Best Retirement Calculator (0) | Open. |
| sukanya samriddhi | Sukanya Tracker (0) | Open. |
| swp calculator | SIP, SWP, FD & EMI Calculator (3) | Open. |
| step up sip calculator | SIP Calculator - Lumpsum Plan (4,852), then apps with 0 to 1 | Open below the top result. |
| emi reminder, emi tracker, loan tracker, loan manager | Apps with 3 to 17 ratings | Open. The app already has reminders, a widget and tracking. |
| amortization schedule | Amortization Loan Calculator (5) | Open. |
| fd calculator | FD Calculador (1) | Open. |

## What changed in the listing

| Field | Before | After | Why |
| --- | --- | --- | --- |
| Subtitle | Interest, deposits and more | EMI Tracker, Tax, FD, PPF, NPS | The old subtitle held no search words. `tracker`, `tax`, `fd`, `ppf`, `nps` are open terms. |
| Keywords | home loan tax, 80c, 24b, ... | home, reminder, prepayment, swp, lumpsum, retirement, hra, gst, sukanya, rd, step up, no cost, credit card, 80c | Words already in the name or subtitle are not repeated. Apple joins words across fields. |
| Description, first lines | A complete loan, tax and savings calculator | Names EMI calculator, SIP calculator, EMI tracker, 80C, 24(b), no-cost EMI and the savings schemes | Google indexes the App Store page text. The first lines also decide whether a person reads on. |
| Hindi | Same fields | Same changes in Hindi | Hindi searches exist: ईएमआई कैलकुलेटर 3,600 a month, लोन कैलकुलेटर 5,400, सुकन्या समृद्धि योजना कैलकुलेटर 18,100. |

The app name stays `Loan EMI & SIP Calculator`. See the go-live notes on guideline 4.1 and 4.3.

## Google

Page one for `swp calculator`, `nps calculator` and the Sukanya terms is banks, brokers and fund
houses. DataForSEO rates `swp calculator` at difficulty 2. The live results show that rating is
wrong for this term. A new GitHub Pages site will not win those terms, so no pages were built for
them.

`no cost emi calculator` is different. Small independent sites rank on page one (positions 6, 7
and 10, and a Play Store app at 9). It is also the app's strongest unique feature. The site now
has a working no-cost EMI calculator that uses the app's own maths (`docs/assets/card-emi.js` is
built from `src/lib/finance/card-emi.ts`), a landing page with structured data and a Smart App
Banner, and a sitemap.

Rebuild the browser maths after any change to `card-emi.ts` or `emi.ts`:

```bash
npx esbuild@0.25 src/lib/finance/card-emi.ts --bundle --format=iife --global-name=EmiMath \
  --minify --target=es2019 --outfile=docs/assets/card-emi.js
```

## Not done, and why

- A custom domain. GitHub Pages project sites inherit little authority. A domain you own is the
  single largest Google upgrade. It costs money and needs your decision.
- Search Console. Add the site and submit `sitemap.xml`. This needs your Google account.
- More web calculators. Add one only where a small site already ranks on page one. Check the live
  results first, not the difficulty score.
- Ratings. Ask for a rating after a real success, such as the first saved loan. Ratings move rank
  more than any text change.

## Measure

```bash
python3 store/aso-rank.py "emi tracker" "loan tracker" "hra calculator" "retirement calculator" \
  "swp calculator" "sukanya samriddhi" "prepayment calculator" "step up sip calculator"
```

Run it on release day, then after two and four weeks.

## Screenshots (release checklist)

Every release that changes a screen must also refresh the screenshots. Each image carries keyword
captions as written text, because Apple indexes that text.

- Capture on the iPhone 17 Pro Max simulator (1320 x 2868) with a Release build. Deep link with `emicalc:///<route>`.
- English captions: `store/koubou.yaml` and `store/koubou-6_5.yaml`.
- Hindi captions: `store/koubou-hi.yaml` and `store/koubou-6_5-hi.yaml`. They use `/System/Library/Fonts/Kohinoor.ttc`, because the default font has no Devanagari glyphs.
- Upload per locale and size with `asc screenshots upload --locale <loc> --path <dir>/<device folder> --device-type IPHONE_69|IPHONE_65 --replace --confirm`. Cancel a waiting submission first.
