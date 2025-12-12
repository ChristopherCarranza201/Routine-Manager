# app/api/routers/subtasks.py
from typing import List, Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from app.core.db import get_supabase
from app.schemas.subtasks import SubtaskCreate, SubtaskUpdate, SubtaskOut

# auth (para obtener user_id)
from app.core.auth import get_current_user
from app.api.models.user import UserOut

router = APIRouter(prefix="/subtasks", tags=["Subtasks"])

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

@router.get("/by-task/{task_id}", response_model=List[SubtaskOut])
def list_by_task(task_id: UUID, supa = Depends(get_supabase)):
    res = supa.table("subtasks").select("*").eq("task_id", str(task_id)).order("position", desc=False).execute()
    return getattr(res, "data", []) or []

@router.post("/{task_id}", response_model=SubtaskOut, status_code=201)
def create_subtask(
    task_id: UUID,
    body: SubtaskCreate,
    supa = Depends(get_supabase),
    current_user: Annotated[UserOut, Depends(get_current_user)] = None
):
    # INSERT (sin .select encadenado) + devolver la fila insertada del propio payload
    payload = {
        "user_id": current_user.id,     # ← requerido por schema/RLS
        "task_id": str(task_id),
        "title": body.title,
    }
    ins = supa.table("subtasks").insert(payload).execute()
    data = _exec_or_400(ins, "Cannot create subtask")
    # Algunos setups devuelven lista; otros, nada. Si no hay fila, leer por última creada del usuario y task.
    if isinstance(data, list) and len(data) > 0:
        return data[0]
    # fallback de lectura
    sel = (
        supa.table("subtasks")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("task_id", str(task_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return _exec_or_400(sel, "Subtask created but not found")[0]

@router.patch("/{subtask_id}", response_model=SubtaskOut)
def update_subtask(
    subtask_id: UUID,
    body: SubtaskUpdate,
    supa = Depends(get_supabase),
    current_user: Annotated[UserOut, Depends(get_current_user)] = None
):
    payload = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not payload:
        raise HTTPException(400, "No fields to update")
    _ = supa.table("subtasks").update(payload).eq("id", str(subtask_id)).execute()
    # leer aparte (sin encadenar .select)
    sel = (
        supa.table("subtasks")
        .select("*")
        .eq("id", str(subtask_id))
        .eq("user_id", current_user.id)
        .limit(1)
        .execute()
    )
    data = getattr(sel, "data", None)
    if not data:
        raise HTTPException(404, "Subtask not found")
    return data[0]

@router.delete("/{subtask_id}", status_code=204)
def delete_subtask(subtask_id: UUID, supa = Depends(get_supabase)):
    res = supa.table("subtasks").delete().eq("id", str(subtask_id)).execute()
    _exec_or_400(res, "Cannot delete subtask")
    return
