from facsimile.live_data import LiveScanRequest, NasdaqScreenerProvider


def test_nasdaq_screener_filters_medical_price_range_and_ranks_volume():
    rows = [
        {
            "symbol": "AAA",
            "name": "Alpha Medical",
            "lastsale": "$1.25",
            "sector": "Health Care",
            "industry": "Biotechnology",
            "marketCap": "25000000",
            "volume": "125000",
        },
        {
            "symbol": "BBB",
            "name": "Beta Therapeutics",
            "lastsale": "$2.10",
            "sector": "Health Care",
            "industry": "Pharmaceuticals",
            "marketCap": "40000000",
            "volume": "900000",
        },
        {
            "symbol": "CCC",
            "name": "Consumer Co",
            "lastsale": "$1.20",
            "sector": "Consumer Discretionary",
            "industry": "Specialty Retail",
            "marketCap": "100000000",
            "volume": "5000000",
        },
        {
            "symbol": "DDD",
            "name": "Too Expensive Bio",
            "lastsale": "$3.40",
            "sector": "Health Care",
            "industry": "Biotechnology",
            "marketCap": "50000000",
            "volume": "7000000",
        },
    ]

    request = LiveScanRequest(
        min_price=0.10,
        max_price=2.50,
        sector="Medical",
        max_candidates=10,
    )

    profiles = NasdaqScreenerProvider.profiles_from_rows(rows, request)

    assert [profile.symbol for profile in profiles] == ["BBB", "AAA"]
    assert all(profile.source == "nasdaq_screener" for profile in profiles)


def test_nasdaq_screener_all_sectors_uses_price_only():
    rows = [
        {
            "symbol": "AAA",
            "name": "Alpha",
            "lastsale": "$0.50",
            "sector": "Technology",
            "industry": "Software",
            "volume": "100",
        },
        {
            "symbol": "BBB",
            "name": "Beta",
            "lastsale": "$2.49",
            "sector": "Industrials",
            "industry": "Aerospace",
            "volume": "200",
        },
        {
            "symbol": "CCC",
            "name": "Gamma",
            "lastsale": "$2.51",
            "sector": "Health Care",
            "industry": "Biotechnology",
            "volume": "300",
        },
    ]

    request = LiveScanRequest(
        min_price=0.10,
        max_price=2.50,
        sector="All sectors",
        max_candidates=10,
    )

    profiles = NasdaqScreenerProvider.profiles_from_rows(rows, request)

    assert [profile.symbol for profile in profiles] == ["BBB", "AAA"]


def test_provider_status_exposes_nasdaq_screener():
    from facsimile.live_data import LiveDataService

    statuses = LiveDataService().provider_status()
    status = next(item for item in statuses if item.name == "Nasdaq Screener")

    assert status.configured is True
    assert status.zero_key is True
    assert "current screener price" in status.capabilities
