# PATCH /api/planner/{task_id}/recurrence

from typing import Annotated, Optional
from fastapi import APIRouter, Path, Depends, HTTPException, Request, status
from app.core.auth import get_user_id
from app.core.supabase_client import get_supabase_for_request
from app.schemas.tasks import ShiftRange, RecurrenceUpsert

router = APIRouter(prefix="/planner", tags=["Calendar-Planner"])

@router.get("/range")
def get_tasks_in_range(
    start: str,
    end: str,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request)
):
    resp = (
        sb.table("tasks")
          .select("*")
          .eq("user_id", user_id)
          .gte("start_ts", start)
          .lte("start_ts", end)
          .order("start_ts", desc=False)
          .execute()
    )
    return resp.data or []

@router.post("/{task_id}/recurrence")
def upsert_recurrence(
    task_id: str,
    payload: RecurrenceUpsert,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request)
):
    # Verificar que la tarea pertenezca al usuario (RLS friendly)
    owner_resp = (
        sb.table("tasks")
          .select("id")
          .eq("id", task_id)
          .eq("user_id", user_id)
          .limit(1)
          .execute()
    )
    owner_rows = owner_resp.data or []
    if not owner_rows:
        raise HTTPException(status_code=404, detail="Task not found")

    # Limpiar cualquier regla previa para esa task_id (tu esquema usa PK = task_id)
    sb.table("task_recurrence").delete().eq("task_id", task_id).execute()

    # Insertar la nueva regla (SIN .select() encadenado en v2)
    rec = {"task_id": task_id, **payload.model_dump()}
    sb.table("task_recurrence").insert(rec).execute()

    # Leer la representación con un SELECT aparte
    fetch = (
        sb.table("task_recurrence")
          .select("*")
          .eq("task_id", task_id)
          .limit(1)
          .execute()
    )
    rows = fetch.data or []
    if not rows:
        # Si llegamos aquí, puede ser RLS o un fallo inusual de inserción
        raise HTTPException(status_code=404, detail="Recurrence not found for this task")

    return rows[0]

@router.post("/shift")
def shift_range(
    payload: ShiftRange,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request)
):
    resp = (
        sb.table("tasks")
          .select("id")
          .eq("user_id", user_id)
          .gte("start_ts", payload.start.isoformat())
          .lte("start_ts", payload.end.isoformat())
          .execute()
    )
    rows = resp.data or []
    return {"candidate_to_move": len(rows)}

# PATCH /api/planner/{task_id}/recurrence
@router.patch("/{task_id}/recurrence")
def update_recurrence(
    task_id: str = Path(..., description="Task UUID"),
    payload: RecurrenceUpsert = ...,
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request),
):
    """
    Actualiza por completo la regla de recurrencia de una task existente.
    Nota v2: NO encadenar .select() tras update(); hacemos SELECT aparte.
    Acepta `until` como date o como string 'YYYY-MM-DD'.
    """
    # Verifica que la task sea del usuario (RLS-friendly)
    owner = (
        sb.table("tasks")
          .select("id")
          .eq("id", task_id)
          .eq("user_id", user_id)
          .limit(1)
          .execute()
    ).data or []
    if not owner:
        raise HTTPException(status_code=404, detail="Task not found")

    # Asegura que exista la fila de recurrencia
    exists = (
        sb.table("task_recurrence")
          .select("task_id")
          .eq("task_id", task_id)
          .limit(1)
          .execute()
    ).data or []
    if not exists:
        raise HTTPException(status_code=404, detail="Recurrence not found for this task")

    # Normaliza byweekday y until
    byweekday = payload.byweekday if (payload.freq == "WEEKLY") else None

    # `until` puede venir como date o str; aceptamos ambas
    until_value = payload.until
    if until_value is None:
        until_iso = None
    elif hasattr(until_value, "isoformat"):
        # pydantic la parseó como date
        until_iso = until_value.isoformat()
    elif isinstance(until_value, str):
        # confiamos en 'YYYY-MM-DD' (si viene con hora, la pasamos tal cual)
        until_iso = until_value
    else:
        # tipo inesperado
        raise HTTPException(status_code=400, detail="Invalid 'until' type")

    updates = {
        "freq": payload.freq,
        "interval": payload.interval,
        "byweekday": byweekday,
        "until": until_iso,
    }

    # v2: update() sin .select(), luego SELECT para devolver representación
    sb.table("task_recurrence").update(updates).eq("task_id", task_id).execute()

    fetch = (
        sb.table("task_recurrence")
          .select("*")
          .eq("task_id", task_id)
          .limit(1)
          .execute()
    )
    rows = fetch.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Recurrence not found after update")
    return rows[0]



# DELETE /api/planner/{task_id}/recurrence
@router.delete("/{task_id}/recurrence", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurrence(
    task_id: str = Path(..., description="Task UUID"),
    user_id: str = Depends(get_user_id),
    sb = Depends(get_supabase_for_request),
):
    """
    Elimina la regla de recurrencia (conserva la task semilla).
    """
    # Verifica ownership de la task
    owner = (
        sb.table("tasks")
          .select("id")
          .eq("id", task_id)
          .eq("user_id", user_id)
          .limit(1)
          .execute()
    ).data or []
    if not owner:
        raise HTTPException(status_code=404, detail="Task not found")

    # Borra la fila de recurrencia (si no existe, 204 igualmente)
    sb.table("task_recurrence").delete().eq("task_id", task_id).execute()
    return
