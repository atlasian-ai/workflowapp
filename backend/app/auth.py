import base64
import logging

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings

logger = logging.getLogger(__name__)

# Algorithms that use JWKS (asymmetric) vs shared secret (symmetric)
_ASYMMETRIC_ALGS = {"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}

# In-memory JWKS cache (loaded once per process)
_jwks_keys: list[dict] = []


async def _load_jwks() -> list[dict]:
    """Fetch public keys from Supabase JWKS endpoint."""
    global _jwks_keys
    if _jwks_keys:
        return _jwks_keys
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            _jwks_keys = data.get("keys", [])
            logger.info(f"Loaded {len(_jwks_keys)} JWKS key(s) from Supabase (algs: {[k.get('alg') for k in _jwks_keys]})")
    except Exception as exc:
        logger.warning(f"Could not load JWKS: {exc}. Will fall back to HS256 secret.")
    return _jwks_keys


def _hs256_secret() -> bytes:
    """Return the HS256 secret — base64-decoded if possible."""
    raw = settings.supabase_jwt_secret
    try:
        return base64.b64decode(raw)
    except Exception:
        return raw.encode("utf-8")


async def verify_supabase_jwt(token: str) -> dict:
    """
    Verify a Supabase-issued JWT.
    New Supabase projects use ES256 (ECDSA P-256) via JWKS.
    Older projects use HS256 with a shared secret.
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")
        kid = header.get("kid")
        logger.debug(f"JWT header: alg={alg}, kid={kid}")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not parse token header: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Asymmetric (ES256, RS256, …): verify via JWKS ────────────────────────
    if alg in _ASYMMETRIC_ALGS:
        keys = await _load_jwks()

        # Prefer the key matching the token's kid
        candidates = [k for k in keys if k.get("kid") == kid] if kid else keys
        if not candidates:
            candidates = keys  # fall back to trying all keys

        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No JWKS keys available to verify token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        last_exc: Exception = Exception("No keys tried")
        for key in candidates:
            try:
                payload = jwt.decode(
                    token,
                    key,
                    algorithms=[alg],
                    options={"verify_aud": False},
                )
                return payload
            except JWTError as exc:
                last_exc = exc

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"{alg} token verification failed: {last_exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # ── Symmetric (HS256): verify with shared secret ──────────────────────────
    try:
        payload = jwt.decode(
            token,
            _hs256_secret(),
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"HS256 token verification failed: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def extract_user_id(payload: dict) -> str:
    """Extract the Supabase user UUID (sub claim) from JWT payload."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identifier",
        )
    return user_id
