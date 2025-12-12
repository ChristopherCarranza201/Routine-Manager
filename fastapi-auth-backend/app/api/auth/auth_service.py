# app/api/auth/auth_service.py

import os
from supabase import create_client, Client
from dotenv import load_dotenv
from fastapi import HTTPException, status
from app.api.security.anomaly_agent import process_login_attempt, process_registration
from app.api.models.user import UserOut

load_dotenv()

# Variables de entorno
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

class AuthService:
    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("Las variables de entorno de Supabase no están configuradas.")
        self.client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        self.service_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    async def sign_up_user(self, email: str, password: str, ip_address: str):
        try:
            # Correctly await the coroutine
            user = await process_registration(self.service_client, email, password, ip_address)

            # Check if user object was successfully returned.
            if user:
                return {"success": True, "message": "Registro exitoso. Por favor revisa tu correo para verificar tu cuenta."}
            else:
                return {"success": False, "message": "Error al procesar el registro."}

        except Exception as e:
            # This handles exceptions from process_registration as well.
            print(f"Error en el registro del usuario: {e}")
            return {"success": False, "message": "Error al procesar el registro."}

    async def sign_in_user(self, email: str, password: str, ip_address: str, user_agent: str):
        try:
            auth_response = self.client.auth.sign_in_with_password({"email": email, "password": password})
            
            if not auth_response.user:
                return False, "Credenciales inválidas.", None, None

            user_id = auth_response.user.id
            decision = process_login_attempt(
                supabase_service=self.service_client,
                user_id=user_id,
                ip_address=ip_address,
                user_agent=user_agent
            )

            if decision == "RECHAZAR":
                return False, "Inicio de sesión rechazado debido a actividad anómala.", None, None

            # On successful login, return all 4 expected values
            user_out = UserOut(id=auth_response.user.id, email=auth_response.user.email)
            return True, "Login exitoso.", auth_response.session.access_token, user_out
        except Exception as e:
            print(f"Error en el inicio de sesión del usuario: {e}")
            return False, "Error al procesar la solicitud.", None, None

    async def sign_out_user(self):
        try:
            # En el backend, esto invalida la sesión actual del cliente.
            self.client.auth.sign_out()
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    async def get_current_user(self, token: str) -> UserOut:
        try:
            # Se usa el cliente estándar porque es el que maneja sesiones de usuario.
            user_response = self.client.auth.get_user(token)
            if not user_response or not user_response.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Credenciales inválidas o token expirado.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return UserOut(id=user_response.user.id, email=user_response.user.email)
        except Exception as e:
            print(f"Error en la autenticación del token: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token no válido.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def request_password_reset(self, email: str):
        """
        Solicita a Supabase que envíe un enlace de restablecimiento de contraseña.
        """
        try:
            # La documentación de Supabase confirma este método.
            self.client.auth.reset_password_for_email(email)
            return {"success": True, "message": "Si la dirección de correo electrónico está registrada, recibirás un enlace para restablecer tu contraseña."}
        except Exception as e:
            print(f"Error al solicitar restablecimiento de contraseña: {e}")
            # Mensaje genérico por seguridad
            return {"success": False, "message": "Error al procesar la solicitud."}

    async def update_user_password(self, access_token: str, refresh_token: str, new_password: str):
        """
        Actualiza la contraseña del usuario usando los tokens de restablecimiento.
        """
        try:
            # Establece la sesión del cliente de Supabase con los tokens recibidos
            self.client.auth.set_session(access_token, refresh_token)
            # Luego, actualiza la contraseña
            self.client.auth.update_user({"password": new_password})
            return {"success": True, "message": "Contraseña actualizada exitosamente."}
        except Exception as e:
            print(f"Error al actualizar la contraseña: {e}")
            return {"success": False, "message": "Error al procesar la actualización de la contraseña."}