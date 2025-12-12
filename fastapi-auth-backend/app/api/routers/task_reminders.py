# app/api/routers/task_reminders.py

from typing import Annotated, Optional, List
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo  # 👈 NUEVO: para convertir hora LOCAL -> UTC

from fastapi import APIRouter, Depends, HTTPException, Request, status, Path, Query
from pydantic import BaseModel, Field, ConfigDict

from app.api.models.user import UserOut
from app.core.auth import get_current_user
from app.core.supabase_client import get_supabase_for_request

router = APIRouter(prefix="/api/reminders", tags=["Reminders"])

# ===========
# Modelos
# ===========
class ReminderCreateByTask(BaseModel):
    task_id: str = Field(..., description="UUID de la tarea")
    minutes_before: int = Field(..., ge=0, le=24*60, description="Minutos antes del start_ts")
    template_name: str = Field(..., description="Nombre del template aprobado, p.ej. rm_task_summary")
    lang_code: str = Field("en", description="Código de idioma: en, en_US, es_MX, etc.")
    header_hint: Optional[str] = Field(None, description="Texto para el HEADER del template (p.ej. '15 min')")
    tz_hint: Optional[str] = Field(None, description="Pista de zona (ej. 'PDT') para el campo ({{4}}) del template")
    include_button: bool = Field(False, description="Si tu template tiene botón URL con parámetro")
    button_param_text: Optional[str] = Field(None, description="Valor del parámetro del botón (URL param) si aplica")

    # 👇 NUEVO (opcional): si lo envías, se prioriza sobre minutes_before
    scheduled_for_local: Optional[str] = Field(
        None,
        description="Fecha/hora LOCAL ISO SIN Z (ej: 2025-10-23T19:50:00). Si se envía, tiene prioridad sobre minutes_before."
    )
    tz_name: Optional[str] = Field(
        None,
        description="Zona horaria IANA para scheduled_for_local (ej: America/Tijuana). Requerida si usas scheduled_for_local."
    )

        # Ejemplo en Swagger usando hora local del recordatorio
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "task_id": "3d4ac02c-5f8a-4c14-970f-7da20e46af97",
            "minutes_before": 15,
            "template_name": "rm_task_summary",
            "lang_code": "en",
            "header_hint": "15 min",
            "tz_hint": "PDT",
            "scheduled_for_local": "2025-10-23T19:45:00",
            "tz_name": "America/Tijuana",
            "include_button": False,
            "button_param_text": ""
        }
    })


class ReminderOut(BaseModel):
    id: str
    user_id: str
    task_id: Optional[str] = None
    channel: str  # whatsapp
    scheduled_for: datetime
    status: str   # scheduled/sent/failed/canceled
    payload: Optional[dict] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

class ReminderPatch(BaseModel):
    scheduled_for: Optional[datetime] = None
    status: Optional[str] = None  # scheduled/sent/failed/canceled
    payload: Optional[dict] = None
    active: Optional[bool] = None

# ===================================================
# 1) Crear reminder para una tarea (notificación WA)
# ===================================================
@router.post("/by-task", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
def create_reminder_by_task(
    request: Request,
    body: ReminderCreateByTask,
    current_user: Annotated[UserOut, Depends(get_current_user)],
):
    sb = get_supabase_for_request(request)

    # 1) Traer la tarea (del mismo usuario) para calcular la hora
    t = (
        sb.table("tasks")
        .select("id,title,description,tag,status,start_ts,end_ts")
        .eq("id", body.task_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not t.data:
        raise HTTPException(status_code=404, detail="Task not found")
    task = t.data[0]

    # 2) Determinar scheduled_for (UTC)
    #    - Si viene scheduled_for_local+tz_name => convertir a UTC
    #    - Si no, usar start_ts - minutes_before
    if body.scheduled_for_local:
        if not body.tz_name:
            raise HTTPException(status_code=400, detail="tz_name required when using scheduled_for_local")
        try:
            tz = ZoneInfo(body.tz_name)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid tz_name. Use an IANA TZ like 'America/Tijuana'.")
        try:
            local_dt = datetime.fromisoformat(body.scheduled_for_local)
        except Exception:
            raise HTTPException(status_code=400, detail="scheduled_for_local must be ISO8601 like 'YYYY-MM-DDTHH:MM:SS'")
        if local_dt.tzinfo is None:
            local_dt = local_dt.replace(tzinfo=tz)
        else:
            local_dt = local_dt.astimezone(tz)
        scheduled_for = local_dt.astimezone(ZoneInfo("UTC"))
    else:
        # vía minutes_before
        try:
            start_ts = datetime.fromisoformat(task["start_ts"].replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=500, detail="Invalid task.start_ts format")
        scheduled_for = start_ts - timedelta(minutes=body.minutes_before)

    # 3) No permitir fechas en el pasado
    now_utc = datetime.now(tz=ZoneInfo("UTC"))
    if scheduled_for <= now_utc:
        raise HTTPException(status_code=400, detail="scheduled_for result is in the past")

    # 4) Armar payload mínimo para el worker
    #    (Fijamos channel='whatsapp' según Opción A)
    reminder_payload = {
        "mode": "template_by_task",
        "template_name": body.template_name,
        "lang_code": body.lang_code,
        "tz_hint": body.tz_hint or "",
        "include_button": body.include_button,
        "button_param_text": body.button_param_text,
        # Usa header_hint si vino; si no, "<minutes_before> min"
        "header_hint": body.header_hint or f"{body.minutes_before} min",
        "task_snapshot": {
            "title": task["title"],
            "description": task.get("description") or "",
            "tag": task.get("tag") or "Other",
            "status": task.get("status") or "pending",
            "start_ts": task["start_ts"],
            "end_ts": task.get("end_ts"),
        },
    }

    ins = (
        sb.table("notifications")
        .insert({
            "user_id": current_user.id,
            "task_id": body.task_id,
            "channel": "whatsapp",  # <- forzado aquí (Opción A)
            "scheduled_for": scheduled_for.isoformat(),
            "status": "scheduled",
            "payload": reminder_payload,
        })
        .execute()
    )
    if not ins.data:
        raise HTTPException(status_code=500, detail="Insert failed")
    new_id = ins.data[0]["id"]

    out = sb.table("notifications").select("*").eq("id", new_id).limit(1).execute()
    if not out.data:
        raise HTTPException(status_code=500, detail="Could not reload reminder")
    return out.data[0]


# ===========================
# 2) Listar reminders
# ===========================
@router.get("", response_model=List[ReminderOut])
def list_reminders(
    request: Request,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    only_active: bool = Query(True),
):
    sb = get_supabase_for_request(request)
    q = sb.table("notifications").select("*").eq("user_id", current_user.id)
    if only_active:
        q = q.eq("status", "scheduled")
    q = q.order("scheduled_for", desc=False)
    res = q.execute()
    return res.data or []


# ===========================
# 3) Actualizar un reminder
# ===========================
@router.patch("/{reminder_id}", response_model=ReminderOut)
def update_reminder(
    request: Request,
    reminder_id: str = Path(...),
    body: ReminderPatch = None,
    current_user: Annotated[UserOut, Depends(get_current_user)] = None,
):
    sb = get_supabase_for_request(request)
    updates = {}
    if body is not None:
        if body.scheduled_for is not None:
            updates["scheduled_for"] = body.scheduled_for.isoformat()
        if body.status is not None:
            updates["status"] = body.status
        if body.payload is not None:
            updates["payload"] = body.payload
        if body.active is not None:
            # si usas 'active', puedes mapearlo a status
            updates["status"] = "scheduled" if body.active else "canceled"

    if not updates:
        r = (
            sb.table("notifications")
            .select("*")
            .eq("id", reminder_id)
            .eq("user_id", current_user.id)
            .limit(1)
            .execute()
        )
        if not r.data:
            raise HTTPException(status_code=404, detail="Reminder not found")
        return r.data[0]

    upd = (
        sb.table("notifications")
        .update(updates)
        .eq("id", reminder_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not getattr(upd, "data", None):
        raise HTTPException(status_code=404, detail="Reminder not found or not updated")

    r = (
        sb.table("notifications")
        .select("*")
        .eq("id", reminder_id)
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    if not r.data:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return r.data[0]

# ===========================
# 4) Eliminar un reminder
# ===========================
@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    request: Request,
    reminder_id: str = Path(...),
    current_user: Annotated[UserOut, Depends(get_current_user)] = None,
):
    sb = get_supabase_for_request(request)
    _ = (
        sb.table("notifications")
        .delete()
        .eq("id", reminder_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    return
