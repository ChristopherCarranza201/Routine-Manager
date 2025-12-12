# 📘 Routine Manager

Routine Manager es una aplicación web diseñada para la **gestión
estructurada de tareas y rutinas**, con un **backend en FastAPI**, un
**frontend en Next.js construido mediante V0**, y una infraestructura de
datos apoyada en **Supabase**.\
El sistema permite la creación, actualización, gestión dinámica de
fechas, y notificaciones automatizadas para tareas próximas mediante un
webhook conectado al **WhatsApp Cloud API (Meta)**.


---

## 🚀 Tecnologías Principales
![Python](https://img.shields.io/badge/Python-3.9+-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-teal?logo=fastapi)
![Next.js](https://img.shields.io/badge/Next.js-Frontend-black?logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-Auth-green?logo=supabase)
![OpenAI](https://img.shields.io/badge/OpenAI-Agent-lightgrey?logo=openai)

---

## 🧩 Módulo Previo: Autenticación con Supabase y Detección de Anomalías con OpenAI

Este módulo fue parte de la primera fase del proyecto. Incluía:

### 1. 🔑 Autenticación Segura
Flujos completos de registro, inicio de sesión y recuperación de contraseña.

### 2. 🕵️‍♂️ Detección de Anomalías
El agente analiza cada inicio de sesión considerando:
- Historial del usuario
- Ubicación
- Comportamientos inusuales (ej. accesos desde ubicaciones desconocidas)

### 3. 🔄 Restablecimiento de Contraseña
Flujo seguro mediante **correo electrónico transaccional**.

**Aunque este módulo permanece dentro del repositorio, actualmente no
forma parte del alcance principal del Routine Manager**, ya que el foco
está en el gestor de tareas y sistema de notificaciones.

------------------------------------------------------------------------


## 🗄️ Relación con Supabase

| Función                  | Descripción                                                                 |
|---------------------------|-----------------------------------------------------------------------------|
| 👤 Gestión de Usuarios    | Creación de cuentas, almacenamiento seguro de contraseñas, emisión de tokens |
| 🗂️ Base de Datos          | Registro de historial de inicios de sesión para detección de anomalías, creación, actualización y eliminación de rutinas        |
| ✉️ Correos Automáticos    | Confirmación de registro y restablecimiento de contraseña                     |
| Sincronización de estados | Cambios visuales de la UI reflejan modificaciones en Supabase (fechas / horas)
---

## ⚙️ Tutorial de Configuración y Pruebas

### 1️⃣ Preparación del Entorno
Crea un archivo `.env` en `fastapi-auth-backend/`:

```env
# Credenciales de Supabase
SUPABASE_URL="[tu_url_de_supabase]"
SUPABASE_KEY="[tu_clave_de_supabase]"
SUPABASE_SERVICE_ROLE_KEY="[tu_clave_de_rol_de_servicio_de_supabase]"

# Clave de OpenAI para el agente de anomalías
OPENAI_API_KEY="[tu_clave_de_api_de_openai]"
```

---

### 2️⃣ Limpieza del Historial de Sesiones (Opcional)

> ⚠️ **Nota**: Esto es opcional, pero recomendable para probar la detección de anomalías desde cero.  

1. Ve a tu proyecto de **Supabase** en el navegador.  
2. En el menú lateral, selecciona **SQL Editor**.  
3. Ejecuta la siguiente consulta para encontrar el `user_id` de tu usuario:  

```sql
SELECT id FROM auth.users WHERE email = 'tu_correo@ejemplo.com';
```

4. Copia el `id` resultante.  
5. Elimina el historial de inicio de sesión de ese usuario:  

```sql
DELETE FROM public.login_history WHERE user_id = 'el_id_de_tu_usuario';
```

---

## ▶️ Cómo Ejecutar la Aplicación

> 💡 **Notas Importantes**
> - El backend y el frontend deben iniciarse **por separado**.  
> - Asegúrate de que tu archivo `.env` esté correctamente configurado antes de ejecutar.
> - Instalación previa de UV. DOCS: https://docs.astral.sh/uv/getting-started/installation/#standalone-installer

### 🟢 Backend (FastAPI) con **UV**

### 1. Instalar UV

Windows:

``` powershell
irm https://astral.sh/uv/install.ps1 | iex
```
Linux / macOS:

``` bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 2. Crear entorno e instalar dependencias

``` bash
cd backend/
uv venv
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate     # Windows
```

### 3. Ejecutar backend FastAPI

``` bash
uvicorn main:app --reload
```


👉 Disponible en: `http://localhost:8000`

---

### ⚫ Iniciar el Frontend (Next.js)

```bash
cd fastapi-auth-frontend/
npm install
npm run dev
```

👉 Disponible en: `http://localhost:3000`

---

## 📬 Contacto
Si tienes dudas o sugerencias, ¡puedes abrir un issue o contribuir con un PR! 🚀
"# Routine-Manager" 
