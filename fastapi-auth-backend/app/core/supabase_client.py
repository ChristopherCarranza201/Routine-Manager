# app/core/supabase_client.py

import os
from typing import Optional

from fastapi import Request
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")  # opcional (privilegiado)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Faltan SUPABASE_URL/SUPABASE_KEY en .env")

# Cliente base (normalmente con anon key)
_base_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Cliente service (si hay service role key; si no, reutiliza el base)
_service_client: Client
if SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_ROLE_KEY != SUPABASE_KEY:
    _service_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
else:
    _service_client = _base_client


def _extract_bearer_token(request: Request) -> Optional[str]:
    """
    Extrae 'Bearer <token>' del Authorization header, si existe.
    """
    auth = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) != 2:
        return None
    scheme, token = parts[0], parts[1]
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def get_supabase() -> Client:
    """
    Cliente base (sin token de usuario).
    Útil para operaciones públicas o cuando no necesitas RLS del usuario.
    """
    return _base_client


def get_service_supabase() -> Client:
    """
    Cliente con Service Role (si SUPABASE_SERVICE_ROLE_KEY está configurada).
    Si no está, devuelve el cliente base.
    """
    return _service_client


def get_request_token(request: Request) -> Optional[str]:
    """
    Devuelve el token Bearer del request (si existe).
    """
    return _extract_bearer_token(request)


def get_supabase_for_request(request: Request) -> Client:
    """
    Devuelve un CLIENTE de Supabase clonado y autorizado con el token del request
    para que respete RLS. **Devuelve SOLO el cliente** (no una tupla),
    manteniendo compatibilidad con tus routers (sb.table(...)).

    En supabase-py v2 se autoriza PostgREST así:
        sb.postgrest.auth(token)
    """
    token = _extract_bearer_token(request)

    # Clonar un cliente por request evita compartir estado de auth entre peticiones
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    if token:
        # Autorizar PostgREST (RLS) con el token del usuario
        sb.postgrest.auth(token)

        # Si usas Storage con permisos por usuario:
        # sb.storage.auth(token)

    return sb
