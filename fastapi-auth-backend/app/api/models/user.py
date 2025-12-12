# app/api/models/user.py

from pydantic import BaseModel, EmailStr

class UserIn(BaseModel):
    """
    Modelo de entrada para la creación de un usuario.
    """
    email: EmailStr
    password: str

class UserOut(BaseModel):
    """
    Modelo de salida para mostrar información de un usuario.
    """
    id: str
    email: EmailStr

    class Config:
        from_attributes = True

# --- Nuevos modelos para el restablecimiento de contraseña ---

class PasswordResetRequest(BaseModel):
    """
    Modelo para solicitar un correo de restablecimiento de contraseña.
    """
    email: EmailStr

class PasswordUpdate(BaseModel):
    """
    Modelo para actualizar la contraseña con un token.
    """
    access_token: str
    refresh_token: str
    new_password: str