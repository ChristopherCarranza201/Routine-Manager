// app/dashboard/page.tsx
"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import { PageShell } from "@/components/PageShell";
import CalendarTopbar from "@/components/CalendarTopbar";
import CalendarWidget from "@/components/CalendarWidget";
import { useToast } from "@/hooks/use-toast";

// API real (backend)
import {
    listTasks as apiListTasks,
    updateTask as apiUpdateTask,
    deleteTask as apiDeleteTask,
    type Task as BackendTask,
    type TaskTag as BackendTaskTag,
} from "@/lib/api";

// Tipo de la vista (lo que espera CalendarView / EventPopover)
import type { TaskDTO } from "@/types/task";

// CalendarView como named export y sin SSR (igual a tu versión vieja)
const CalendarView = dynamic(
    () => import("@/components/CalendarView").then((m) => m.CalendarView),
    { ssr: false }
);

// ─────────────────────────────────────────────────────────────
// Normaliza la forma del response sin pelear con TS
function extractItems(res: any): any[] {
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.items)) return res.items;
    if (Array.isArray(res?.data)) return res.data;
    return [];
}

export default function DashboardPage() {
    const { toast } = useToast();
    const [tasks, setTasks] = React.useState<TaskDTO[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [mounted, setMounted] = React.useState(false);

    // Overrides locales por id: { [taskId]: { color?: string, ... } }
    const [overrides, setOverrides] = React.useState<Record<string, Partial<TaskDTO>>>({});
    const overridesRef = React.useRef(overrides);
    React.useEffect(() => {
        overridesRef.current = overrides;
    }, [overrides]);

    React.useEffect(() => setMounted(true), []);
    React.useEffect(() => {
        if (mounted) void loadTasks();
    }, [mounted]);

    // 🔔 Escuchar reload desde NewTaskDialog (o cualquier parte del app)
    React.useEffect(() => {
        const onReload = () => {
            void loadTasks();
        };
        window.addEventListener("tasks:reload", onReload as EventListener);
        return () => window.removeEventListener("tasks:reload", onReload as EventListener);
    }, []);

    async function loadTasks() {
        try {
            const res = await apiListTasks({ limit: 200 });
            const items = extractItems(res);
            console.debug("[listTasks] items:", items.length, items[0]);
            console.log(
                "[dashboard] items length:",
                items.length,
                "first keys:",
                items[0] ? Object.keys(items[0]) : null
            );
            // ← fusiona con overrides (p.ej., color) antes de pintar
            setTasks(mergeOverrides(items as any, overridesRef.current));
        } catch (e) {
            console.error("[dashboard] listTasks error", e);
            toast({
                title: "Aviso",
                description: "No se pudieron cargar tareas del API.",
                variant: "default",
            });
            // En error, conserva lo que haya aplicando overrides actuales
            setTasks((prev) => mergeOverrides(prev as any, overridesRef.current));
        } finally {
            setLoading(false);
        }
    }

    /** ⚡ (Opcional) Pintado optimista inmediato por append */
    React.useEffect(() => {
        const onAppend = (ev: Event) => {
            const detail = (ev as CustomEvent<TaskDTO>).detail;
            if (!detail) return;
            setTasks((prev) => [detail, ...prev]);
        };
        window.addEventListener("tasks:append", onAppend as EventListener);
        return () => window.removeEventListener("tasks:append", onAppend as EventListener);
    }, []);

    /**
     * PATCH desde popover/dialog del calendario.
     * CalendarView envía Partial<TaskDTO>. Lo mandamos directo al backend.
     * Añadimos optimismo y merge con overrides (p. ej. color).
     */
    async function handleUpdateTask(id: string, patch: any) {
        // 1) Optimismo: actualiza la UI al instante (sin esperar al backend)
        setTasks((prev) => (prev ?? []).map((t: any) => (t?.id === id ? { ...t, ...patch } : t)));

        // 1.1) Si viene color, guarda override local para que no se pierda tras el GET
        if (typeof patch?.color !== "undefined") {
            setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), color: patch.color } }));
        }

        try {
            // 2) Lanza PATCH con los mismos campos que usamos en el optimismo
            await apiUpdateTask(id, patch);
        } catch (e) {
            console.error("[dashboard] updateTask error", e);
            // (opcional) revertir → relistar
        } finally {
            // 3) Re-list asegura consistencia final con el backend y reinyecta overrides más recientes
            try {
                const res = await apiListTasks({ limit: 200 });
                const items = extractItems(res);
                console.debug("[dashboard] reload items:", items.length, items[0]);
                setTasks(mergeOverrides(items as any, overridesRef.current));
            } catch (e) {
                console.error("[dashboard] reload error", e);
            }
        }
    }

    /**
     * DELETE desde popover/dialog.
     */
    async function handleDeleteTask(id: string) {
        await apiDeleteTask(id);
        const res = await apiListTasks({ limit: 200 });
        const items = extractItems(res);
        console.log(
            "[dashboard] items length:",
            items.length,
            "first keys:",
            items[0] ? Object.keys(items[0]) : null
        );
        setTasks(mergeOverrides(items as any, overridesRef.current));
    }

    if (!mounted) {
        return (
            <PageShell>
                <div className="h-full" />
            </PageShell>
        );
    }

    if (loading) {
        return (
            <PageShell>
                <div className="flex h-full items-center justify-center text-muted-foreground">
                    Loading…
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell>
            <div className="flex h-full">
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Topbar del calendario visible como antes */}
                    <div className="px1 py3">
                        <CalendarTopbar />
                    </div>

                    {/* Mantén el offset que usabas (ajústalo a tu gusto) */}
                    <CalendarWidget topbarOffset={130}>
                        <CalendarView
                            tasks={tasks}
                            onUpdateTask={handleUpdateTask}
                            onDeleteTask={handleDeleteTask}
                        />
                    </CalendarWidget>
                </div>
            </div>
        </PageShell>
    );
}

/* ───────────────────── Helpers de mapeo ───────────────────── */

/** Backend Task[] -> TaskDTO[] (lo que dibuja CalendarView/EventPopover) */
function mapBackendListToDTO(list: any[]): TaskDTO[] {
    return list.map(mapBackendToDTO).filter(Boolean) as TaskDTO[];
}

function mergeOverrides(items: any[], ov: Record<string, Partial<TaskDTO>>) {
    if (!items?.length) return items ?? [];
    return items.map((t: any) => {
        const o = ov[t.id];
        return o ? { ...t, ...o } : t;
    });
}

function mapBackendToDTO(t: any): TaskDTO | null {
    // ID (obligatorio)
    const rawId = t?.id ?? t?.uuid ?? null;
    if (!rawId) return null;
    const id = String(rawId);

    // Título / descripción
    const title = t?.title ?? t?.name ?? "Untitled";
    const description = t?.description ?? t?.notes ?? "";

    // FECHAS — toma las llaves TAL CUAL del backend
    const startIso =
        t?.start_ts ??
        t?.start_ts_local ??
        t?.start_ts_utc ??
        t?.start ??
        t?.start_at ??
        null;

    const endIso =
        t?.end_ts ??
        t?.end_ts_local ??
        t?.end_ts_utc ??
        t?.end ??
        t?.end_at ??
        t?.due_at ??
        null;

    // Tag / Status
    const tag = t?.tag ?? "Other";
    const uiStatus: "todo" | "doing" | "done" =
        t?.status === "in_progress" ? "doing" : t?.status === "done" ? "done" : "todo";

    return {
        id,
        title,
        description: description ?? "",
        tag: String(tag),
        status: uiStatus,
        start: startIso ?? undefined, // ⬅️ CalendarView usa estas
        end: endIso ?? undefined,     // ⬅️ y aplica fallback +60min si falta
        color: t?.color ?? undefined,
        participants: t?.participants ?? [],
        notes: t?.notes ?? description ?? "",
        recurrence_id: t?.recurrence_id ?? null,
    };
}

function mapBackendStatusToUI(s: string | undefined): "todo" | "doing" | "done" {
    if (s === "in_progress") return "doing";
    if (s === "done") return "done";
    return "todo"; // pending u otro → todo
}

/** Patch desde la UI (TaskDTO parcial) → Patch para backend (Task parcial) */
function mapDTOPatchToBackend(p: Partial<TaskDTO>): Record<string, any> {
    const out: Record<string, any> = {};

    if (typeof p.title === "string") out.title = p.title;
    if (typeof p.description === "string") out.description = p.description;
    if (typeof p.notes === "string") out.notes = p.notes;
    if (typeof p.color === "string") out.color = p.color;

    // status UI → backend
    if (typeof p.status === "string") {
        out.status = p.status === "doing" ? "in_progress" : p.status === "done" ? "done" : "pending";
    }

    // tag: valida contra el enum del backend si es posible
    if (typeof p.tag === "string") {
        const allowed: BackendTaskTag[] = ["Job", "Education", "Workout", "Home", "Other"];
        if (allowed.includes(p.tag as BackendTaskTag)) out.tag = p.tag;
    }

    // fechas: si vienen ISO de la UI, las pasamos como *_ts_local + tz
    if (typeof p.start === "string") {
        const d = new Date(p.start);
        if (!Number.isNaN(+d)) out.start_ts_local = toLocalIsoNoTZ(d);
    }
    if (typeof p.end === "string") {
        const d = new Date(p.end);
        if (!Number.isNaN(+d)) out.end_ts_local = toLocalIsoNoTZ(d);
    }
    // out.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Tijuana";

    return out;
}

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

function startOfWeekLocal(d: Date) {
    const day = d.getDay(); // 0=Sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunes
    const res = new Date(d);
    res.setDate(diff);
    res.setHours(0, 0, 0, 0);
    return res;
}

function cryptoRandomId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return Math.random().toString(36).slice(2);
}

/** Mocks visibles para probar la UI sin DB (por si falla el API) */
function generateSampleTasks(): TaskDTO[] {
    const base = startOfWeekLocal(new Date());
    const mk = (
        dayOffset: number,
        startH: number,
        endH: number,
        title: string,
        color: string,
        notes?: string
    ): TaskDTO => {
        const s = new Date(base);
        s.setDate(s.getDate() + dayOffset);
        s.setHours(startH, 0, 0, 0);
        const e = new Date(base);
        e.setDate(e.getDate() + dayOffset);
        e.setHours(endH, 0, 0, 0);
        return {
            id: cryptoRandomId(),
            title,
            description: notes,
            tag: "general",
            status: "todo",
            start: s.toISOString(),
            end: e.toISOString(),
            color,
            participants: [
                { id: "u1", name: "Caroline" },
                { id: "u2", name: "Angeline" },
                { id: "u3", name: "Andy" },
            ],
            notes,
            recurrence_id: null,
        };
    };
    return [
        mk(0, 8, 10, "Moodboarding – Showtime", "#F5B0FF", "Explorar referencias UI."),
        mk(1, 8, 10, "Wireframe – Altafluent Project", "#86E3FF", "Flujos principales del dashboard."),
        mk(3, 7, 10, "Exploration Design – Odama Shot", "#C5A3FF"),
        mk(4, 10, 12, "Feedback – Affluent Projects", "#FFD29D"),
        mk(5, 11, 13, "Wireframe – RTGO", "#9DE8C1"),
    ];
}
