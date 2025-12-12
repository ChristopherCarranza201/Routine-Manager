// auth-api.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_BASE, authHeaders } from "@/lib/api";

/**
 * AUTH_BASE = raíz del backend SIN el sufijo /api
 * - Si API_BASE = http://localhost:8000/api  -> AUTH_BASE = http://localhost:8000
 * - Si API_BASE = http://localhost:8000      -> AUTH_BASE = http://localhost:8000
 */
export const AUTH_BASE = API_BASE.replace(/\/api\/?$/, "");

/* ───────────────── Persistencia de sesión (igual patrón de antes) ───────────────── */

const AUTH_TOKEN_KEY = "rm_access_token";

/** Lee el token guardado localmente (backend JWT) */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Guarda token y emite evento */
function setStoredToken(token: string) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch { }
  try {
    window.dispatchEvent(new Event("auth:login"));
  } catch { }
}

/** Limpia token y emite evento */
function clearStoredToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch { }
  try {
    window.dispatchEvent(new Event("auth:logout"));
  } catch { }
}

/** Combina el Authorization de Supabase (si existe) + token propio guardado */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const base = await authHeaders(); // puede traer Authorization: Bearer <supabase_jwt>
  const own = getStoredToken();
  // Si ya hay Authorization en 'base', lo respetamos; si NO, usamos el propio
  if (!base.Authorization && own) {
    return { ...base, Authorization: `Bearer ${own}` };
  }
  return base;
}

/* ───────────────── Helpers HTTP ───────────────── */

async function jsonPost<T = any>(url: string, body: any): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || res.statusText}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

async function formPost<T = any>(url: string, form: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    ...(await getAuthHeaders()),
  };
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(form).toString(),
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || res.statusText}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

async function jsonGet<T = any>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await getAuthHeaders()),
  };
  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || res.statusText}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/* ───────────────── Tipos ───────────────── */

export type LoginResponse = {
  access_token: string;
  token_type: "bearer";
  user?: any;
};

export type RegisterResponse = { message: string };
export type ForgotResponse = { message: string };
export type ResetResponse = { message: string };

/* ───────────────── Endpoints AUTH (sin /api) ───────────────── */

export async function login(body: { email: string; password: string }) {
  // FastAPI OAuth2PasswordRequestForm: username, password, y suele aceptar estos campos:
  const res = await formPost<LoginResponse>(`${AUTH_BASE}/auth/login`, {
    username: body.email,
    password: body.password,
    grant_type: "password", // <- clave en varios setups
    scope: "",              // <- vacío por defecto
    client_id: "",          // <- si tu server no los usa, mándalos vacíos
    client_secret: "",
  });
  if (res?.access_token) setStoredToken(res.access_token);
  return res;
}

export async function logout() {
  // Si tu backend no requiere body, dejamos {}
  try {
    await jsonPost(`${AUTH_BASE}/auth/logout`, {});
  } finally {
    clearStoredToken();
  }
  return { ok: true };
}

export async function register(body: { email: string; password: string }) {
  return jsonPost<RegisterResponse>(`${AUTH_BASE}/auth/register`, body);
}

export async function forgotPassword(email: string) {
  return jsonPost<ForgotResponse>(`${AUTH_BASE}/auth/forgot-password`, { email });
}

export async function resetPassword(params: {
  access_token: string;
  refresh_token: string;
  new_password: string;
}) {
  return jsonPost<ResetResponse>(`${AUTH_BASE}/auth/reset-password`, params);
}

export async function whoAmI() {
  // En tu FastAPI el "me" está en /users/me
  return jsonGet(`${AUTH_BASE}/users/me`);
}

/* ───────────────── Utils opcionales para la UI ───────────────── */

/** Devuelve true si hay sesión (token propio o supabase) */
export async function isAuthenticated(): Promise<boolean> {
  const base = await authHeaders();
  const own = getStoredToken();
  return Boolean(base.Authorization || own);
}

/** Exponer helpers por si algún componente quiere tocar la sesión directamente */
export const session = {
  getToken: getStoredToken,
  clear: clearStoredToken,
};

// Compat layer para componentes que importan `authApi`:
export const authApi = {
  login,
  logout,
  register,
  forgotPassword,
  resetPassword,
  whoAmI,
  isAuthenticated,
  session,
  AUTH_BASE,
};

// Export default por si algún lugar hace `import authApi from ...`
export default authApi;

