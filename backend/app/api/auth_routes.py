"""Authentication and onboarding endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from ..services import accounts
from ..services.accounts import AuthError

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
