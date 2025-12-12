# app/core/db.py
import os
from fastapi import HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_KEY", "")  # anon/public key

_bearer = HTTPBearer(auto_error=False)

def get_supabase(credentials: HTTPAuthorizationCredentials = Security(_bearer)) -> Client:
    """
    Crea un cliente Supabase y aplica el Bearer del usuario a PostgREST para que RLS funcione.
    No revalida el JWT (tu main.py ya lo hace). Solo lo reutiliza para RLS.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization: Bearer <token>",
        )
    token = credentials.credentials
    client: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(token)  # ← clave: autenticar PostgREST con el JWT del usuario
    return client
