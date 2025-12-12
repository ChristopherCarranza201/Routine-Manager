"use client";
import * as React from "react";
import { createTask } from "lib/api"; // usa el cliente real, NO mocks

type Form = {
    title: string;
    description?: string;
    tag?: "Job" | "Education" | "Workout" | "Home" | "Other";
    status?: "pending" | "in_progress" | "done"; // mapea a tu backend
    start: string; // datetime-local
    end?: string;  // datetime-local
    tz?: string;   // p.ej. "America/Tijuana"
    priority?: "low" | "medium" | "high" | "urgent";
};

export default function CreateTaskDev() {
    const [f, setF] = React.useState<Form>({
        title: "Prueba desde frontend",
        description: "Creada desde /dev/create-task",
        tag: "Other",
        status: "pending",
        start: new Date().toISOString().slice(0, 16),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Tijuana",
        priority: "low",
    });
    const [res, setRes] = React.useState<any>(null);
    const [err, setErr] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setErr(null);
        setRes(null);
        try {
            const payload = await createTask({
                title: f.title,
                description: f.description || "",
                tag: f.tag || "Other",
                status: f.status || "pending",
                start: new Date(f.start),
                end: f.end ? new Date(f.end) : undefined,
                tz: f.tz,
                priority: f.priority || "low",
            } as any); // `lib/api.ts` ya hace el mapeo a *_ts_local + tz
            setRes(payload);
        } catch (e: any) {
            setErr(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="p-6 max-w-2xl space-y-6">
            <h1 className="text-2xl font-semibold">Test: Crear Task (API real)</h1>
            <form onSubmit={onSubmit} className="grid gap-4 p-4 rounded-2xl border">
                <input className="px-3 py-2 rounded border" value={f.title}
                    onChange={e => setF(s => ({ ...s, title: e.target.value }))} placeholder="Título" required />
                <textarea className="px-3 py-2 rounded border" value={f.description || ""}
                    onChange={e => setF(s => ({ ...s, description: e.target.value }))} placeholder="Descripción (opcional)" />
                <div className="grid md:grid-cols-2 gap-4">
                    <label className="grid gap-2">
                        <span className="text-sm">Inicio (local)</span>
                        <input type="datetime-local" className="px-3 py-2 rounded border" value={f.start}
                            onChange={e => setF(s => ({ ...s, start: e.target.value }))} required />
                    </label>
                    <label className="grid gap-2">
                        <span className="text-sm">Fin (local, opcional)</span>
                        <input type="datetime-local" className="px-3 py-2 rounded border" value={f.end || ""}
                            onChange={e => setF(s => ({ ...s, end: e.target.value || undefined }))} />
                    </label>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                    <select className="px-3 py-2 rounded border" value={f.tag}
                        onChange={e => setF(s => ({ ...s, tag: e.target.value as any }))}>
                        {["Job", "Education", "Workout", "Home", "Other"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select className="px-3 py-2 rounded border" value={f.status}
                        onChange={e => setF(s => ({ ...s, status: e.target.value as any }))}>
                        {["pending", "in_progress", "done"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select className="px-3 py-2 rounded border" value={f.priority}
                        onChange={e => setF(s => ({ ...s, priority: e.target.value as any }))}>
                        {["low", "medium", "high", "urgent"].map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>
                <input className="px-3 py-2 rounded border" value={f.tz}
                    onChange={e => setF(s => ({ ...s, tz: e.target.value }))} placeholder="America/Tijuana" />
                <button disabled={loading} className="px-4 py-2 rounded-2xl border shadow">
                    {loading ? "Enviando..." : "Crear Task"}
                </button>
            </form>
            {err && <div className="p-4 rounded-2xl border border-red-500/50"><pre>{err}</pre></div>}
            {res && <pre className="p-4 rounded-2xl border overflow-auto text-sm">{JSON.stringify(res, null, 2)}</pre>}
        </div>
    );
}
