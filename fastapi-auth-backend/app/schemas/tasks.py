from typing import Optional, Literal, List
from datetime import datetime
from pydantic import BaseModel, Field, root_validator

# ===== Enums existentes =====
TaskTag = Literal["Education","Workout","Home","Job","Other"]
TaskStatus = Literal["pending","in_progress","done","canceled"]

# ===== Nuevo enum de prioridad =====
TaskPriority = Literal["low", "medium", "high", "urgent"]

# ===========================
# Requests
# ===========================

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    tag: TaskTag = "Other"                     # sigue aceptando el tag "único" legacy
    start_ts: datetime
    end_ts: Optional[datetime] = None          # legacy (si insertas directo a la tabla)
    priority: TaskPriority = "medium"          # NUEVO
    # Nota: position / completed_at NO se envían al crear

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[TaskTag] = None
    start_ts: Optional[datetime] = None
    end_ts: Optional[datetime] = None          # legacy
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None    # NUEVO
    position: Optional[float] = None           # NUEVO (reorder)

# ===========================
# Responses
# ===========================

class TaskOut(BaseModel):
    id: str
    title: str
    description: Optional[str]
    tag: TaskTag
    status: TaskStatus
    priority: TaskPriority = "medium"          # NUEVO
    start_ts: datetime

    # La vista tasks_api devuelve "due_at"; la tabla tasks tiene "end_ts".
    # Hacemos ambos opcionales y los mapeamos para compatibilidad.
    end_ts: Optional[datetime] = None          # legacy
    due_at: Optional[datetime] = Field(default=None, alias="due_at")  # vista

    position: Optional[float] = None           # NUEVO
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None    # NUEVO

    # Aceptar tanto {"due_at": "..."} como {"end_ts": "..."} y reflejar en ambos campos
    @root_validator(pre=True)
    def _normalize_due_end(cls, values):
        # Si solo viene due_at desde la vista, llenar end_ts para no romper consumidores legacy
        if "due_at" in values and values.get("due_at") and not values.get("end_ts"):
            values["end_ts"] = values["due_at"]
        # Si solo viene end_ts (lectura directa de la tabla), copiar a due_at por comodidad del FE nuevo
        if "end_ts" in values and values.get("end_ts") and not values.get("due_at"):
            values["due_at"] = values["end_ts"]
        return values

# ===========================
# Otros modelos existentes
# ===========================

class RecurrenceUpsert(BaseModel):
    freq: Literal["DAILY","WEEKLY","MONTHLY"]
    interval: int = 1
    byweekday: Optional[List[int]] = None
    until: Optional[str] = None  # YYYY-MM-DD

class ShiftRange(BaseModel):
    start: datetime
    end: datetime
    delta_days: int
