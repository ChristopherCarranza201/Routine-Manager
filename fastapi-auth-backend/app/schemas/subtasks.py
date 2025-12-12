from __future__ import annotations
from typing import Optional, Annotated
from uuid import UUID
from pydantic import BaseModel, StringConstraints

# String con min_length y trim de espacios (Pydantic v2)
NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

class SubtaskCreate(BaseModel):
    title: NonEmptyStr

class SubtaskUpdate(BaseModel):
    title: Optional[NonEmptyStr] = None
    done: Optional[bool] = None
    position: Optional[float] = None

class SubtaskOut(BaseModel):
    id: UUID
    task_id: UUID
    title: str
    done: bool
    position: Optional[float] = None
