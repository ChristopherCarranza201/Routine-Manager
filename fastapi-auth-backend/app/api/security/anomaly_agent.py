import os
import openai
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer

load_dotenv()

# Inicializar el cliente de OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")

# Inicializar el cliente de Supabase usando la clave de rol de servicio
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Asegurar que las variables de entorno están cargadas
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Las variables de entorno SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son necesarias.")

supabase_client: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)

# Definir el esquema de seguridad OAuth2
# Esto espera el token de acceso en el encabezado de autorización
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Función para obtener la ubicación geográfica de una dirección IP
async def get_location_from_ip(ip_address: str):
    """
    Obtiene una ubicación de forma genérica para una dirección IP.
    Maneja la dirección de loopback (localhost) de forma explícita.
    """
    if ip_address == "127.0.0.1" or ip_address == "::1":
        return "Localhost"
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"http://ip-api.com/json/{ip_address}", timeout=5)
            data = response.json()
            if data['status'] == 'success':
                return f"{data['city']}, {data['country']}"
            else:
                return "Ubicación desconocida"
        except (httpx.RequestError, KeyError):
            return "Ubicación desconocida"

def analyze_login_attempt_with_openai(prompt):
    try:
        print("DEBUG AGENT: Llamando a la API de OpenAI con el siguiente prompt:")
        print(prompt)
        
        client = openai.OpenAI()
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=50,
            temperature=0.1
        )
        decision = response.choices[0].message.content.strip().upper()
        return decision
    except Exception as e:
        print(f"DEBUG AGENT: Error al llamar a la API de OpenAI: {e}")
        return "CONTINUAR"

async def process_registration(supabase_service, email: str, password: str, ip_address: str):
    """
    Registra un usuario y guarda su ubicación de registro.
    """
    print("DEBUG AGENT: Iniciando el proceso de registro del usuario...")
    try:
        response = supabase_service.auth.sign_up({"email": email, "password": password})
        if not response.user:
            return None

        user_id = response.user.id
        registration_location = await get_location_from_ip(ip_address)
        
        supabase_service.table("profiles").insert({
            "id": user_id, 
            "registration_location": registration_location
        }).execute()

        print(f"DEBUG AGENT: Usuario {email} registrado y ubicación guardada como: {registration_location}")
        return response.user
    except Exception as e:
        print(f"DEBUG AGENT: Error al procesar el registro: {e}")
        return None

def process_login_attempt(supabase_service, user_id: str, ip_address: str, user_agent: str):
    print("DEBUG AGENT: Procesando intento de inicio de sesión...")
    
    print("DEBUG AGENT: Buscando historial para el análisis...")
    response = supabase_service.table("login_history").select("*").eq("user_id", user_id).order("timestamp", desc=True).limit(5).execute()
    login_history = response.data
    
    print("DEBUG AGENT: Registrando intento de inicio de sesión...")
    supabase_service.table("login_history").insert({
        "user_id": user_id,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }).execute()
    print("DEBUG AGENT: Registro exitoso.")
    
    if len(login_history) < 3:
        print("DEBUG AGENT: Menos de 3 intentos. Retornando 'CONTINUAR' por defecto.")
        return "CONTINUAR"

    last_login_time_str = login_history[0]['timestamp']
    last_login_time = datetime.fromisoformat(last_login_time_str)
    current_time = datetime.now(timezone.utc)
    cooldown_period = timedelta(minutes=5)

    if (current_time - last_login_time) < cooldown_period:
        print("DEBUG AGENT: Intento de inicio de sesión muy rápido. Rechazando por cooldown.")
        return "RECHAZAR"

    try:
        profile_response = supabase_service.table("profiles").select("registration_location").eq("id", user_id).single().execute()
        registration_location = profile_response.data["registration_location"]
    except Exception as e:
        print(f"DEBUG AGENT: Error al obtener el perfil de usuario: {e}")
        print("DEBUG AGENT: Perfil no encontrado. Asumiendo ubicación desconocida.")
        registration_location = "Ubicación desconocida"

    history_str = "\n".join([
        f"Hora: {h['timestamp']}, País: {h.get('country', 'Desconocido')}" for h in login_history
    ])

    prompt = (
        f"Historial de inicio de sesión del usuario {user_id}:\n"
        f"{history_str}\n\n"
        f"Ubicación de registro del usuario: {registration_location}\n"
        f"Nuevo intento de inicio de sesión:\n"
        f"País: {ip_address}, User-Agent: {user_agent}\n"
        f"Basándote en el historial, la ubicación de registro y la nueva ubicación, ¿este nuevo intento es anómalo? Un intento anómalo es un inicio de sesión desde una ubicación muy lejana a la de registro o si los intentos son muy rápidos, ocurriendo en un periodo de menos de 5 a 10 minutos después del último. "
        f"Responde solo con 'RECHAZAR' o 'CONTINUAR'."
    )
    
    decision = analyze_login_attempt_with_openai(prompt)
    
    return decision