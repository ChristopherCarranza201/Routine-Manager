from pydantic import BaseModel
from typing import Optional, List

class ChatMessage(BaseModel):
    message: str

class ToolCreateTask(BaseModel):
    title: str
    description: Optional[str] = None
    tag: Optional[str] = "Other"
    start_ts: str
    end_ts: Optional[str] = None

class ToolUpdateTask(BaseModel):
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[str] = None
    start_ts: Optional[str] = None
    end_ts: Optional[str] = None
    status: Optional[str] = None

class ToolDeleteTask(BaseModel):
    id: str

class ToolBulkRepeat(BaseModel):
    id: str
    months: int
    weekdays: Optional[List[int]] = None
