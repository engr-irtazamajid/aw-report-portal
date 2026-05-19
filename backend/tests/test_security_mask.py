from app.core.security import mask_ssn_last4


def test_mask_returns_empty_for_falsy_input():
    assert mask_ssn_last4("") == ""
    assert mask_ssn_last4(None) == ""


def test_mask_shows_all_four_stored_digits_with_prefix():
    assert mask_ssn_last4("1234") == "*****1234"
    assert mask_ssn_last4("5678") == "*****5678"


def test_mask_keeps_only_last_four_when_input_longer_than_expected():
    # Defensive: even if a longer value sneaks in, never leak >4 digits.
    assert mask_ssn_last4("123456789") == "*****6789"


def test_mask_strips_whitespace():
    assert mask_ssn_last4(" 1234 ") == "*****1234"


def test_two_different_ssns_render_distinguishable_masks():
    assert mask_ssn_last4("1234") != mask_ssn_last4("5678")
