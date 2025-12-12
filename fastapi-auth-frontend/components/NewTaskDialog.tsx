"use client";

import * as React from "react";
import { createTask, Task } from "@/lib/api";

type NewTaskDialogProps = {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onCreated?: (t: Task) => void; // para refrescar listas
    Trigger?: React.ReactNode;     // si prefieres pasar tu propio trigger
};

export default function NewTaskDialog({
    open,
    onOpenChange,
    onCreated,
    Trigger,
}: NewTaskDialogProps) {
    const [title, setTitle] = React.useState("");
    const [description, setDescription] = React.useState("");
    const [start, setStart] = React.useState<string>(() =>
        new Date().toISOString().slice(0, 16)
    );
    const [end, setEnd] = React.useState<string>("");
    const [tag, setTag] = React.useState<
        "Job" | "Education" | "Workout" | "Home" | "Other"
    >("Other");
    const [status, setStatus] = React.useState<
        "pending" | "in_progress" | "done"
    >("pending");
    const [priority, setPriority] = React.useState<
        "low" | "medium" | "high" | "urgent"
    >("low");
    const [loading, setLoading] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setLoading(true);
        try {
            const tz =
                Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Tijuana";

            const task = await createTask({
                title,
                description,
                tag,
                status,
                priority,
                tz,
                // tu backend ocupa estas llaves:
                start_ts: start ? new Date(start).toISOString() : undefined,
                end_ts: end ? new Date(end).toISOString() : undefined,
            });
            // >>>  console.debug("[POST /tasks] result:", task);

            // 1) siempre pide recarga real
            window.dispatchEvent(new Event("tasks:reload"));

            // 2) navega a la fecha creada usando backend o, si viene vacío, el form
            const createdStartIso =
                (task as any)?.start_ts_local ||
                (task as any)?.start_ts_utc ||
                (start ? new Date(start).toISOString() : undefined);

            if (createdStartIso) {
                window.dispatchEvent(new CustomEvent("calendar:goto", { detail: createdStartIso }));
            }

            // 3) append optimista SOLO si el server devolvió id real
            const serverId = task?.id ?? task?.uuid ?? null;
            if (serverId) {
                const startIso =
                    task?.start_ts_local ||
                    task?.start_ts_utc ||
                    (start ? new Date(start).toISOString() : undefined);

                const endIso =
                    task?.end_ts_local ||
                    task?.end_ts_utc ||
                    (end ? new Date(end).toISOString() : undefined);

                window.dispatchEvent(
                    new CustomEvent("tasks:append", {
                        detail: {
                            id: String(serverId),
                            title: task?.title ?? title,
                            description: task?.description ?? description ?? "",
                            tag: task?.tag ?? tag,
                            status: "todo",
                            start: startIso,
                            end: endIso,
                            color: task?.color,
                            notes: task?.notes ?? description ?? "",
                            participants: [],
                            recurrence_id: null,
                        },
                    })
                );
            }


            // Limpieza y cierre
            onCreated?.(task);
            setTitle("");
            setDescription("");
            setEnd("");
            setTag("Other");
            setStatus("pending");
            setPriority("low");
            onOpenChange(false);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            {Trigger && <span onClick={() => onOpenChange(true)}>{Trigger}</span>}

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => onOpenChange(false)}
                    />
                    <div className="relative z-10 w-full max-w-lg rounded-2xl border bg-background p-4 shadow-xl">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-semibold">Nueva Task</h2>
                            <button
                                className="px-2 py-1 rounded hover:bg-muted"
                                onClick={() => onOpenChange(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="grid gap-3">
                            <input
                                className="px-3 py-2 rounded border bg-background"
                                placeholder="Título"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                            <textarea
                                className="px-3 py-2 rounded border bg-background"
                                placeholder="Descripción (opcional)"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />

                            <div className="grid md:grid-cols-2 gap-3">
                                <label className="grid gap-1">
                                    <span className="text-xs opacity-70">Inicio (local)</span>
                                    <input
                                        type="datetime-local"
                                        className="px-3 py-2 rounded border bg-background"
                                        value={start}
                                        onChange={(e) => setStart(e.target.value)}
                                    />
                                </label>
                                <label className="grid gap-1">
                                    <span className="text-xs opacity-70">
                                        Fin (local, opcional)
                                    </span>
                                    <input
                                        type="datetime-local"
                                        className="px-3 py-2 rounded border bg-background"
                                        value={end}
                                        onChange={(e) => setEnd(e.target.value)}
                                    />
                                </label>
                            </div>

                            <div className="grid md:grid-cols-3 gap-3">
                                <select
                                    className="px-3 py-2 rounded border bg-background"
                                    value={tag}
                                    onChange={(e) => setTag(e.target.value as any)}
                                >
                                    {["Job", "Education", "Workout", "Home", "Other"].map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    className="px-3 py-2 rounded border bg-background"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value as any)}
                                >
                                    {["pending", "in_progress", "done"].map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    className="px-3 py-2 rounded border bg-background"
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value as any)}
                                >
                                    {["low", "medium", "high", "urgent"].map((v) => (
                                        <option key={v} value={v}>
                                            {v}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {err && <div className="text-sm text-red-500">{err}</div>}

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded border"
                                    onClick={() => onOpenChange(false)}
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="px-4 py-2 rounded-2xl border shadow disabled:opacity-50"
                                    disabled={loading}
                                >
                                    {loading ? "Creando..." : "Crear Task"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
