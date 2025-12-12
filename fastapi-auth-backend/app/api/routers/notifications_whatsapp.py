# app/api/routes/notifications_whatsapp.py

from fastapi import APIRouter, Depends, HTTPException, Body, Path
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

from app.core.auth import get_user_id  # devuelve el user_id a partir del Bearer
from app.core.supabase_client import get_supabase_for_request
from app.api.models.user import UserOut  # solo para type hints opcionales (no obligatorio)
from app.integrations.whatsapp_client import send_text, send_template

router = APIRouter(prefix="/api/notify/whatsapp", tags=["Notifications - WhatsApp"])

# =========================
# Schemas
# =========================
class SendTextIn(BaseModel):
    to: str = Field(..., description="MSISDN internacional, ej: 5215551234567")
    message: str

class TemplateComponentParameter(BaseModel):
    type: str  # 'text'|'currency'|'date_time' etc.
    text: Optional[str] = None

class TemplateComponent(BaseModel):
    type: str  # 'body'|'header'|'button'
    parameters: Optional[List[TemplateComponentParameter]] = None
    # opcionales para botón URL dinámico, por si luego lo usas
    sub_type: Optional[str] = None   # ej. 'url'
    index: Optional[str] = None      # ej. '0'

class SendTemplateIn(BaseModel):
    to: str
    template_name: str
    lang_code: str = "en"  # por defecto 'en' ya que tu template aprobado está en 'language': 'en'
    components: Optional[List[TemplateComponent]] = None

class SendByTaskIn(BaseModel):
    to: str
    prefix: Optional[str] = "Recordatorio de tu rutina:"
    override_message: Optional[str] = None

# Enviar TEMPLATE por task (auto-mapeo de campos de la tarea)
class ByTaskTemplateIn(BaseModel):
    to: str = Field(..., description="Destino en E.164 sin '+', ej. 526643713366")
    task_id: str = Field(..., description="UUID de la tarea")
    template_name: str = Field("rm_task_summary", description="Nombre exacto del template aprobado")
    lang_code: str = Field("en", description="Código de idioma del template (ej. en, es_MX)")
    header_hint: Optional[str] = Field(None, description="Texto para Header {{1}} (ej. '30 min')")
    include_button: bool = Field(True, description="Si el template tiene botón URL dinámico {{1}}, enviar task_id")
    tz_hint: Optional[str] = Field(None, description="Etiqueta de zona horaria (ej. PDT, CST)")

# =========================
# Endpoints
# =========================

@router.post("/text")
def send_whatsapp_text(
    payload: SendTextIn,
    user_id: str = Depends(get_user_id),   # ✅ depende de get_user_id (sin circular)
):
    res = send_text(payload.to, payload.message)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)
    return res


@router.post("/template")
def send_whatsapp_template(
    payload: SendTemplateIn,
    user_id: str = Depends(get_user_id),   # ✅ igual aquí
):
    comps = None
    if payload.components:
        comps = [c.model_dump(exclude_none=True) for c in payload.components]
    res = send_template(payload.to, payload.template_name, payload.lang_code, comps)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)
    return res


@router.post("/task/{task_id}")
def send_whatsapp_by_task(
    task_id: str = Path(..., description="UUID de la tarea"),
    payload: SendByTaskIn = Body(...),
    user_id: str = Depends(get_user_id),                 # ✅ auth sin circular
    sb = Depends(get_supabase_for_request),              # acceso RLS con el token del request
):
    # 1) Obtén la tarea del usuario autenticado (RLS hará el resto)
    q = (
        sb.table("tasks")
        .select("id,title,description,tag,start_ts,end_ts,status")
        .eq("id", task_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = q.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")

    t = rows[0]

    # 2) Arma el mensaje
    if payload.override_message:
        body = payload.override_message
    else:
        start_iso = t.get("start_ts")
        try:
            dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00")) if start_iso else None
        except Exception:
            dt = None
        when = dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if dt else (start_iso or "sin fecha")

        pieces = [
            payload.prefix or "Recordatorio:",
            f"• Tarea: {t.get('title')}",
            f"• Inicio: {when}",
            f"• Estado: {t.get('status')}",
        ]
        if t.get("tag"):
            pieces.append(f"• Categoría: {t['tag']}")
        if t.get("description"):
            pieces.append(f"• Detalle: {t['description']}")
        body = "\n".join(pieces)

    # 3) Envía por WhatsApp (texto libre)
    res = send_text(payload.to, body)
    if not res.get("ok"):
        raise HTTPException(status_code=400, detail=res)

    return {"ok": True, "sent_to": payload.to, "task_id": task_id, "preview": body, "meta": res}


# === Enviar TEMPLATE por task (mapeo para rm_task_summary) ==================
@router.post("/template/by-task", summary="Send WhatsApp template by task")
def send_template_by_task(
    payload: ByTaskTemplateIn,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request),
):
    """
    Carga la tarea (RLS) y envía un template usando los campos mapeados.
    Soporta 'rm_task_summary' (header/body) y 'hello_world' (sin parámetros).
    Para nombres distintos, hace un fallback de body compacto.
    """
    # 1) Cargar la tarea del usuario
    q = (
        sb.table("tasks")
        .select("id,title,description,tag,start_ts,end_ts,status")
        .eq("id", payload.task_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = q.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Task not found")
    t = rows[0]

    # 2) Preparar strings legibles y NO vacíos
    title = (t.get("title") or "(no title)").strip() or "(no title)"
    description = (t.get("description") or "").strip()
    if not description:
        description = "-"  # evita parámetro vacío en {{7}}
    tag = (t.get("tag") or "Other").strip() or "Other"
    status = (t.get("status") or "pending").strip() or "pending"

    from datetime import datetime
    def _fmt(ts: Optional[str]) -> str:
        if not ts:
            return "-"
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime("%Y-%m-%d %H:%M")
        except Exception:
            return ts or "-"

    start_s = _fmt(t.get("start_ts"))
    end_s = _fmt(t.get("end_ts")) if t.get("end_ts") else start_s or "-"  # nunca vacío
    tz_s = (payload.tz_hint or "UTC").strip() or "UTC"

    header_text = (payload.header_hint or "30 min").strip() or "30 min"

    # 3) Construir components según el template
    components: List[Dict[str, Any]] = []

    if payload.template_name == "rm_task_summary":
        # Header {{1}} + Body {{1..7}} (todos como textos NO vacíos)
        components.append({
            "type": "header",
            "parameters": [ {"type": "text", "text": header_text} ]
        })
        components.append({
            "type": "body",
            "parameters": [
                {"type": "text", "text": title},        # {{1}}
                {"type": "text", "text": start_s},      # {{2}}
                {"type": "text", "text": end_s},        # {{3}}
                {"type": "text", "text": tz_s},         # {{4}}
                {"type": "text", "text": tag},          # {{5}}
                {"type": "text", "text": status},       # {{6}}
                {"type": "text", "text": description},  # {{7}}
            ]
        })
        # Si más adelante agregas botón URL dinámico con {{1}}, podrás añadir aquí un bloque "button" con sub_type/index/parameters

    elif payload.template_name == "hello_world":
        components = []  # no requiere parámetros

    else:
        # Fallback genérico (4 params) igualmente con strings no vacíos
        compact = [
            title,
            f"{start_s} — {end_s}".strip(),
            f"{tag} / {status}",
            description
        ]
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": s if s else "-"} for s in compact]
        })

    # 4) Enviar
    comps = components if components else None
    res = send_template(payload.to, payload.template_name, payload.lang_code, comps)
    if not res.get("ok"):
        # Debug útil: descomenta para ver exactamente lo que se envía a Graph si hay error
        # import json; print("DEBUG WA payload:", json.dumps({"to": payload.to, "template": payload.template_name, "lang": payload.lang_code, "components": comps}, ensure_ascii=False))
        raise HTTPException(status_code=400, detail=res)
    return {"ok": True, "data": res.get("data"), "task_id": payload.task_id}
