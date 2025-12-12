# app/api/routes/tasks.py
from typing import Annotated, Optional, List
from datetime import datetime
from zoneinfo import ZoneInfo  # 👈 añadido para conversión local->UTC

from fastapi import APIRouter, Depends, HTTPException, Request, status, Path, Query
from pydantic import BaseModel, Field, model_validator, ConfigDict

from app.api.models.user import UserOut
from app.core.auth import get_current_user
from app.core.supabase_client import get_supabase_for_request

router = APIRouter(prefix="", tags=["Tasks [To-Do]"])

# ===========
# Enums
# ===========
TaskTag = str  # ('Education','Workout','Home','Job','Other') — lo conserva tu DB
TaskStatus = str  # ('pending','in_progress','done','canceled')
TaskPriority = str  # ('low','medium','high')

# ===========
# Modelos
# ===========
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    tag: Optional[TaskTag] = "Other"
    start_ts: Optional[datetime] = None  # permitido si mandas *_local + tz
    end_ts: Optional[datetime] = None
    # Alternativa en hora local (si usas estos, convierte el backend):
    start_ts_local: Optional[str] = None
    end_ts_local: Optional[str] = None
    tz: Optional[str] = None
    status: Optional[TaskStatus] = "pending"
    priority: TaskPriority = "medium"  # NUEVO

    @model_validator(mode="after")
    def validate_dates(self):
        # La validación precisa se hace en el endpoint tras convertir local->UTC.
        # Aquí sólo validamos si ambos UTC están presentes.
        if self.start_ts and self.end_ts and self.end_ts < self.start_ts:
            raise ValueError("end_ts must be >= start_ts")
        return self

        # Ejemplo en Swagger con hora local
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "title": "Team sync",
            "description": "Review blockers",
            "tag": "Job",
            "start_ts_local": "2025-10-23T17:30:00",
            "end_ts_local": "2025-10-23T18:00:00",
            "tz": "America/Tijuana",
            "status": "pending",
            "priority": "high"
        }
    })

class TaskOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: Optional[str]
    tag: TaskTag
    start_ts: datetime
    # Compat: la tabla tiene end_ts; la vista expone due_at.
    end_ts: Optional[datetime] = None
    due_at: Optional[datetime]
    status: TaskStatus
    priority: TaskPriority  # NUEVO
    position: Optional[float] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


# ===========
# List Tasks
# ===========
@router.get("/tasks", response_model=List[TaskOut])
def list_tasks(
    request: Request,
    current_user: Annotated[UserOut, Depends(get_current_user)],
    limit: int = Query(50, ge=1, le=200),
    page: int = Query(1, ge=1),
    q: Optional[str] = Query(None, description="Búsqueda por texto (fallback ILIKE si no usas RPC)"),
    status_filter: Optional[TaskStatus] = Query(None),
    tag_filter: Optional[TaskTag] = Query(None),
    priority: Optional[TaskPriority] = Query(None),
):
    try:
        sb = get_supabase_for_request(request)

        # Si activas el RPC de FTS:
        if q:
            try:
                res = sb.rpc(
                    "search_tasks",
                    {"q": q, "p_limit": limit, "p_offset": (page - 1) * limit},
                ).execute()
                data = res.data or []
                # Filtros adicionales (opcional, o muévelos al RPC si quieres)
                if status_filter:
                    data = [d for d in data if d.get("status") == status_filter]
                if tag_filter:
                    data = [d for d in data if d.get("tag") == tag_filter]
                if priority:
                    data = [d for d in data if d.get("priority") == priority]
                return data
            except Exception:
                # cae a fallback si no existe el RPC
                pass

        query = sb.table("tasks_api").select("*").eq("user_id", current_user.id)

        if status_filter:
            query = query.eq("status", status_filter)
        if tag_filter:
            query = query.eq("tag", tag_filter)
        if priority:
            query = query.eq("priority", priority)
        if q:
            # Fallback simple
            query = query.or_(
                f"title.ilike.%{q}%,description.ilike.%{q}%"
            )

        # orden y paginado
        query = (
            query.order("start_ts", desc=False)
            .range((page - 1) * limit, (page - 1) * limit + (limit - 1))
        )
        res = query.execute()
        return res.data or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[tasks.list] {e}")


# ===========
# Create Task
# ===========
@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    request: Request,
    payload: TaskCreate,
    current_user: Annotated[UserOut, Depends(get_current_user)],
):
    try:
        sb = get_supabase_for_request(request)

        # Conversión local -> UTC si llega start_ts_local/end_ts_local + tz
        start_ts_dt = payload.start_ts
        end_ts_dt = payload.end_ts
        if (payload.start_ts_local or payload.end_ts_local) and payload.tz:
            try:
                tz = ZoneInfo(payload.tz)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid tz. Use an IANA TZ like 'America/Tijuana'.")
            if payload.start_ts_local:
                try:
                    local_dt = datetime.fromisoformat(payload.start_ts_local)
                except Exception:
                    raise HTTPException(status_code=400, detail="start_ts_local must be ISO8601 like 'YYYY-MM-DDTHH:MM:SS'")
                if local_dt.tzinfo is None:
                    local_dt = local_dt.replace(tzinfo=tz)
                else:
                    # Coerce a la TZ indicada por el cliente
                    local_dt = local_dt.astimezone(tz)
                start_ts_dt = local_dt.astimezone(ZoneInfo("UTC"))
            if payload.end_ts_local:
                try:
                    local_dt = datetime.fromisoformat(payload.end_ts_local)
                except Exception:
                    raise HTTPException(status_code=400, detail="end_ts_local must be ISO8601 like 'YYYY-MM-DDTHH:MM:SS'")
                if local_dt.tzinfo is None:
                    local_dt = local_dt.replace(tzinfo=tz)
                else:
                    local_dt = local_dt.astimezone(tz)
                end_ts_dt = local_dt.astimezone(ZoneInfo("UTC"))

        # Validación simple si ambos están presentes
        if start_ts_dt and end_ts_dt and end_ts_dt < start_ts_dt:
            raise HTTPException(status_code=400, detail="end_ts must be >= start_ts")

        row = {
            "user_id": current_user.id,  # mantienes tu asignación explícita (además de RLS)
            "title": payload.title,
            "description": payload.description,
            "tag": payload.tag,
            "start_ts": (start_ts_dt or payload.start_ts).isoformat(),
            "end_ts": (end_ts_dt.isoformat() if end_ts_dt else None),
            "status": payload.status,
            "priority": payload.priority,  # NUEVO
        }
        row = {k: v for k, v in row.items() if v is not None}

        # Insert en tabla base (no encadenar .select() en v2)
        resp = sb.table("tasks").insert(row).execute()

        # Normalmente v2 devuelve la fila insertada
        if getattr(resp, "data", None):
            inserted_id = resp.data[0]["id"]
        else:
            # Fallback (raro): buscar por (user_id, title) más reciente
            fetch = (
                sb.table("tasks")
                .select("id")
                .eq("user_id", current_user.id)
                .eq("title", payload.title)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if not fetch.data:
                raise HTTPException(status_code=500, detail="Insert did not return data")
            inserted_id = fetch.data[0]["id"]

        # Releer desde la vista (para due_at)
        out = sb.table("tasks_api").select("*").eq("id", inserted_id).limit(1).execute()
        if out.data:
            return out.data[0]

        # Si falla la vista por alguna razón, devolvemos la fila base
        base = sb.table("tasks").select("*").eq("id", inserted_id).limit(1).execute()
        if base.data:
            return base.data[0]

        raise HTTPException(status_code=500, detail="Could not fetch created task")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[tasks.create] {e}")


class TaskUpdate(BaseModel):
    # PATCH: todos opcionales
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    tag: Optional[TaskTag] = None
    start_ts: Optional[datetime] = None
    end_ts: Optional[datetime] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None  # NUEVO
    position: Optional[float] = None         # NUEVO
    # Alternativa en hora local:
    start_ts_local: Optional[str] = None
    end_ts_local: Optional[str] = None
    tz: Optional[str] = None

    @model_validator(mode="after")
    def validate_dates(self):
        # Solo validar si ambos vienen
        if self.start_ts and self.end_ts and self.end_ts < self.start_ts:
            raise ValueError("end_ts must be >= start_ts")
        return self

        # Ejemplo en Swagger con hora local (PATCH)
    model_config = ConfigDict(json_schema_extra={
        "example": {
            "title": "Team sync (rescheduled)",
            "start_ts_local": "2025-10-23T19:00:00",
            "end_ts_local": "2025-10-23T19:30:00",
            "tz": "America/Tijuana",
            "status": "in_progress",
            "priority": "medium"
        }
    })


# ===========
# Update Task
# ===========
@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    request: Request,
    task_id: Annotated[str, Path(..., description="Task UUID")],
    payload: TaskUpdate,
    current_user: Annotated[UserOut, Depends(get_current_user)],
):
    try:
        sb = get_supabase_for_request(request)

        # Conversión local -> UTC si llega *_local + tz
        if (payload.start_ts_local or payload.end_ts_local) and payload.tz:
            try:
                tz = ZoneInfo(payload.tz)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid tz. Use an IANA TZ like 'America/Tijuana'.")
            if payload.start_ts_local:
                try:
                    local_dt = datetime.fromisoformat(payload.start_ts_local)
                except Exception:
                    raise HTTPException(status_code=400, detail="start_ts_local must be ISO8601 like 'YYYY-MM-DDTHH:MM:SS'")
                if local_dt.tzinfo is None:
                    local_dt = local_dt.replace(tzinfo=tz)
                else:
                    local_dt = local_dt.astimezone(tz)
                payload.start_ts = local_dt.astimezone(ZoneInfo("UTC"))
            if payload.end_ts_local:
                try:
                    local_dt = datetime.fromisoformat(payload.end_ts_local)
                except Exception:
                    raise HTTPException(status_code=400, detail="end_ts_local must be ISO8601 like 'YYYY-MM-DDTHH:MM:SS'")
                if local_dt.tzinfo is None:
                    local_dt = local_dt.replace(tzinfo=tz)
                else:
                    local_dt = local_dt.astimezone(tz)
                payload.end_ts = local_dt.astimezone(ZoneInfo("UTC"))
        # Validación sencilla
        if payload.start_ts and payload.end_ts and payload.end_ts < payload.start_ts:
            raise HTTPException(status_code=400, detail="end_ts must be >= start_ts")

        # Construir SET solo con campos presentes
        updates = {}
        if payload.title is not None:
            updates["title"] = payload.title
        if payload.description is not None:
            updates["description"] = payload.description
        if payload.tag is not None:
            updates["tag"] = payload.tag
        if payload.start_ts is not None:
            updates["start_ts"] = payload.start_ts.isoformat()
        if payload.end_ts is not None:
            updates["end_ts"] = payload.end_ts.isoformat()
        if payload.status is not None:
            updates["status"] = payload.status
        if payload.priority is not None:
            updates["priority"] = payload.priority
        if payload.position is not None:
            updates["position"] = payload.position

        if not updates:
            # nada que actualizar
            current = (
                sb.table("tasks_api").select("*").eq("id", task_id).eq("user_id", current_user.id).limit(1).execute()
            )
            if not current.data:
                raise HTTPException(status_code=404, detail="Task not found")
            return current.data[0]

        # Aplicar update
        upd = (
            sb.table("tasks")
            .update(updates)
            .eq("id", task_id)
            .eq("user_id", current_user.id)
            .execute()
        )
        if getattr(upd, "data", None):
            # re-leer desde la vista
            fetch = sb.table("tasks_api").select("*").eq("id", task_id).limit(1).execute()
            if fetch.data:
                return fetch.data[0]

        # Fallback: desde la tabla
        base = (
            sb.table("tasks")
            .select("*")
            .eq("id", task_id)
            .eq("user_id", current_user.id)
            .limit(1)
            .execute()
        )
        if base.data:
            return base.data[0]

        raise HTTPException(status_code=404, detail="Task not found after update")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[tasks.update] {e}")


# ===========
# Delete Task
# ===========
@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    request: Request,
    task_id: Annotated[str, Path(..., description="Task UUID")],
    current_user: Annotated[UserOut, Depends(get_current_user)],
):
    try:
        sb = get_supabase_for_request(request)
        resp = (
            sb.table("tasks")
            .delete()
            .eq("id", task_id)
            .eq("user_id", current_user.id)
            .execute()
        )
        # No body (204)
        return
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"[tasks.delete] {e}")
