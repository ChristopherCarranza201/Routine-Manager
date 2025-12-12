# app/api/routers/reminders.py
from typing import List, Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.db import get_supabase
from app.schemas.reminders import ReminderCreate, ReminderOut

# auth
from app.core.auth import get_current_user
from app.api.models.user import UserOut

router = APIRouter(prefix="/reminders", tags=["Reminders"])

def _exec_or_400(res, fallback_msg="Operation failed"):
    data = getattr(res, "data", None)
    if data is None or (isinstance(data, list) and len(data) == 0):
        err = getattr(res, "error", None)
        if not err:
            resp = getattr(res, "response", None)
            if resp is not None:
                try:
                    err = resp.json()
                except Exception:
                    err = getattr(resp, "text", None) or fallback_msg
        raise HTTPException(status_code=400, detail=err or fallback_msg)
    return data

@router.get("", response_model=List[ReminderOut])
def list_reminders(
    supa = Depends(get_supabase),
    active: bool = Query(True),
    page: int = 1,
    limit: int = 50
):
    start = (page - 1) * limit
    end = start + limit - 1
    q = supa.table("reminders").select("*").eq("active", active).order("next_fire_at", desc=False).range(start, end)
    res = q.execute()
    return getattr(res, "data", []) or []

@router.post("", response_model=ReminderOut, status_code=201)
def create_reminder(
    body: ReminderCreate,
    supa = Depends(get_supabase),
    current_user: Annotated[UserOut, Depends(get_current_user)] = None
):
    payload = {
        "user_id": current_user.id,        # ← requerido
        "task_id": str(body.task_id),
        "remind_at": body.remind_at.isoformat(),
        "channel": body.channel or "email",
        "payload": body.payload,
        "next_fire_at": body.remind_at.isoformat(),
        "active": True,
    }
    ins = supa.table("reminders").insert(payload).execute()
    data = _exec_or_400(ins, "Cannot create reminder")
    if isinstance(data, list) and len(data) > 0:
        return data[0]
    # fallback select
    sel = (
        supa.table("reminders")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("task_id", str(body.task_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return _exec_or_400(sel, "Reminder created but not found")[0]

@router.post("/{reminder_id}/cancel", status_code=204)
def cancel_reminder(reminder_id: UUID, supa = Depends(get_supabase)):
    res = supa.table("reminders").update({"active": False}).eq("id", str(reminder_id)).execute()
    _exec_or_400(res, "Cannot cancel reminder")
    return
