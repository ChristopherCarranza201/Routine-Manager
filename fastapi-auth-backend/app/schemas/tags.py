from __future__ import annotations
from typing import Optional, Annotated
from uuid import UUID
from pydantic import BaseModel, StringConstraints

# String con min_length y trim de espacios (Pydantic v2)
NonEmptyStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

class TagCreate(BaseModel):
    name: NonEmptyStr
    color: Optional[str] = None

class TagOut(BaseModel):
    id: UUID
    name: str
    color: Optional[str] = None
