import os
import json
import time
import base64
from typing import Optional
from functools import lru_cache

import httpx
import jwt as pyjwt
from fastapi import HTTPException, Header

from db.models import db

# Decode Clerk domain from publishable key
def _clerk_domain() -> str:
    pk = os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")
    if not pk:
        # Fallback from CLERK_SECRET_KEY domain
        return os.environ.get("CLERK_DOMAIN", "busy-alpaca-16.clerk.accounts.dev")
    payload = pk.replace("pk_test_", "").replace("pk_live_", "")
    payload += "=" * (4 - len(payload) % 4)
    return base64.b64decode(payload).decode().rstrip("$").strip()


# Cache JWKS for 1 hour
_jwks_cache: dict = {"keys": [], "fetched_at": 0}


async def _get_jwks() -> list[dict]:
    now = time.time()
    if now - _jwks_cache["fetched_at"] < 3600 and _jwks_cache["keys"]:
        return _jwks_cache["keys"]

    domain = _clerk_domain()
    url = f"https://{domain}/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()

    _jwks_cache["keys"] = data.get("keys", [])
    _jwks_cache["fetched_at"] = now
    return _jwks_cache["keys"]


async def _verify_clerk_jwt(token: str) -> dict:
    """Verify a Clerk-issued JWT and return the payload."""
    # Decode header to get key ID
    try:
        header = pyjwt.get_unverified_header(token)
        kid = header.get("kid")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid JWT header: {e}")

    keys = await _get_jwks()
    matching = [k for k in keys if k.get("kid") == kid]
    if not matching:
        # Refresh JWKS and retry once
        _jwks_cache["fetched_at"] = 0
        keys = await _get_jwks()
        matching = [k for k in keys if k.get("kid") == kid]
    if not matching:
        raise HTTPException(status_code=401, detail="JWT key not found in JWKS")

    jwk = matching[0]
    public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))

    try:
        payload = pyjwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk JWTs don't have a standard aud
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    return payload


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Validate Clerk JWT and return the user dict from our DB."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    payload = await _verify_clerk_jwt(token)

    clerk_id = payload.get("sub", "")
    email = payload.get("email", "")

    user = await db.get_user_by_clerk_id(clerk_id)
    if not user:
        user = await db.get_or_create_user(clerk_id, email)

    return user


async def verify_token_from_query(token: str) -> Optional[dict]:
    """Verify token from query param (for SSE endpoints)."""
    try:
        payload = await _verify_clerk_jwt(token)
        clerk_id = payload.get("sub", "")
        return await db.get_user_by_clerk_id(clerk_id)
    except HTTPException:
        return None
    except Exception:
        return None
