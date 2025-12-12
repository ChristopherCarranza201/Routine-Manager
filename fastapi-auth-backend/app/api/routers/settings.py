# app/api/routes/settings.py

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.core.supabase_client import get_supabase_for_request
from app.core.auth import get_user_id

router = APIRouter(prefix="/api/settings", tags=["Configuration"])

class NotificationSettingsIn(BaseModel):
    phone: Optional[str] = None  # E.164 sin '+', ej: 526643713366
    notify_enabled: bool = True

@router.get("/notifications")
def get_notification_settings(
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request),
):
    try:
        resp = (
            sb.table("profiles")
            .select("phone, notify_enabled")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        if not rows:
            # perfil aún no creado
            return {"phone": None, "notify_enabled": False}
        return rows[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[settings.get] {e}")

@router.put("/notifications")
def set_notification_settings(
    payload: NotificationSettingsIn,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request),
):
    try:
        # upsert para crear la fila si no existe (RLS: id = auth.uid())
        row = {
            "id": user_id,
            "phone": payload.phone,
            "notify_enabled": payload.notify_enabled,
        }
        sb.table("profiles").upsert(row, on_conflict="id").execute()

        # lee en una segunda consulta (no encadenar .select() tras update/upsert)
        sel = (
            sb.table("profiles")
            .select("phone, notify_enabled")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        rows = sel.data or []
        if not rows:
            # extremadamente raro si la RLS/trigger fallara
            return {"phone": payload.phone, "notify_enabled": payload.notify_enabled}
        return rows[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[settings.put] {e}")
