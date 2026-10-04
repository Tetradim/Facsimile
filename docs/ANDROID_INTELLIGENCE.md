# Android Intelligence Workbench

The `feature/android-intelligence-workbench` branch packages the Facsimile
Intelligence Workbench into a fully standalone Android APK.

No PC or local server is required in **Standalone** mode.

## On-device capabilities

- Nasdaq zero-key U.S. universe screening
- Yahoo weekly OHLCV and news
- SEC EDGAR recent filings
- ClinicalTrials.gov structured trial evidence
- openFDA Drugs@FDA structured application/submission evidence
- deterministic weekly breakout gates
- SPY-relative strength
- Technical Health
- Setup Quality
- Breakout Trigger
- Catalyst
- Dilution Safety
- Liquidity
- Trade Risk
- A+ / A / B / W1 / W2 / X tier ranking
- explainable **Why?** evidence
- TradingView-style Breakout / Catalyst / Fundamental / Risk column packs
- saved scanner screens
- reusable ALL / ANY / NONE strategy definitions
- rule-assistant parsing for visible price/sector/RVOL/stop-risk constraints

## Ranking

Candidate state/tier is sorted before the soft score:

```text
A+ -> A -> B -> W1 -> W2 -> X
```

Within a tier:

```text
Intelligence Overall
-> Catalyst
-> Liquidity
-> lower structural stop risk
```

A rejected candidate therefore cannot outrank a confirmed candidate simply
because it has a strong soft score.

## Fundamental ratings

The PC build can currently obtain richer fundamental inputs through its
provider stack. The standalone APK deliberately holds unsupported fundamental
subratings neutral rather than inventing values.

The Android Fundamental View makes this limitation visible. Zero-key SEC XBRL
fundamental extraction can be added independently without changing the strategy
or ranking contract.

## Optional Remote mode

Settings still includes **Remote API** for parity/debugging against the Python
backend, but it is not required for normal Android use.

## Data caveats

The standalone app depends on public web/API endpoints with differing latency
and availability. Yahoo web endpoints are unofficial and may change. Nasdaq,
SEC, ClinicalTrials.gov and openFDA can also throttle clients. Provider
provenance and warnings remain visible in the UI.
