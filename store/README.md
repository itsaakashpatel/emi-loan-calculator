# App Store assets

Everything here is ready to send to App Store Connect. Nothing has been uploaded yet, because
the account is not authenticated on this machine.

## What is in this folder

| Path | Contents |
| --- | --- |
| `metadata/app-info/en-US.json` | App name, subtitle, privacy policy URL |
| `metadata/version/1.0.0/en-US.json` | Description, keywords, promotional text, support URL |
| `koubou.yaml` | The 6.9 inch composition: device frame, background, caption text |
| `koubou-6_5.yaml` | The same composition at 6.5 inch, with the caption sizes scaled |
| `screenshots/raw/` | Plain simulator captures, 1206 x 2622 |
| `screenshots/framed/iPhone_16_Pro_-_Black_Titanium_-_Portrait/` | The 7 store images, 1320 x 2868 |
| `screenshots/framed-6_5/iPhone_16_Pro_-_Black_Titanium_-_Portrait/` | The same 7 images, 1242 x 2688 |
| `screenshots/review/index.html` | Side-by-side review page, raw against framed |
| `screenshots/review/approved.json` | All 7 images marked approved |

There are two sets, one per App Store Connect display slot. Both validate with 0 errors.

| Folder | Size | Display type | Upload slot |
| --- | --- | --- | --- |
| `screenshots/framed/` | 1320 x 2868 | `APP_IPHONE_69` | 6.9 inch |
| `screenshots/framed-6_5/` | 1242 x 2688 | `APP_IPHONE_65` | 6.5 inch |

App Store Connect rejects a 1320 x 2868 image in the 6.5 inch slot. Use the `framed-6_5` folder
there. Koubou renders each set at its native size, so no image is stretched.

## Field values that are not in these files

App Store Connect holds these outside the metadata files. Set them in the web UI, or with the
matching `asc` command after you authenticate.

| Field | Value |
| --- | --- |
| Primary category | Finance |
| Secondary category | Utilities |
| Age rating | 4+ |
| Price | Free, no in-app purchases |
| App Privacy | Data Not Collected |
| Copyright | 2026 Aakash Patel |

## Before you submit

1. Turn on GitHub Pages for this repository, source `master` branch, `/docs` folder.
   That publishes the two URLs the listing points at:
   - Support: https://itsaakashpatel.github.io/emi-loan-calculator/
   - Privacy: https://itsaakashpatel.github.io/emi-loan-calculator/privacy-policy.html
2. Create the App Store Connect record for `com.aakashpatel.emicalculator`.
3. Replace the two placeholders in `eas.json` with the numeric app ID and your team ID. Done:
   app ID `6801948279`, team ID `7L9982T9B6`.

## Push the metadata and screenshots

Authenticate once:

```bash
asc auth login --name "EMI" --key-id "KEY_ID" --issuer-id "ISSUER_ID" \
  --private-key /path/to/AuthKey.p8 --network
asc auth status --validate
```

Then, with `APP_ID` set to the numeric App Store Connect app ID:

```bash
# 1. Check the metadata files one more time
asc metadata validate --dir ./store/metadata

# 2. Plan, approve, then apply the listing text
asc metadata plan    --app "$APP_ID" --version 1.0.0 --dir ./store/metadata
asc metadata approve --review-dir .asc/metadata/review --all
asc metadata apply   --app "$APP_ID" --version 1.0.0 --dir ./store/metadata \
  --review-dir .asc/metadata/review --confirm

# 3. Plan, then apply, the screenshots
asc screenshots plan  --app "$APP_ID" --version 1.0.0 --review-output-dir ./store/screenshots/review
asc screenshots apply --app "$APP_ID" --version 1.0.0 --review-output-dir ./store/screenshots/review --confirm

# 4. Confirm the version is ready for review
asc validate --app "$APP_ID" --version 1.0.0
asc review doctor --app "$APP_ID"
```

## Rebuild the screenshots

The captures come from Expo Go on a booted simulator. Turn off the Expo tools bubble first
(dev menu, "Tools button"), and set a clean status bar:

```bash
xcrun simctl status_bar "$UDID" override --time "9:41" --batteryState charged \
  --batteryLevel 100 --cellularBars 4 --wifiBars 3 --dataNetwork wifi
```

Capture with `axe screenshot`, then recompose:

```bash
export PATH="$PWD/.venv-koubou/bin:$PATH"     # Koubou 0.18.1, pinned by asc
kou generate store/koubou.yaml
kou generate store/koubou-6_5.yaml
asc screenshots review-generate --framed-dir store/screenshots/framed \
  --raw-dir store/screenshots/raw --output-dir store/screenshots/review
asc screenshots review-approve --all-ready --output-dir store/screenshots/review
```

Edit the caption text in `koubou.yaml`, not in the images.
