"""Deterministic offline provider.

This is not a simulated language model. It is a rule-based implementation of
each agent's decision function, used in two situations:

  * tests, where a deterministic outcome is the point
  * a live provider outage mid-demo, where degrading to rules beats failing

Every node passes the same structured context it would give a real model, so
swapping between this and a frontier model changes answer quality, never the
shape of the pipeline. Responses here are marked so the audit log always shows
which path produced a decision.
"""
from __future__ import annotations

import re

# --------------------------------------------------------------------------
# intent classification
# --------------------------------------------------------------------------

CLAIM_PATTERNS = [
    ("not_delivered", r"not (yet )?(deliver|arriv|receiv)|never (came|arrived|received)"
                      r"|missing|stuck|no update|didn'?t (get|receive|arrive)"),
    ("damage", r"damag|broke|broken|crack|tear|torn|rip|stain|dent|scratch|spill|leak"),
    ("wrong_size", r"wrong size|too (small|big|tight|loose)|size (issue|problem)|doesn'?t fit"),
    ("wrong_item", r"wrong (item|product|colou?r|variant)|different (item|product)"
                   r"|not what i ordered"),
    ("functional_defect", r"not work|doesn'?t work|stopped working|won'?t (turn on|charge|"
                          r"start)|freez|hang|defect|faulty|battery (drain|dies)|no sound"),
    ("change_of_mind", r"changed my mind|don'?t want|no longer need|order(ed)? by mistake"),
]

INJECTION_PATTERNS = [
    r"ignore (all |your |previous )?(instructions|rules|policy)",
    r"you are now|new instructions|system prompt|developer mode",
    r"approve (my|this) (refund|claim) (immediately|now|without)",
    r"disregard (the )?(policy|rules|evidence)",
    r"pretend (you|to be)|act as (if|though)",
    r"\bsudo\b|override (the )?(guardrail|limit|cap)",
]

MALAYALAM = re.compile(r"[ഀ-ൿ]")
DEVANAGARI = re.compile(r"[ऀ-ॿ]")


def detect_injection(text: str) -> list[str]:
    low = (text or "").lower()
    return [p for p in INJECTION_PATTERNS if re.search(p, low)]


def detect_language(text: str) -> str:
    if MALAYALAM.search(text or ""):
        return "ml"
    if DEVANAGARI.search(text or ""):
        return "hi"
    return "en"


def classify_claim(text: str) -> str:
    low = (text or "").lower()
    for claim, pattern in CLAIM_PATTERNS:
        if re.search(pattern, low):
            return claim
    return "other"


# --------------------------------------------------------------------------
# per-agent decision functions
# --------------------------------------------------------------------------

def _interaction(ctx: dict) -> dict:
    text = ctx.get("message", "")
    order = ctx.get("order", {})
    claim = classify_claim(text)
    injections = detect_injection(text)
    language = detect_language(text)
    item = (order.get("items") or [{}])[0]
    title = item.get("title", "your order")

    if claim == "not_delivered":
        reply = (f"I can see your {title} has not been delivered yet. "
                 f"Let me check the shipment and sort this out for you.")
        needs_evidence = False
    elif claim == "functional_defect":
        reply = (f"Sorry your {title} is not working properly. Let me try a couple "
                 f"of quick checks first, and I'll ask for a short recording of the "
                 f"problem so I can confirm it.")
        needs_evidence = True
    elif claim == "other":
        reply = ("I want to make sure I understand. Could you tell me what went "
                 "wrong with the order: is it damaged, the wrong item, or did it "
                 "not arrive?")
        needs_evidence = False
    else:
        reply = (f"Sorry about that. I can see your {title}. To confirm the issue "
                 f"I'll open your camera for a few seconds.")
        needs_evidence = True

    return {
        "claim_type": claim,
        "language": language,
        "reply": reply,
        "needs_evidence": needs_evidence,
        "injection_detected": bool(injections),
        "injection_patterns": injections,
        "_provider": "offline",
    }


def _evidence(ctx: dict) -> dict:
    """Decides on the forensic signals computed in code by evidence/forensics.py
    plus whether the live challenge was actually satisfied."""
    forensics = ctx.get("forensics", {})
    tier = ctx.get("tier", "upload")
    challenge_ok = ctx.get("challenge_satisfied")
    expected = [t.lower() for t in ctx.get("expected_tokens", [])]
    observed = [t.lower() for t in ctx.get("observed_tokens", [])]
    claim_type = ctx.get("claim_type", "damage")

    flags = list(forensics.get("flags", []))

    # Undetermined is not the same as mismatched. Without a vision model reading
    # the label there is nothing to compare, so this stays None and the tier
    # carries the confidence instead of a false negative dragging it down.
    serial_match = None
    if expected and observed:
        serial_match = any(e in o or o in e for e in expected for o in observed)

    confidence = 0.5
    if tier == "attested_live":
        confidence = 0.93 if challenge_ok else 0.28
        if serial_match is True:
            confidence = min(0.97, confidence + 0.04)
        elif serial_match is False:
            confidence = min(confidence, 0.35)
    elif tier == "camera_unattested":
        confidence = 0.68
    else:  # arbitrary upload
        confidence = 0.55

    if "generator_metadata" in flags or "c2pa_ai_declared" in flags:
        confidence = 0.06
    elif "no_camera_exif" in flags:
        confidence = max(0.2, confidence - 0.3)
    if forensics.get("reused_across_stores"):
        confidence = min(confidence, 0.05)

    verified = confidence >= 0.7
    damage_map = {
        "damage": "visible physical damage consistent with the description",
        "wrong_item": "delivered item does not match the ordered variant",
        "wrong_size": "size label differs from the ordered size",
        "functional_defect": "fault reproduced in the recording",
    }
    return {
        "verified": verified,
        "confidence": round(confidence, 2),
        "tier": tier,
        "damage_type": damage_map.get(claim_type, "not applicable") if verified else None,
        "serial_match": serial_match,
        "challenge_satisfied": challenge_ok,
        "forensics_flags": flags,
        "notes": ("Evidence captured live against a server-issued challenge."
                  if tier == "attested_live" else
                  "Uploaded file: provenance could not be established."),
        "_provider": "offline",
    }


def _policy(ctx: dict) -> dict:
    """Picks the governing clause from the retrieved candidates. The chosen id
    is then verified against the real pack in code, so an invented id fails."""
    candidates = ctx.get("candidates", [])
    claim_type = ctx.get("claim_type", "")
    days_since = ctx.get("days_since_delivery")
    order_flags = ctx.get("order_flags", [])

    covering = [c for c in candidates if claim_type in c.get("claim_types", [])]
    if not covering:
        return {"eligible": False, "clause_id": "", "reason":
                "No clause in this store's policy covers this claim type.",
                "_provider": "offline"}

    # prefer a clause whose window still contains the claim
    in_window = [c for c in covering
                 if days_since is None or days_since <= (c.get("window_days") or 0)]
    clause = (in_window or covering)[0]

    excluded = [e for e in clause.get("exclusions", []) if e in order_flags]
    within = days_since is None or days_since <= (clause.get("window_days") or 0)
    eligible = within and not excluded

    if not within:
        reason = (f"Reported {days_since} days after delivery, outside the "
                  f"{clause.get('window_days')} day window in clause {clause['id']}.")
    elif excluded:
        reason = f"Clause {clause['id']} excludes: {', '.join(excluded)}."
    else:
        reason = (f"Clause {clause['id']} ({clause['title']}) applies: reported "
                  f"within the {clause.get('window_days')} day window.")

    return {
        "eligible": eligible,
        "clause_id": clause["id"],
        "clause_title": clause.get("title", ""),
        "prescribed_outcome": clause.get("outcome"),
        "exclusions_hit": excluded,
        "reason": reason,
        "_provider": "offline",
    }


def _fraud(ctx: dict) -> dict:
    """Weighs signals that were computed deterministically in code."""
    s = ctx.get("signals", {})
    score, reasons = 0.0, []

    claims_60d = s.get("claims_last_60d", 0)
    if claims_60d >= 3:
        score += 0.35
        reasons.append(f"{claims_60d} claims filed in the last 60 days")
    elif claims_60d == 2:
        score += 0.18
        reasons.append("2 claims in the last 60 days")

    if s.get("stores_claimed_against", 0) >= 3:
        score += 0.2
        reasons.append(f"claims across {s['stores_claimed_against']} different stores")

    age = s.get("account_age_days")
    if age is None:
        reasons.append("no purchase history on record, which is not held against them")
    elif age < 30:
        score += 0.2
        reasons.append(f"account is only {age} days old")
    elif age > 365 and claims_60d == 0:
        score -= 0.1
        reasons.append("long-standing account with no prior claims")

    ratio = s.get("claim_to_lifetime_ratio")
    if ratio is not None and ratio > 0.6:
        score += 0.15
        reasons.append("claim value is high relative to lifetime spend")

    if s.get("linked_accounts_same_address", 0) > 0:
        score += 0.1
        reasons.append(f"{s['linked_accounts_same_address']} other accounts share this address")

    flags = s.get("evidence_flags", [])
    if "generator_metadata" in flags or "c2pa_ai_declared" in flags:
        score += 0.4
        reasons.append("evidence file carries AI-generator metadata")
    if "no_camera_exif" in flags:
        score += 0.1
        reasons.append("evidence has no camera metadata")
    if s.get("reused_across_stores"):
        score += 0.35
        reasons.append("identical evidence image was submitted at another store")
    if s.get("challenge_failed"):
        score += 0.3
        reasons.append("failed the live capture challenge")
    if s.get("injection_detected"):
        score += 0.25
        reasons.append("attempted to instruct the assistant to approve the claim")

    score = max(0.0, min(1.0, score))
    if not reasons:
        reasons.append("no adverse signals")
    return {"score": round(score, 2), "signals": reasons,
            "recommendation": "review" if score >= 0.6 else "proceed",
            "_provider": "offline"}


def _resolution(ctx: dict) -> dict:
    ev = ctx.get("evidence", {})
    pol = ctx.get("policy", {})
    fraud = ctx.get("fraud", {})
    value = float(ctx.get("claim_value", 0) or 0)
    claim_type = ctx.get("claim_type", "")
    precedents = ctx.get("precedents", [])

    conf_e = float(ev.get("confidence", 0) or 0)
    score = float(fraud.get("score", 0) or 0)
    eligible = bool(pol.get("eligible"))
    prescribed = pol.get("prescribed_outcome") or "full_refund"

    alternatives = []
    if score >= 0.6:
        outcome, amount = "escalate", 0.0
        rationale = (f"Fraud risk is {score:.2f}. {', '.join(fraud.get('signals', [])[:2])}. "
                     f"Routing to a human with the evidence rather than deciding.")
        alternatives = ["reject", "full_refund"]
        confidence = 0.9
    elif not eligible:
        outcome, amount = "reject", 0.0
        rationale = pol.get("reason", "The claim falls outside this store's policy.")
        alternatives = ["partial_refund as goodwill"]
        confidence = 0.8
    elif claim_type == "not_delivered":
        outcome, amount = "full_refund", value
        rationale = (f"Shipment never reached the buyer and the policy covers it. "
                     f"{pol.get('reason', '')}")
        confidence = 0.9
    elif not ev.get("verified"):
        outcome, amount = "escalate", 0.0
        rationale = (f"Evidence confidence is only {conf_e:.2f}: "
                     f"{ev.get('notes', '')} Sending to a human rather than guessing.")
        alternatives = ["request better evidence"]
        confidence = 0.72
    elif prescribed == "replacement":
        outcome, amount = "replacement", 0.0
        rationale = (f"{pol.get('reason', '')} Evidence verified at {conf_e:.2f}. "
                     f"A replacement is what the policy prescribes.")
        alternatives = ["full_refund if the variant is out of stock"]
        confidence = 0.88
    elif prescribed == "partial_refund":
        outcome, amount = "partial_refund", round(value * 0.85, 2)
        rationale = (f"{pol.get('reason', '')} Shipping charges are not refundable "
                     f"under this clause.")
        confidence = 0.85
    elif prescribed == "escalate":
        outcome, amount = "escalate", 0.0
        rationale = pol.get("reason", "This clause requires a service appointment.")
        confidence = 0.8
    else:
        outcome, amount = "full_refund", value
        rationale = (f"{pol.get('reason', '')} Evidence verified at {conf_e:.2f} "
                     f"and fraud risk is low at {score:.2f}.")
        alternatives = ["replacement if the buyer prefers it"]
        confidence = 0.92

    if precedents:
        rationale += f" Consistent with {len(precedents)} similar past case(s)."

    return {"outcome": outcome, "amount": amount, "rationale": rationale.strip(),
            "confidence": confidence, "alternatives_considered": alternatives,
            "_provider": "offline"}


def _escalation(ctx: dict) -> dict:
    d = ctx.get("decision", {})
    ev = ctx.get("evidence", {})
    pol = ctx.get("policy", {})
    fraud = ctx.get("fraud", {})
    return {
        "headline": f"{d.get('outcome', 'review').replace('_', ' ').title()} "
                    f"recommended on a Rs {ctx.get('claim_value', 0):,.0f} claim",
        "why_you_are_seeing_this": ctx.get("gate_reason", "Above your automatic limit."),
        "summary": [
            f"Evidence: {'verified' if ev.get('verified') else 'not verified'} "
            f"({ev.get('confidence', 0):.2f}, {ev.get('tier', 'n/a')})",
            f"Policy: {pol.get('clause_id') or 'no clause'} - {pol.get('reason', '')}",
            f"Fraud risk: {fraud.get('score', 0):.2f} - "
            f"{'; '.join(fraud.get('signals', [])[:2])}",
        ],
        "recommendation": d.get("outcome"),
        "_provider": "offline",
    }


def _learning(ctx: dict) -> dict:
    d = ctx.get("decision", {})
    return {"summary": f"{ctx.get('claim_type', 'claim')} on "
                       f"Rs {ctx.get('claim_value', 0):,.0f} resolved as "
                       f"{d.get('outcome')}",
            "_provider": "offline"}


HANDLERS = {
    "interaction": _interaction,
    "evidence": _evidence,
    "policy": _policy,
    "fraud": _fraud,
    "resolution": _resolution,
    "escalation": _escalation,
    "learning": _learning,
}


def respond(agent: str, context: dict) -> dict:
    handler = HANDLERS.get(agent)
    if handler is None:
        return {"_provider": "offline", "note": f"no offline handler for {agent}"}
    return handler(context)
