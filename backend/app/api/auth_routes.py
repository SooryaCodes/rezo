"""Authentication and onboarding endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..services import accounts, otp
from ..services.accounts import AuthError
from ..services.otp import OtpError

router = APIRouter()


def current(authorization: str | None) -> dict:
    token = (authorization or "").removeprefix("Bearer ").strip()
    try:
        return accounts.resolve(token)
    except AuthError as exc:
        raise HTTPException(401, str(exc))


class SignupBody(BaseModel):
    email: str
    password: str
    name: str = ""
    store_name: str
    category: str = "general"


@router.post("/signup")
async def signup(body: SignupBody):
    try:
        return await run_in_threadpool(
            accounts.signup, body.email, body.password, body.name,
            body.store_name, body.category)
    except AuthError as exc:
        raise HTTPException(400, str(exc))


class SigninBody(BaseModel):
    email: str
    password: str


@router.post("/signin")
async def signin(body: SigninBody):
    try:
        return await run_in_threadpool(accounts.signin, body.email, body.password)
    except AuthError as exc:
        raise HTTPException(401, str(exc))


class OtpRequestBody(BaseModel):
    email: str


@router.post("/otp/request")
async def otp_request(body: OtpRequestBody):
    """Send a one-time code. Tells the caller whether this address is new, so
    the next screen knows to ask for a store name."""
    try:
        return await run_in_threadpool(otp.request_code, body.email)
    except OtpError as exc:
        raise HTTPException(400, str(exc))


class OtpVerifyBody(BaseModel):
    email: str
    code: str
    name: str = ""
    store_name: str = ""
    category: str = "general"


@router.post("/otp/verify")
async def otp_verify(body: OtpVerifyBody):
    try:
        return await run_in_threadpool(
            otp.verify_code, body.email, body.code, body.name,
            body.store_name, body.category)
    except (OtpError, AuthError) as exc:
        raise HTTPException(400, str(exc))


class SampleBody(BaseModel):
    store_id: str = "st_rehana"


@router.post("/sample")
async def sample(body: SampleBody):
    """Look around a populated store without creating an account."""
    try:
        return await run_in_threadpool(accounts.sample_session, body.store_id)
    except AuthError as exc:
        raise HTTPException(400, str(exc))


@router.get("/me")
def me(authorization: str | None = Header(default=None)):
    return current(authorization)


@router.post("/signout")
def signout(authorization: str | None = Header(default=None)):
    accounts.signout((authorization or "").removeprefix("Bearer ").strip())
    return {"signed_out": True}


class StepBody(BaseModel):
    step: int


@router.post("/onboarding")
def onboarding(body: StepBody, authorization: str | None = Header(default=None)):
    session = current(authorization)
    accounts.set_onboarding_step(session["account"]["id"], body.step)
    return {"onboarding_step": body.step}
