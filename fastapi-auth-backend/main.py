# main.py

import os
from datetime import datetime, timezone
from typing import Annotated, Optional, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, Request, status, Header, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm, HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

# JWT (HS256)
import jwt

# Supabase client
from supabase import create_client, Client

# Importar la clase AuthService y los modelos
from app.api.auth.auth_service import AuthService
from app.api.models.user import UserIn, UserOut, PasswordResetRequest, PasswordUpdate

# Routers del Routine Manager
from app.api.routers import dashboard, tasks, planner, settings as rm_settings, chat
from app.api.routers import subtasks, tags, reminders

# Routers de Whatsaatp Webhooks
from app.api.routers import notifications_whatsapp, webhook_whatsapp
from app.api.routers import task_reminders


# -------------------------------------------------------------------
# Cargar variables de entorno y app base
# -------------------------------------------------------------------
load_dotenv()

app = FastAPI(
    title="Routine Manager APP",
    description="""
A secure, Supabase-backed task manager with planning, recurrence, search, multi-tags, subtasks, and reminders.

**What it does**
- **Auth & Security:** Login via Supabase Auth (JWT HS256). Per-user Row-Level Security (RLS) enforced on all data access.
- **Tasks:** Create, list, update, and soft-delete tasks. Fields include title, description, single legacy tag, status, start_ts, end_ts, **priority** (low/medium/high/urgent), **position** (for drag-and-drop ordering), and **completed_at** (auto-set when marking done).  
  - Read via **`tasks_api` view** which exposes **`due_at`** (alias of `end_ts`) and hides soft-deleted rows.
- **Search & Ordering:** Full-text search (FTS) over title/description with a GIN index; fast filters by status, tag, priority; stable **reordering** using the `position` float.
- **Planner:** Define simple recurrences (DAILY/WEEKLY/MONTHLY), update them later, and shift task times in bulk.
- **Subtasks:** Lightweight checklists linked to a task (CRUD, ordering via `position`).
- **Tags (multi-tag):** User-scoped tag catalog and `task_tags` M:N relations (coexists with the legacy single `tag` column for gradual migration).
- **Reminders:** Time-based notifications per task with `remind_at`, `next_fire_at`, `channel`, `payload`, and `active`. Designed to work with a small scheduler/worker (e.g., service role + cron/loop).
- **Dashboard:** Quick per-user summary (counts, upcoming items).
- **Settings:** Store per-user phone and opt-in flag for notifications (`profiles` table).
- **Notifications (WhatsApp Cloud API):** Send plain text or approved templates; optionally fill templates from a task (`by-task`). Webhook endpoints included.
- **Chat assistant:** Natural-language endpoint that can create/modify/delete tasks and planner entries on your behalf.

**Tech**
- **Database:** Postgres (Supabase) with RLS. Core tables: `tasks`, `task_recurrence`, `profiles`, `chat_messages`, `notifications`, `login_history`.  
  New tables/features: **`tags`**, **`task_tags`**, **`subtasks`**, **`reminders`**, `tasks.tsv` (FTS), **`tasks_api` view**.
- **API style:** FastAPI with dependency-injected auth, clear 4xx/5xx errors, and OpenAPI/Swagger docs.

**Notes**
- Use the Swagger **Authorize** button to paste your Bearer token before trying endpoints.
- Write operations target base tables (e.g., `tasks`, `subtasks`); reads of tasks commonly use the `tasks_api` view to get `due_at` and omit soft-deleted rows.
""",
    version="1.0.0",
)



app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------------------------------------------------
# Config Supabase / HS256
# -------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_AUD = os.getenv("SUPABASE_AUD", "authenticated")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")  # Legacy JWT secret (HMAC)
ALLOW_DEV_HEADER = os.getenv("ALLOW_DEV_HEADER", "0") == "1"

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Faltan SUPABASE_URL/SUPABASE_KEY en .env")

# Cliente Supabase (para email real vía auth.get_user)
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Security scheme para Authorize (campo 'Bearer token')
bearer_scheme = HTTPBearer(auto_error=False)

# -------------------------------------------------------------------
# JWT HS256 validation
# -------------------------------------------------------------------
def _decode_jwt_hs256(token: str) -> Dict[str, Any]:
    """
    MODO HS256-ONLY:
    - Valida SIEMPRE con SUPABASE_JWT_SECRET (Legacy JWT secret).
    - Rechaza tokens con alg != HS256.
    - Valida 'aud' y 'iss' (si viene), y requiere 'exp' y 'sub'.
    """
    # 1) Header
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

    # 2) Payload sin firma (para leer iss si existe)
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

    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="[HS256] SUPABASE_JWT_SECRET no configurado",
        )

    # 3) Validación de firma/claims
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

# -------------------------------------------------------------------
# Dependencias
# -------------------------------------------------------------------
def get_auth_service():
    return AuthService()

async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Security(bearer_scheme)],
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> UserOut:
    """
    - Modo dev: X-User-Id (si ALLOW_DEV_HEADER=1)
    - Modo productivo: Authorization: Bearer <HS256 token>
    """
    # Dev bypass
    if ALLOW_DEV_HEADER and x_user_id:
        return UserOut(id=x_user_id, email="dev@example.com", created_at=datetime.now(timezone.utc))

    # Bearer requerido
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Validar HS256
    payload = _decode_jwt_hs256(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token payload missing 'sub'")

    # Email real desde Supabase
    try:
        res = supabase.auth.get_user(token)
        user = res.user
        email = getattr(user, "email", None) or (getattr(user, "user_metadata", {}) or {}).get("email")
        if not email:
            email = "unknown@example.com"
    except Exception:
        email = "unknown@example.com"

    return UserOut(id=user_id, email=email, created_at=datetime.now(timezone.utc))

# -------------------------------------------------------------------
# Routers protegidos bajo /api — SIN tags aquí para evitar duplicación
# -------------------------------------------------------------------
from fastapi import Depends as _Depends  # alias local
app.include_router(dashboard.router,      prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(tasks.router,          prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(planner.router,        prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(rm_settings.router,    prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(chat.router,           prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(subtasks.router,       prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(tags.router,           prefix="/api", dependencies=[_Depends(get_current_user)])
app.include_router(reminders.router,      prefix="/api", dependencies=[_Depends(get_current_user)])

app.include_router(notifications_whatsapp.router)  # /api/notify/whatsapp/...
app.include_router(webhook_whatsapp.router)        # /webhooks/whatsapp
app.include_router(task_reminders.router)
# -------------------------------------------------------------------
# Endpoints públicos
# -------------------------------------------------------------------
@app.get("/")
def read_root():
    return {"message": "Welcome to Routine Manager APP"}

@app.post("/auth/register", tags=["Authentication"])
async def register(user: UserIn, request: Request, auth_service: AuthService = Depends(get_auth_service)):
    ip_address = request.client.host
    user_data = await auth_service.sign_up_user(user.email, user.password, ip_address)
    if not user_data["success"]:
        raise HTTPException(status_code=400, detail=user_data["message"])
    return {"message": user_data["message"]}

@app.post("/auth/login", tags=["Authentication"])
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    auth_service: AuthService = Depends(get_auth_service),
    request: Request = None
):
    ip_address = request.client.host if request else "unknown"
    user_agent = request.headers.get("user-agent", "unknown") if request else "unknown"

    success, message, access_token, user = await auth_service.sign_in_user(
        form_data.username, form_data.password, ip_address, user_agent
    )
    if not success:
        raise HTTPException(status_code=401, detail=message)

    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.post("/auth/forgot-password", tags=["Authentication"])
async def forgot_password(request_body: PasswordResetRequest, auth_service: AuthService = Depends(get_auth_service)):
    result = await auth_service.request_password_reset(request_body.email)
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return {"message": result["message"]}

@app.post("/auth/reset-password", tags=["Authentication"])
async def reset_password(request_body: PasswordUpdate, auth_service: AuthService = Depends(get_auth_service)):
    result = await auth_service.update_user_password(
        request_body.access_token, request_body.refresh_token, request_body.new_password
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return {"message": result["message"]}

# Público para inspección del token con Authorize
@app.get("/debug/jwt-info", tags=["[DEBUG] Verify JWT HS256"])
def debug_jwt_info(credentials: Optional[HTTPAuthorizationCredentials] = Security(bearer_scheme)):
    """
    DEV ONLY: inspecciona el JWT SIN validar firma para mostrar alg e iss.
    Si hiciste 'Authorize', el token se adjunta automáticamente.
    """
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=400, detail="Missing Authorization: Bearer <token>")

    token = credentials.credentials
    try:
        header = jwt.get_unverified_header(token)
        unverified = jwt.decode(token, options={"verify_signature": False})
        alg = header.get("alg")
        iss = unverified.get("iss")
        return {"alg": alg, "iss": iss}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot parse token: {e}")

# Endpoint protegido de ejemplo (puedes quitarlo si no lo necesitas)
@app.get("/users/me", response_model=UserOut, tags=["[DEBUG] Whoami"])
async def read_current_user(current_user: Annotated[UserOut, Depends(get_current_user)]):
    return current_user


ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")

@app.get("/health/dispatcher", tags=["Health"])
def health_dispatcher(x_admin_token: str | None = Header(default=None, alias="X-Admin-Token")):
    if not ADMIN_TOKEN or x_admin_token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    sb = create_client(SUPABASE_URL, os.getenv("SUPABASE_SERVICE_ROLE_KEY",""))
    now = datetime.utcnow().isoformat() + "Z"
    stats = {
        "scheduled": sb.table("notifications").select("id", count="exact").eq("status","scheduled").execute().count or 0,
        "processing": sb.table("notifications").select("id", count="exact").eq("processing", True).execute().count or 0,
        "failed_24h": sb.rpc("rpc_failed_last_24h", {} ).execute().data if False else None  # opcional si creas un RPC
    }
    return {"status":"ok","time":now,"stats":stats}
