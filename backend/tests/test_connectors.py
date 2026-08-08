

# --------------------------------------------------------------------------
# regressions
# --------------------------------------------------------------------------

def test_absent_history_is_not_treated_as_fraud():
    """A buyer at an external store is not on our network, so the platform view
    is empty. Reading that as zero orders against a lifetime spend of zero once
    produced a claim-to-lifetime ratio of 3450 and a fraud score of 0.92 for a
    nine-order customer. Missing data must never score as damning data."""
    from app.llm import offline

    unknown = {"claims_last_60d": 0, "claims_all_time": 0,
               "stores_claimed_against": 0, "account_age_days": None,
               "orders_total": 0, "claim_to_lifetime_ratio": None,
               "linked_accounts_same_address": 0, "store_disputes": 0,
               "has_purchase_history": False, "challenge_failed": False,
               "injection_detected": False, "forensics_flags": []}
    result = offline.respond("fraud", {"signals": unknown})
    assert result["score"] < 0.4, result


def test_policy_as_of_survives_url_encoding():
    """An ISO timestamp ends in +00:00, and a raw + in a query string decodes to
    a space. Unencoded, the merchant cannot parse the date and the dispute gets
    judged under a policy version that did not exist on the purchase date."""
    from urllib.parse import parse_qs, urlparse
    from datetime import datetime, timezone

    from app.tools.connectors.http import HttpConnector

    captured = {}

    class Probe(HttpConnector):
        def _call(self, method, path, payload=None):
            captured["path"] = path
            return {"version": "v1", "clauses": []}

    Probe("st_x", "http://example.test", "s").get_policy_pack(
        datetime(2025, 6, 1, tzinfo=timezone.utc))
    as_of = parse_qs(urlparse(captured["path"]).query)["as_of"][0]
    assert as_of.startswith("2025-06-01"), as_of
    assert "+00:00" in as_of, "the offset was mangled in transit"
