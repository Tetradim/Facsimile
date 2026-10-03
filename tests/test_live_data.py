from datetime import datetime, timezone

from facsimile.live_data import LiveNewsItem, _catalyst_score, medical_breakout_config
from facsimile.models import VolumeMode


def test_medical_breakout_preset_is_stricter_on_confirmation() -> None:
    config = medical_breakout_config()

    assert config.min_box_bars == 6
    assert config.max_box_width_pct == 0.18
    assert config.min_close_above_box_pct == 0.02
    assert config.min_close_location == 0.80
    assert config.max_upper_wick_ratio == 0.35
    assert config.max_stop_risk_pct == 0.15
    assert config.volume_mode == VolumeMode.HARD_GATE
    assert config.min_volume_ratio == 1.50


def test_catalyst_score_rewards_fda_and_clinical_terms() -> None:
    plain = LiveNewsItem(
        symbol="TEST",
        title="Company schedules investor presentation",
        published_at=datetime.now(timezone.utc),
        source="test",
    )
    catalyst = LiveNewsItem(
        symbol="TEST",
        title="FDA accepts Phase 3 clinical trial filing",
        published_at=datetime.now(timezone.utc),
        source="test",
    )

    assert _catalyst_score([catalyst]) > _catalyst_score([plain])
    assert _catalyst_score([catalyst]) >= 70
