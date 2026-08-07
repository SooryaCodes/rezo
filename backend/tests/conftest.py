"""Test environment.

Set before anything imports the app, because config reads the environment at
import time.

The suite must never touch a network. Once backend/.env is present the app
loads it in-process, so without this the tests would quietly start calling a
real model provider and a real mail provider: slow, billable, and
non-deterministic — three properties a test suite must not have. Pinning the
offline provider here is also what makes the guardrail assertions meaningful,
since they check exact refusals rather than whatever a model happened to say.
"""
import os

os.environ["REZO_LLM_PROVIDER"] = "offline"
os.environ["REZO_MAIL"] = "test"          # anything but "live"
os.environ.pop("RESEND_API_KEY", None)
