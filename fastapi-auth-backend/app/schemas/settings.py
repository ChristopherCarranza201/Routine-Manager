from pydantic import BaseModel

class NotificationSettings(BaseModel):
    phone: str
    notify_enabled: bool
