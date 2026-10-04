# Facsimile Android APK

Facsimile has two Android modes. The default on the
`feature/android-standalone` branch is fully standalone: no Windows machine,
LAN server, or Python process is required.

## Standalone architecture

The APK contains:

- the React/Capacitor workstation
- the weekly breakout scanner engine ported to TypeScript
- moving-average, MACD, NATR, volume and candle calculations
- consolidation-box detection
- structural stop/risk calculations
- breakout, momentum, risk, entry and overall scoring
- catalyst/news scoring
- native HTTPS market-data access

The phone communicates directly with internet data sources using Capacitor's
native HTTP layer.

### Zero-key sources

The standalone build currently uses:

- Nasdaq's public stock screener web endpoint for the U.S. equity universe,
  price, sector, industry and market-cap metadata
- Yahoo Finance chart endpoints for weekly OHLCV
- Yahoo Finance search/news endpoints for recent company news

Yahoo is an unofficial source and can change or throttle access. Facsimile
reports provider provenance and retrieval warnings instead of treating it as a
guaranteed exchange feed.

## First run

1. Install the standalone APK.
2. Open **Settings**.
3. Confirm **Standalone** is selected.
4. Open **Value Scanner**.
5. Enter a price range and sector.
6. Tap **Run Live Scan**.

No server URL is required.

For the original test:

```text
Minimum price:       0.10
Maximum price:       2.50
Sector:              Medical
News lookback:       14 days
Require recent news: On
```

## Optional remote mode

The Python FastAPI service still exists for desktop use and parity testing.
Android **Settings → Remote API** can point at a hosted Facsimile server if
desired, but this is optional.

The old `10.0.2.2:8765` address is only for an Android emulator talking to a
server running on its host computer. It is not used by standalone mode.

## Build

GitHub Actions builds the APK on both Android branches. The standalone workflow:

1. installs Node 22 and Java 21
2. installs Android SDK 36
3. builds the React application
4. generates the Capacitor Android project
5. runs Gradle `assembleDebug`
6. uploads `facsimile-android-debug.apk` plus a SHA-256 checksum

## Release signing

The current APK is debug-signed for direct testing. A Play Store release should
use a private release keystore stored in GitHub Actions secrets and produce a
signed AAB/APK.
