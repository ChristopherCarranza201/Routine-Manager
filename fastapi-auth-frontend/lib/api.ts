// lib/api.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./supabaseClient";

/** Detecta la base del backend:
 * - NEXT_PUBLIC_API_URL (preferida)
 * - NEXT_PUBLIC_API_BASE_URL (compat)
 * - fallback http://localhost:8000
 */
export const baseUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
).replace(/\/$/, "");

// al final de lib/api.ts (o junto a tus exports)

export const API_BASE = baseUrl;

export async function authHeaders(): Promise<Record<string, string>> {
    // usa tu sesión de Supabase para construir Authorization
    try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
        return {};
    }
}


/** Obtiene el JWT de Supabase (si hay sesión) */
async function getSupabaseToken(): Promise<string | undefined> {
    try {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    } catch {
        return undefined;
    }
}

/** Convierte un Date a "YYYY-MM-DDTHH:mm:ss" usando HORA LOCAL (sin zona) */
function toLocalIsoNoTZ(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
        d.getFullYear() +
        "-" +
        pad(d.getMonth() + 1) +
        "-" +
        pad(d.getDate()) +
        "T" +
        pad(d.getHours()) +
        ":" +
        pad(d.getMinutes()) +
        ":" +
        pad(d.getSeconds())
    );
}

/** Envoltura de fetch para JSON con manejo de errores y JWT de Supabase */
async function jsonFetch<T = any>(
    path: string,
    opts: RequestInit & { expectJson?: boolean } = {}
): Promise<T> {
    const token = await getSupabaseToken();

    const url =
        path.startsWith("http://") || path.startsWith("https://")
            ? path
            : `${baseUrl}/${path.replace(/^\/+/, "")}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(opts.headers as Record<string, string>),
    };

    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body,
        credentials: "include",
    });

    const isJson =
        (opts.expectJson ?? true) &&
        (res.headers.get("content-type") || "").includes("application/json");

    if (!res.ok) {
        let detail = `${res.status} ${res.statusText}`;
        if (isJson) {
            try {
                const j = await res.json();
                detail = j?.detail ?? j?.message ?? detail;
            } catch { }
        } else {
            try {
                detail = await res.text();
            } catch { }
        }
        throw new Error(`HTTP ${res.status} – ${detail}`);
    }

    if (!isJson) return (undefined as unknown) as T;

    try {
        return (await res.json()) as T;
    } catch {
        // Sin cuerpo o no-JSON
        return (undefined as unknown) as T;
    }
}

/** Intenta una lista de rutas y retorna el primer JSON 2xx */
async function jsonGetFirstOk(paths: string[]): Promise<any> {
    let lastErr: any = null;
    for (const p of paths) {
        try {
            const out = await jsonFetch(p, { method: "GET" });
            return out;
        } catch (e: any) {
            lastErr = e;
            // continuamos probando
        }
    }
    throw lastErr ?? new Error("Todas las rutas fallaron");
}

/* ==========================
   WHOAMI (detección flexible)
   ========================== */

export async function whoAmI(): Promise<any> {
    // Ajusta el orden si sabes el path exacto en tu backend
    return jsonGetFirstOk([
        "/whoami",
        "/api/whoami",
        "/auth/whoami",
        "/users/me",
    ]);
}

/* ============
   TASKS (CRUD)
   ============ */

export type TaskStatus = "pending" | "in_progress" | "done";
export type TaskTag = "Job" | "Education" | "Workout" | "Home" | "Other";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type CreateTaskInput = {
    title: string;
    description?: string;
    tag?: TaskTag;
    status?: TaskStatus;
    start?: Date; // hora local del usuario
    end?: Date;   // hora local del usuario
    tz?: string;  // p.ej. "America/Tijuana"
    priority?: TaskPriority;
    minutes_before?: number; // recordatorio opcional
};

export type UpdateTaskInput = Partial<CreateTaskInput>;

export type Task = {
    id: string;
    title: string;
    description?: string;
    tag?: TaskTag;
    status: TaskStatus;
    priority?: TaskPriority;
    start_ts_utc?: string;
    end_ts_utc?: string;
    start_ts_local?: string;
    end_ts_local?: string;
    tz?: string;
    created_at?: string;
    updated_at?: string;
    [k: string]: any;
};

/** Mapea Create/Update → payload esperado por backend.
 *  Acepta PARCIAL. Solo incluye campos definidos.
 *  Para fechas, envía *_ts_local + tz para que el backend convierta a UTC.
 */
function toTaskPayload(input: Partial<CreateTaskInput>): Record<string, any> {
    const payload: Record<string, any> = {};

    if (typeof input.title === "string") payload.title = input.title;
    if (typeof input.description === "string") payload.description = input.description;
    if (typeof input.tag === "string") payload.tag = input.tag;
    if (typeof input.status === "string") payload.status = input.status;
    if (typeof input.priority === "string") payload.priority = input.priority;

    if (input.start instanceof Date) {
        payload.start_ts_local = toLocalIsoNoTZ(input.start);
    }
    if (input.end instanceof Date) {
        payload.end_ts_local = toLocalIsoNoTZ(input.end);
    }
    if (typeof input.tz === "string") payload.tz = input.tz;

    if (typeof input.minutes_before === "number") {
        payload.minutes_before = input.minutes_before;
    }

    return payload;
}

/** POST /tasks */
// Añade estos helpers cerca de jsonFetch/jsonGetFirstOk:

async function postFirstOk(paths: string[], bodyObj: any): Promise<any> {
    let lastErr: any = null;
    const body = JSON.stringify(bodyObj);
    for (const p of paths) {
        try {
            const out = await jsonFetch(p, { method: "POST", body });
            return out;
        } catch (e: any) {
            lastErr = e; // seguimos probando
        }
    }
    throw lastErr ?? new Error("Todas las rutas POST fallaron");
}

async function getFirstOk(paths: string[]): Promise<any> {
    return jsonGetFirstOk(paths);
}

// Define este arreglo de rutas candidatas UNA sola vez (arriba de las funcs):
const TASKS_CANDIDATES = [
    "/tasks",         // más común
    "/api/tasks",     // con prefijo /api
    "/v1/tasks",      // versiónada
    "/task",          // singular (por si tu backend lo usa)
    "/api/task",
];

// --- CREATE ---
export async function createTask(input: any) {
    const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(input),
        credentials: "include",
    });
    if (!res.ok) throw new Error(`createTask HTTP ${res.status}`);
    try { return await res.json(); } catch { return null; } // tolera 201 sin body
}



// --- LIST ---
export async function listTasks(params?: { limit?: number }) {
    const url = `${API_BASE}/tasks${params?.limit ? `?limit=${params.limit}` : ""}`;
    const res = await fetch(url, {
        headers: await authHeaders(),
        credentials: "include",
    });
    if (!res.ok) throw new Error(`listTasks HTTP ${res.status}`);
    const json = await res.json().catch(() => null);
    console.log("[api.ts] listTasks JSON →", json); // LOG visible
    return json; // devolvemos crudo; el dashboard normaliza (items/data/array)
}

// --- UPDATE ---
// Asegura nombres tal como tu backend espera (start_ts / end_ts)
export async function updateTask(
    id: string,
    patch: Partial<{
        title: string;
        description: string;
        tag: string;
        status: "pending" | "in_progress" | "done";
        priority: "low" | "medium" | "high" | "urgent";
        color: string;
        start_ts: string;
        end_ts: string;
    }>
) {
    const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            ...(await authHeaders()),
        },
        body: JSON.stringify(patch),
        credentials: "include",
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`updateTask HTTP ${res.status} – ${txt || res.statusText}`);
    }

    // Tu backend podría regresar 200 con body o 204 sin body; tolera ambos
    try {
        const json = await res.json();
        console.log("[api.ts] updateTask JSON →", json);
        return json;
    } catch {
        console.log("[api.ts] updateTask → no body (204/empty)");
        return null;
    }
}


// --- DELETE ---
export async function deleteTask(id: string): Promise<{ ok: true }> {
    await jsonFetch(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    return { ok: true };
}


/* ======================
   UTILIDAD PARA PING API
   ====================== */

/** GET / (o /health) para ping rápido */
export async function ping(): Promise<any> {
    return jsonGetFirstOk(["/", "/health", "/api/health"]);
}
