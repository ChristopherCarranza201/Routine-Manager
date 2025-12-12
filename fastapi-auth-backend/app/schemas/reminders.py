from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

class ReminderCreate(BaseModel):
    task_id: UUID
    remind_at: datetime
    channel: Optional[str] = "email"
    payload: Optional[dict] = None

class ReminderOut(BaseModel):
    id: UUID
    task_id: UUID
    remind_at: datetime
    channel: str
    next_fire_at: datetime
    active: bool
