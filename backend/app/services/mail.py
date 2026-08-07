"""Transactional email.

One provider, one template, and a hard rule: a sign-in code is the most
security-sensitive message this product sends, so the email says what the code
is for, how long it lasts, and what to do if it was not requested — in that
order, above the fold, in plain words.

The design is deliberately quiet. A login email that looks like marketing is a
login email people learn to distrust, so there is no logo lockup, no hero image
and no call-to-action button competing with the code itself.
"""
from __future__ import annotations

import logging
import os
import re

import httpx

log = logging.getLogger("rezo.mail")

RESEND_ENDPOINT = "https://api.resend.com/emails"
TIMEOUT = httpx.Timeout(15.0, connect=5.0)


class MailError(Exception):
    pass


def is_live() -> bool:
    return os.getenv("REZO_MAIL", "local") == "live" and bool(os.getenv("RESEND_API_KEY"))


def _sender() -> str:
    return os.getenv("REZO_MAIL_FROM", "Rezo <hello@rezo.zevora.io>")


def send(to: str, subject: str, html: str, text: str,
         tag: str | None = None) -> dict:
    """Send one message. Raises MailError so callers can decide what to do."""
    if not is_live():
        log.info("mail suppressed (REZO_MAIL is not live): %s -> %s", subject, to)
        return {"delivered": False, "reason": "mail_not_configured"}

    payload: dict = {
        "from": _sender(),
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
        # A login code must never be threaded into a marketing conversation or
        # replied to by a bot.
        "headers": {"X-Entity-Ref-ID": tag or "rezo"},
    }
    reply_to = os.getenv("REZO_MAIL_REPLY_TO")
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.post(
                RESEND_ENDPOINT,
                headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}",
                         "Content-Type": "application/json"},
                json=payload)
    except httpx.HTTPError as exc:
        raise MailError(f"Could not reach the mail provider: {exc}") from exc

    if res.status_code >= 400:
        raise MailError(f"Mail provider rejected the message ({res.status_code}): "
                        f"{res.text[:200]}")

    return {"delivered": True, "id": res.json().get("id", "")}


# --------------------------------------------------------------------------
# the sign-in code
# --------------------------------------------------------------------------

BASE_STYLE = (
    "margin:0;padding:0;background:#fdfcfc;"
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;"
    "color:#000000;"
)


def login_code_email(code: str, minutes: int, is_new: bool) -> tuple[str, str, str]:
    """Returns (subject, html, text).

    The subject leads with the code so it is readable from a notification
    without opening anything — the single biggest reduction in friction
    available on this screen.
    """
    subject = f"{code} is your Rezo code"
    action = "finish setting up your workspace" if is_new else "sign in"

    html = f"""<!doctype html>
<html><body style="{BASE_STYLE}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
         style="background:#fdfcfc;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:440px;background:#ffffff;border:1px solid rgba(0,0,0,.07);
                    border-radius:16px;overflow:hidden;">

        <tr><td style="padding:28px 32px 0;">
          <div style="font-size:15px;font-weight:700;letter-spacing:-.02em;">Rezo</div>
        </td></tr>

        <tr><td style="padding:20px 32px 0;">
          <div style="font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.3;">
            Your code to {action}
          </div>
          <div style="font-size:15px;line-height:1.6;color:#44403b;margin-top:8px;">
            Enter this in the tab you already have open. It expires in {minutes} minutes
            and can only be used once.
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 0;">
          <div style="background:#f5f3f1;border-radius:12px;padding:20px;text-align:center;">
            <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:34px;
                        font-weight:600;letter-spacing:.32em;text-indent:.32em;color:#000;">
              {code}
            </div>
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 28px;">
          <div style="font-size:13px;line-height:1.6;color:#777169;">
            If you didn't ask for this, you can ignore it — nothing happens until the
            code is entered, and it stops working in {minutes} minutes. Nobody at Rezo
            will ever ask you for it.
          </div>
        </td></tr>

      </table>

      <div style="max-width:440px;margin-top:16px;font-size:12px;color:#a8a29a;
                  text-align:center;line-height:1.6;">
        Rezo · autonomous dispute resolution<br>
        Sent because someone entered this address at rezo.zevora.io
      </div>
    </td></tr>
  </table>
</body></html>"""

    text = (
        f"Your code to {action}: {code}\n\n"
        f"Enter it in the tab you already have open. It expires in {minutes} "
        f"minutes and can only be used once.\n\n"
        f"If you didn't ask for this you can ignore it — nothing happens until the "
        f"code is entered. Nobody at Rezo will ever ask you for it.\n\n"
        f"Rezo · rezo.zevora.io\n"
    )
    return subject, html, text


def send_login_code(to: str, code: str, minutes: int, is_new: bool) -> dict:
    subject, html, text = login_code_email(code, minutes, is_new)
    return send(to, subject, html, text, tag="login-code")


def looks_like_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}", (value or "").strip()))
