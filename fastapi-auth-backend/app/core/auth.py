# app/core/auth.py

import os
from datetime import datetime
from typing import Optional, Dict, Any, Annotated

from fastapi import Header, HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from app.api.models.user import UserOut
from app.core.supabase_client import get_supabase

# -------------------------
# Entorno
# -------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_AUD = os.getenv("SUPABASE_AUD", "authenticated")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")  # Legacy JWT secret (HMAC)
ALLOW_DEV_HEADER = os.getenv("ALLOW_DEV_HEADER", "0") == "1"

if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL faltante en .env")

if not SUPABASE_JWT_SECRET:
    # Para HS256, este secreto es indispensable
    raise RuntimeError("SUPABASE_JWT_SECRET (Legacy JWT secret) faltante en .env")

# Bearer para integrarse con Swagger Authorize
_bearer = HTTPBearer(auto_error=False)

# -------------------------
# Helpers
# -------------------------
def _decode_jwt_hs256(token: str) -> Dict[str, Any]:
    # 1) Verifica header
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"[JWT] Invalid header: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if alg != "HS256":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"[HS256-mode] Token alg={alg}. Obtén un token HS256 con /auth/login de este proyecto.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2) Lee payload sin firma para extraer iss si existe
    try:
        unverified = jwt.decode(
            token,
            options={"verify_signature": False, "verify_aud": False, "verify_iss": False}
        )
        token_iss = unverified.get("iss")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"[JWT] Cannot read unverified payload: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 3) Valida firma/claims con HS256
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=SUPABASE_AUD,
            issuer=token_iss or f"{SUPABASE_URL}/auth/v1",
            options={"require": ["exp", "sub"]},
        )
        return payload
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"[HS256] Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )

def _get_token_from_bearer(credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return credentials.credentials

# -------------------------
# Dependencias públicas (para routers)
# -------------------------
async def get_user_id(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Security(_bearer)],
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> str:
    """
    Devuelve el 'sub' del JWT (user_id).
    - En DEV, permite X-User-Id cuando ALLOW_DEV_HEADER=1.
    - En PROD, valida Bearer HS256 con SUPABASE_JWT_SECRET.
    """
    if ALLOW_DEV_HEADER and x_user_id:
        return x_user_id

    token = _get_token_from_bearer(credentials)
    payload = _decode_jwt_hs256(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token payload missing 'sub'")
    return user_id

async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Security(_bearer)],
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> UserOut:
    """
    Devuelve un UserOut con email real desde Supabase.
    - En DEV, permite X-User-Id cuando ALLOW_DEV_HEADER=1 (email dummy válido).
    - En PROD, valida Bearer HS256 con SUPABASE_JWT_SECRET y consulta Supabase.
    """
    if ALLOW_DEV_HEADER and x_user_id:
        return UserOut(id=x_user_id, email="dev@example.com", created_at=datetime.utcnow())

    token = _get_token_from_bearer(credentials)
    payload = _decode_jwt_hs256(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token payload missing 'sub'")

    # Obtener email real de Supabase con el token del usuario
    try:
        sb = get_supabase()
        res = sb.auth.get_user(token)
        user = res.user
        email = getattr(user, "email", None) or (getattr(user, "user_metadata", {}) or {}).get("email")
        if not email:
            email = "unknown@example.com"
    except Exception:
        email = "unknown@example.com"

    return UserOut(id=user_id, email=email, created_at=datetime.utcnow())
