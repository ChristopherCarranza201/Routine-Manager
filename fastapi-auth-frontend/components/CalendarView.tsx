"use client";

import * as React from "react";
import { Calendar, momentLocalizer, Views, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment-timezone";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import "@/styles/calendar.css";
import type { TaskDTO } from "@/types/task";
import TimeGrid from "react-big-calendar/lib/TimeGrid";
import type { DayLayoutFunction } from "react-big-calendar";

import { format, parse as dfParse, startOfWeek as dfStartOfWeek, getDay } from "date-fns"
import { es } from "date-fns/locale"
import { dateFnsLocalizer } from "react-big-calendar"
import { EventPopover } from "@/components/EventPopover";
import { EventDialog } from "@/components/EventDialog";




moment.updateLocale('en', { week: { dow: 1, doy: 4 } });
moment.updateLocale('es', { week: { dow: 1, doy: 4 } });
const locales = { es }

const localizer = dateFnsLocalizer({
    format,
    // importante: devolver Date, y tipar args para TS
    parse: (value: string, fmt: string) => dfParse(value, fmt, new Date(), { locale: es }),
    startOfWeek: (date: Date, _culture?: string) => dfStartOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales,
})

const DnDCalendar = withDragAndDrop(Calendar as any);

/** Paleta para asignar colores únicos cuando la tarea no trae color */
const PALETTE = [
    "#86E3FF",
    "#B28DFF",
    "#9DE8C1",
    "#FFD29D",
    "#FFB7C5",
    "#A0C4FF",
    "#C9F4AA",
    "#FECACA",
    "#C7D2FE",
    "#FDE68A",
    "#FBCFE8",
    "#FCD34D",
];

type CalendarEvent = {
    id: string;
    title: string;
    start: Date;
    end: Date;
    resource: TaskDTO;
    color?: string;
    description?: string   // ← nuevo
    notes?: string         // ← nuevo
};

type Patch = Partial<TaskDTO> & Partial<{ start_ts: string; end_ts: string }>;

type Props = {
    tasks: TaskDTO[];
    onUpdateTask: (id: string, data: Patch) => Promise<void> | void;
    onDeleteTask?: (id: string) => Promise<void> | void;
};


// INSERTAR (arriba junto a constantes)
const START_KEYS = [
    "start_ts",           // ⬅️ prioridad absoluta
    "start_ts_local",
    "start_ts_utc",
    "start_at_local",
    "start_at_utc",
    "start_at",
    "start",
    "scheduled_for_local",
    "scheduled_for_utc",
    "begin_at",
    "beginAt",
];

const END_KEYS = [
    "end_ts",             // ⬅️ prioridad absoluta
    "end_ts_local",
    "end_ts_utc",
    "end_at_local",
    "end_at_utc",
    "end_at",
    "end",
    "due_at",
    "dueAt",
    "finish_at",
    "finishAt",
];

// ── Pickers robustos que exploran cualquier key que contenga "start"/"end" ──
function pickDateSmart(obj: any, which: "start" | "end"): Date | null {
    if (!obj || typeof obj !== "object") return null;

    // 1) Prioriza nombres “conocidos”
    const prefer = which === "start"
        ? ["start_ts_local", "start_ts_utc", "start_at_local", "start_at_utc", "start_at", "start"]
        : ["end_ts_local", "end_ts_utc", "end_at_local", "end_at_utc", "end_at", "end", "due_at"];

    for (const k of prefer) {
        const v = obj[k];
        const d = tryParseDate(v);
        if (d) return d;
    }

    // 2) Búsqueda laxa: cualquier key que incluya "start" o "end"
    const keys = Object.keys(obj);
    const needle = which === "start" ? "start" : "end";
    const candidates = keys
        .filter(k => k.toLowerCase().includes(needle))
        // prioriza “local” > “utc” > el resto
        .sort((a, b) => scoreKey(b, needle) - scoreKey(a, needle));

    for (const k of candidates) {
        const d = tryParseDate(obj[k]);
        if (d) return d;
    }

    return null;
}

function scoreKey(k: string, needle: "start" | "end"): number {
    const s = k.toLowerCase();
    let score = 0;
    if (s.includes(needle)) score += 10;
    if (s.includes("local")) score += 5;
    if (s.includes("utc")) score += 3;
    if (s.endsWith("_at") || s.endsWith("at")) score += 2;
    return score;
}

function tryParseDate(v: any): Date | null {
    if (!v) return null;
    // ISO string
    if (typeof v === "string") {
        const d = new Date(v);
        return Number.isNaN(+d) ? null : d;
    }
    // epoch ms/seconds
    if (typeof v === "number") {
        const d = new Date(v > 9_999_999_999 ? v : v * 1000);
        return Number.isNaN(+d) ? null : d;
    }
    return null;
}


function parseDate(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}
function pickDate(obj: any, keys: string[]): Date | null {
    for (const k of keys) {
        const d = parseDate(obj?.[k]);
        if (d) return d;
    }
    return null;
}
/** hash estable para elegir color por id/título */
function hashStr(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (((h << 5) - h) + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}


/* =========================================================
   VIEW con COLUMNAS VIRTUALIZADAS (WindowedWeekView)
   - Construye el range con solo las columnas visibles (con buffer)
   - El calendario remonta cuando cambia la ventana (key)
   ========================================================= */


/* ---------- VISTA “week” extendida 2 años hacia adelante (robusta) ---------- */
const TWO_YEAR_DAYS = 60; // ~24 meses

// === Ventana compartida para VIRTUALIZAR columnas ===
// La actualiza CalendarView (efecto de scroll); el view la lee en su `range`.
const COL_BUFFER = 14; // margen lateral en días
const columnWindow = {
    start: 0,          // índice de la 1a columna visible (con buffer aplicado en el efecto)
    end: 0,            // índice de la última columna visible (buffer aplicado)
    anchorISO: "",     // ISO del domingo de ancla; si cambia, reseteamos ventana

};

// ============== NUEVO: WindowedWeekView (rango "cortado") ==============
function WindowedWeekView(props: any) {
    const {
        date,
        min: _min,
        max: _max,
        step: _step,
        timeslots: _timeslots,
        scrollToTime: _scrollToTime,
        showMultiDayTimes,
        selectable,
        ...rest
    } = props;

    const min = _min ?? moment(date).startOf("day").toDate();
    const max = _max ?? moment(date).endOf("day").toDate();
    const step = _step ?? 30;
    const timeslots = _timeslots ?? 2;
    const scrollToTime = _scrollToTime ?? moment(date).hour(8).toDate();

    const anchor = React.useMemo(() => moment(date).startOf("week"), [date]);
    // Si cambia el ancla, resetea ventana inicial con una "página" estable
    const PAGE = 14; // tamaño de página (días) para evitar remounts frecuentes
    const anchorISO = anchor.clone().toDate().toISOString().slice(0, 10);
    if (columnWindow.anchorISO !== anchorISO) {
        columnWindow.anchorISO = anchorISO;
        columnWindow.start = 0;
        columnWindow.end = PAGE - 1; // 14 días iniciales visibles
    }


    // Construye rango solo con [start..end] (ya trae buffer aplicado)
    const days = React.useMemo(() => {
        const out: Date[] = [];
        const s = Math.max(0, columnWindow.start);
        const e = Math.max(s, columnWindow.end);
        for (let i = s; i <= e; i++) out.push(anchor.clone().add(i, "day").toDate());
        return out;
    }, [anchorISO, columnWindow.start, columnWindow.end]);

    return (
        <TimeGrid
            {...rest}
            range={days}
            eventOffset={10}
            min={min}
            max={max}
            step={step}
            timeslots={timeslots}
            scrollToTime={scrollToTime}
            showMultiDayTimes={showMultiDayTimes}
            selectable={selectable}
        />
    );
}

// Requeridos por RBC:
(WindowedWeekView as any).navigate = (
    date: Date,
    action: "NEXT" | "PREV" | "TODAY"
) => {
    if (action === "TODAY") return new Date();
    const m = moment(date);
    return m.add(action === "NEXT" ? 1 : -1, "week").toDate();
};
(WindowedWeekView as any).title = (date: Date) => {
    const s = moment(date).startOf("isoWeek");
    const e = s.clone().add(6, "day");
    return s.format("MMM") === e.format("MMM")
        ? `${s.format("MMM DD")} – ${e.format("DD")}`
        : `${s.format("MMM DD")} – ${e.format("MMM DD")}`;
};
(WindowedWeekView as any).range = (date: Date) => {
    // RBC pide un "range" pero no se usa cuando pasamos TimeGrid con `range` propio;
    // devolvemos semana base para mantener compatibilidad.
    const s = moment(date).startOf("isoWeek");
    return Array.from({ length: 7 }, (_, i) => s.clone().add(i, "day").toDate());
};

/* =========================================
   SYNC HELPERS — una sola fuente de verdad
   ========================================= */

/** Lee slots/hora desde el DOM del gutter o cae a `step`. */
function getSlotsPerHour(gutter: HTMLElement | null, step: number): number {
    const firstGroup = gutter?.querySelector(".rbc-timeslot-group") as HTMLElement | null;
    if (firstGroup) {
        const n = firstGroup.querySelectorAll(".rbc-time-slot").length;
        if (n > 0) return n;
    }
    return Math.max(1, Math.round(60 / (step || 60)));
}

/** Calcula índice actual de slot, el siguiente slot y la hora del siguiente slot con el MISMO snap que usa la línea. */
function getSnapInfo(now: Date, slotsPerHour: number) {
    const minutesPerSlot = 60 / slotsPerHour;
    const curIndex = Math.floor(now.getMinutes() / minutesPerSlot);
    const nextIndex = (curIndex + 1) % slotsPerHour;
    const nextHour = (now.getHours() + (nextIndex === 0 ? 1 : 0)) % 24;

    // offset al centro del slot para la línea
    let offsetInHour: number;
    if (slotsPerHour === 2) {
        // snap 25% / 75%
        offsetInHour = curIndex === 0 ? 0.25 : 0.75;
    } else {
        offsetInHour = (curIndex + 0.5) / slotsPerHour;
    }

    return { minutesPerSlot, curIndex, nextIndex, nextHour, offsetInHour };
}

export function CalendarView({ tasks, onUpdateTask, onDeleteTask }: Props) {
    const [events, setEvents] = React.useState<CalendarEvent[]>([]);
    const [view, setView] = React.useState<View>(Views.WEEK);
    const [date, setDate] = React.useState<Date>(new Date());

    // ── Estado del diálogo de edición ──────────────────────────────
    const [active, setActive] = React.useState<any | null>(null);
    const [dialogOpen, setDialogOpen] = React.useState(false);

    // Normaliza el objeto del calendario a un TaskDTO mínimo para el dialog
    const toDTO = (t: any) => {
        const id = String(t?.id ?? t?.uuid ?? "");
        if (!id) return null;
        const status =
            t?.status === "in_progress" ? "doing" :
                t?.status === "done" ? "done" : "todo";

        // toma las fechas en el orden que usa tu backend
        const startIso =
            t?.start ?? t?.start_ts ?? t?.start_ts_local ?? t?.start_ts_utc ?? undefined;
        const endIso =
            t?.end ?? t?.end_ts ?? t?.end_ts_local ?? t?.end_ts_utc ?? undefined;

        return {
            id,
            title: t?.title ?? t?.name ?? "Untitled",
            description: t?.description ?? t?.notes ?? "",
            tag: String(t?.tag ?? "Other"),
            status,
            start: startIso,
            end: endIso,
            color: t?.color,
            notes: t?.notes ?? "",
            participants: t?.participants ?? [],
            recurrence_id: t?.recurrence_id ?? null,
        };
    };

    // ── Drag & Drop / Resize handlers ─────────────────────────────────────────────
    const sameMs = (a?: Date | null, b?: Date | null) =>
        !!a && !!b && +a === +b;

    const toIso = (d?: Date | null) =>
        d ? new Date(d).toISOString() : undefined;

    const handleEventDrop = React.useCallback(
        async ({ event, start, end }: { event: any; start: Date; end: Date }) => {
            try {
                // Evita PATCH si no cambió nada
                const oldStart = event?.start instanceof Date ? event.start : new Date(event?.start);
                const oldEnd = event?.end instanceof Date ? event.end : new Date(event?.end);

                if (sameMs(oldStart, start) && sameMs(oldEnd, end)) return;

                // Asegura un end válido (fallback +60min)
                const safeEnd = end ?? new Date(start.getTime() + 60 * 60 * 1000);

                await onUpdateTask?.(String(event.id), {
                    start_ts: toIso(start),
                    end_ts: toIso(safeEnd),
                });
            } catch (e) {
                console.error("[Calendar] handleEventDrop error", e);
            }
        },
        [onUpdateTask]
    );

    const handleEventResize = React.useCallback(
        async ({ event, start, end }: { event: any; start: Date; end: Date }) => {
            try {
                // Resize normalmente solo cambia end, pero manejamos ambos
                const safeEnd = end ?? new Date(start.getTime() + 60 * 60 * 1000);

                // Evita PATCH si no cambió nada
                const oldStart = event?.start instanceof Date ? event.start : new Date(event?.start);
                const oldEnd = event?.end instanceof Date ? event.end : new Date(event?.end);
                if (sameMs(oldStart, start) && sameMs(oldEnd, safeEnd)) return;

                await onUpdateTask?.(String(event.id), {
                    start_ts: toIso(start),
                    end_ts: toIso(safeEnd),
                });
            } catch (e) {
                console.error("[Calendar] handleEventResize error", e);
            }
        },
        [onUpdateTask]
    );


    // Al seleccionar un evento del calendario, abre el dialog
    // Al seleccionar un evento del calendario, abre el dialog CENTRADO (mismo estado que onClick)
    const handleSelectEvent = React.useCallback((ev: any) => {
        const raw = ev?.resource ?? ev;
        const dto = toDTO(raw);
        if (!dto) return;
        setActiveTask(dto);   // ← usa el estado correcto del EventDialog
        setEditOpen(true);    // ← abre el dialog centrado
        setPopOpen(false);    // ← cierra popover si estuviera abierto
    }, []);




    // Escucha "calendar:goto" para saltar a la fecha de una task recién creada
    React.useEffect(() => {
        const onGoto = (ev: Event) => {
            const iso = (ev as CustomEvent<string>).detail;
            if (!iso) return;
            const d = new Date(iso);
            if (!Number.isNaN(+d)) setDate(d);
        };
        window.addEventListener("calendar:goto", onGoto as EventListener);
        return () => window.removeEventListener("calendar:goto", onGoto as EventListener);
    }, []);


    // Remount controlado del Calendar al cambiar ventana de columnas
    const [calendarKey, setCalendarKey] = React.useState(0);

    const [step, setStep] = React.useState(30);
    const [timeslots, setTimeslots] = React.useState(2);

    const visIdx = React.useRef({ start: 0, end: 0 });   // índices visibles (con buffer)
    const [versionBump, setVersionBump] = React.useState(0); // fuerza memo al cambiar ventana

    const containerRef = React.useRef<HTMLDivElement>(null);
    // ——— NUEVO: flag para detectar navegación por botones (Prev/Today/Next)
    const navIntentRef = React.useRef<null | "PREV" | "TODAY" | "NEXT">(null);
    // Evita parpadeo: ocultamos eventos hasta que el layout esté listo

    /** Fondo/borde de eventos */
    const lighten = (hex: string, amount = 0.82) => {
        try {
            if (!hex || !hex.startsWith("#")) return "rgba(96,165,250,.20)";
            const num = parseInt(hex.slice(1), 16);
            const r = Math.min(255, Math.floor(((num >> 16) & 0xff) + 255 * amount));
            const g = Math.min(255, Math.floor(((num >> 8) & 0xff) + 255 * amount));
            const b = Math.min(255, Math.floor((num & 0xff) + 255 * amount));
            return `rgba(${r}, ${g}, ${b}, 0.9)`;
        } catch {
            return "rgba(96,165,250,.20)";
        }
    };
    // ... contexto (líneas arriba) ...
    const eventPropGetter = React.useCallback((event: CalendarEvent) => {
        const base = event.resource?.color || event.color || "#60A5FA";
        const soft = lighten(String(base));
        return {
            className: "rm-event",
            style: {
                background: soft,
                borderColor: base as string,
                color: "#111827",
                ["--ev" as any]: String(base),
                ["--ev-soft" as any]: String(soft),
            },
        };
    }, []);
    // —— NUEVO: memoria de la semana que ya emitimos y lectura de CSS vars
    const lastEmittedWeekStartRef = React.useRef<number | null>(null);

    const readCssVarPx = (el: Element | null, name: string, fallback: number) => {
        if (!el) return fallback;
        const v = getComputedStyle(el as Element).getPropertyValue(name).trim();
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : fallback;
    };
    // LUNES como inicio visual de semana (equivalente a isoWeek)
    const startOfWeekMon = (d: Date) => {
        const s = new Date(d);
        s.setHours(0, 0, 0, 0);
        // getDay(): 0=Dom,1=Lun,... → pasamos a 0=Lun,1=Mar,...
        const dowMon0 = (s.getDay() + 6) % 7;
        s.setDate(s.getDate() - dowMon0);
        return s;
    };


    // ⬇⬇⬇ NUEVO — filtra eventos a la ventana visible (solo en Week).
    const visibleEvents = React.useMemo(() => {
        if (view !== Views.WEEK) return events; // Day/Agenda: no virtualizamos columnas

        // ancla del range del RollingWeekView
        const anchor = startOfWeekMon(date);

        // índices visibles calculados por el efecto
        const { start, end } = visIdx.current;

        // convierte índice → fecha (00:00 del día)
        const idxToDate = (idx: number) => {
            const d = new Date(anchor);
            d.setDate(d.getDate() + idx);
            d.setHours(0, 0, 0, 0);
            return d;
        };

        const from = idxToDate(start);
        const to = idxToDate(end + 1); // exclusivo: hasta el inicio del día siguiente del end

        // un evento entra si [start,end) intersecta [from,to)
        return events.filter((ev) => {
            const s = ev.start.getTime();
            const e = ev.end.getTime();
            return e > from.getTime() && s < to.getTime();
        });
        // versionBump hace que se recalcule cuando cambia la ventana visible
    }, [events, view, date, versionBump, startOfWeekMon]);

    /** Sub-etiquetas (00/30) */
    React.useEffect(() => {
        const gutter = document.querySelector<HTMLElement>(".rbc-time-gutter");
        if (!gutter) return;
        const cleanup = () =>
            gutter.querySelectorAll(".rm-sub-label").forEach((el) => el.remove());
        if (step >= 60) {
            cleanup();
            document
                .querySelector(".calendar-container")
                ?.classList.remove("rm-gutter-enhanced");
            return;
        }
        document
            .querySelector(".calendar-container")
            ?.classList.add("rm-gutter-enhanced");
        cleanup();
        const groups = gutter.querySelectorAll<HTMLElement>(".rbc-timeslot-group");
        groups.forEach((group, hourIndex) => {
            const slots = group.querySelectorAll<HTMLElement>(".rbc-time-slot");
            if (!slots.length) return;
            const slotsPerHour = slots.length;
            const minutesPerSlot = Math.round(60 / Math.max(1, slotsPerHour));
            slots.forEach((_slot, i) => {
                const label = document.createElement("div");
                label.className = "rm-sub-label";
                const hh = String(hourIndex).padStart(2, "0");
                const mm = String(i * minutesPerSlot).padStart(2, "0");
                label.textContent = `${hh}:${mm}`;
                label.style.top = `${((i + 0.5) / slotsPerHour) * 100}%`;
                group.appendChild(label);
            });
        });
        return () => {
            cleanup();
            document
                .querySelector(".calendar-container")
                ?.classList.remove("rm-gutter-enhanced");
        };
    }, [step, view, date]);


    /* =========================================================
       SYNC — Mirror header <-> body (suave y sin lag)
       - Escoge el scroller real (.rbc-time-content)
       - Ajusta el ancho del row del header al grid
       - Espeja scrollLeft del body al header en el MISMO frame
       ========================================================= */
    React.useEffect(() => {
        if (view !== Views.DAY && view !== Views.WEEK) return;

        let raf = 0;

        const q = <T extends Element = HTMLElement>(sel: string) =>
            document.querySelector(sel) as T | null;

        const scroller = q<HTMLElement>(".rbc-time-content");
        const headerContent = q<HTMLElement>(".rbc-time-header-content");
        const headerGutter = q<HTMLElement>(".rbc-time-header-gutter");
        const bodyCols =
            q<HTMLElement>(".rbc-time-content > .rbc-time-columns") ||
            q<HTMLElement>(".rbc-time-columns");

        if (!scroller || !headerContent || !bodyCols) return;

        // Elegimos el último .rbc-row (donde viven los días)
        const pickHeaderRow = () => {
            const rows = Array.from(
                headerContent.querySelectorAll<HTMLElement>(".rbc-row")
            );
            return rows[rows.length - 1] || rows[0] || null;
        };

        const applyHeaderWidth = () => {
            const headerRow = pickHeaderRow();
            if (!headerRow) return;
            const gridW = bodyCols.scrollWidth;
            const gutterW = headerGutter
                ? Math.round(headerGutter.getBoundingClientRect().width)
                : 0;
            const width = Math.max(0, gridW - gutterW);
            headerRow.style.setProperty("width", `${width}px`, "important");
            headerRow.style.setProperty("min-width", `${width}px`, "important");
            // Habilita scroll interno del header para poder espejarlo pero ocultamos la barra con CSS.
            headerContent.style.setProperty("overflow-x", "auto", "important");
        };

        const paint = () => {
            raf = 0;
            // Espejo inmediato: desplaza el header exactamente lo mismo que el body
            headerContent.scrollLeft = scroller.scrollLeft;
        };

        const onScroll = () => {
            // rAF para frame-coalescing cuando arrastras rápido
            if (!raf) raf = requestAnimationFrame(paint);
        };

        const onResize = () => {
            applyHeaderWidth();
            if (!raf) raf = requestAnimationFrame(paint);
        };

        // Primera pasada (doble rAF tras hidratar RBC)
        requestAnimationFrame(() => {
            applyHeaderWidth();
            requestAnimationFrame(paint);
        });

        scroller.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onResize);

        // Si RBC re-renderiza el header (al navegar), re-aplica ancho y espejo
        const mo = new MutationObserver(() => {
            applyHeaderWidth();
            if (!raf) raf = requestAnimationFrame(paint);
        });
        mo.observe(headerContent, { childList: true, subtree: true });

        return () => {
            if (raf) cancelAnimationFrame(raf);
            scroller.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onResize);
            mo.disconnect();
        };
    }, [view, date]);



    /* =========================================================
       HARD-STOP SCROLL HORIZONTAL (body) — clamp al rango visible
       Se asegura de que el body no se “extienda” más que el header
       ========================================================= */
    React.useEffect(() => {
        if (view !== Views.WEEK) return;

        const root = document.querySelector(".calendar-container") as HTMLElement | null;
        const body = document.querySelector(".rbc-time-content") as HTMLElement | null;
        if (!root || !body) return;

        const readVar = (name: string, fallback: number) => {
            const v = getComputedStyle(root).getPropertyValue(name).trim();
            const n = parseFloat(v);
            return Number.isFinite(n) ? n : fallback;
        };

        // cohérente con tu layout
        const gutterW = readVar("--body-gutter-w", 80);
        const dayColW = readVar("--day-col", 140);

        // calcula el scroll máximo permitido con la ventana virtualizada actual
        const maxScrollLeft = () => {
            const colsVisible = Math.max(1, (window as any).columnWindow?.end - (window as any).columnWindow?.start + 1 || 14);
            const contentWidth = colsVisible * dayColW + gutterW;
            const max = Math.max(0, contentWidth - body.clientWidth);
            return max;
        };

        // CLAMP: si te sales del rango, te regresa al borde más cercano
        const clamp = () => {
            const max = maxScrollLeft();
            const current = body.scrollLeft;
            const clamped = Math.min(Math.max(current, 0), max);
            if (clamped !== current) body.scrollLeft = clamped;
        };

        // primera pasada (tras montar o remount por virtualización)
        // doble RAF para asegurarnos que medidas y estilos estén listos
        let raf = 0;
        const kick = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(clamp);
            });
        };
        kick();

        const onScroll = () => {
            // cada intento de salir del rango se corrige
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(clamp);
        };

        const onResize = () => kick();

        body.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onResize);

        return () => {
            cancelAnimationFrame(raf);
            body.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onResize);
        };
    }, [view, date, calendarKey]); // ← importante incluir calendarKey

    // —— NUEVO: al hacer scroll horizontal en WEEK, detecta 1ª columna visible y emite "calendar:date-updated" si cambia de semana
    React.useEffect(() => {
        if (view !== Views.WEEK) return;


        if (view !== Views.WEEK) {
            // en Day/Agenda no virtualizamos por columnas
            visIdx.current = { start: 0, end: 0 };
            setVersionBump(v => v + 1);
            return;
        }

        const root = document.querySelector(".calendar-container") as HTMLElement | null;
        const body = document.querySelector(".rbc-time-content") as HTMLElement | null;
        if (!root || !body) return;

        const readCssVarPx = (name: string, fallback: number) => {
            const v = getComputedStyle(root).getPropertyValue(name).trim();
            const n = parseFloat(v);
            return Number.isFinite(n) ? n : fallback;
        };

        // lee los anchos reales (ya los usas en otras partes)
        const gutterW = readCssVarPx("--body-gutter-w", 80);
        const dayColW = readCssVarPx("--day-col", 140);

        // tamaño del buffer lateral (en columnas) para evitar popping al deslizar
        const BUFFER = 7; // ±7 días alrededor de lo visible

        // anchorWeek: el RollingWeekView arma el rango desde el inicio de semana de "date"
        const anchor = startOfWeekMon(date);

        const computeLeftmostDate = () => {
            const left = body.scrollLeft; // incluye gutter
            const x = Math.max(0, left - gutterW);
            const dayIndex = Math.floor(x / Math.max(1, dayColW)); // 0,1,2...
            const d = new Date(anchor);
            d.setDate(anchor.getDate() + dayIndex);
            return d;
        };

        const maybeEmitIfWeekChanged = () => {
            const leftDate = computeLeftmostDate();
            const wStart = startOfWeekMon(leftDate).getTime();
            if (lastEmittedWeekStartRef.current === wStart) return;
            lastEmittedWeekStartRef.current = wStart;

            // Avisamos al Topbar para que actualice el label con Week NN, rango, etc.
            window.dispatchEvent(
                new CustomEvent("calendar:date-updated", { detail: { date: new Date(wStart) } })
            );
        };

        const computeWindow = () => {
            const left = body.scrollLeft;          // incluye gutter
            const width = body.clientWidth;        // viewport visible
            const x0 = Math.max(0, left - gutterW);
            const x1 = Math.max(0, left + width - gutterW);

            const col0 = Math.floor(x0 / Math.max(1, dayColW));
            const col1 = Math.floor(x1 / Math.max(1, dayColW));

            // aplica buffer
            visIdx.current = {
                start: Math.max(0, col0 - BUFFER),
                end: Math.max(col1 + BUFFER, col0 + BUFFER) // asegura end >= start
            };
            // dispara memo de eventos
            setVersionBump(v => v + 1);
        };
        let raf = 0;
        const kick = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                cancelAnimationFrame(raf);
                raf = requestAnimationFrame(computeWindow);
            });
        };
        kick();

        // al scrollear horizontalmente, recalcula (throttle por RAF)
        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(computeWindow);
        };

        // al redimensionar (cambia clientWidth/gaps)
        const onResize = () => kick();

        // run once
        maybeEmitIfWeekChanged();
        body.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);

        return () => {
            cancelAnimationFrame(raf);
            body.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [view, date, startOfWeekMon]);
    /* =========================================================
       SYNC — Mirror header <-> body (sin lag al avanzar/retroceder)
       ========================================================= */
    React.useEffect(() => {
        // Solo aplica en vistas con time-grid
        if (view !== Views.DAY && view !== Views.WEEK) return;

        let canceled = false;
        const cleanups: Array<() => void> = [];

        const q = <T extends Element = HTMLElement>(sel: string) =>
            document.querySelector(sel) as T | null;

        const scroller = q<HTMLElement>('.rbc-time-content') || q<HTMLElement>('.rbc-time-view');
        const headerContent = q<HTMLElement>('.rbc-time-header-content');
        if (!scroller || !headerContent) return;

        // Row “de días” (el que más .rbc-header tenga)
        const pickHeaderRow = () => {
            const rows = Array.from(headerContent.querySelectorAll<HTMLElement>('.rbc-row'));
            return rows.sort((a, b) =>
                b.querySelectorAll('.rbc-header').length - a.querySelectorAll('.rbc-header').length
            )[0] || null;
        };

        // Aplica ancho al row del header para que coincida con el grid del body
        const applyHeaderWidth = () => {
            const headerRow = pickHeaderRow();
            if (!headerRow) return;
            const headerGutter = q<HTMLElement>('.rbc-time-header-gutter');
            const bodyCols =
                q<HTMLElement>('.rbc-time-content > .rbc-time-columns') ||
                q<HTMLElement>('.rbc-time-columns');
            const gridW = (bodyCols || scroller).scrollWidth;
            const gutterW = headerGutter ? Math.round(headerGutter.getBoundingClientRect().width) : 0;
            const width = Math.max(0, gridW - gutterW);
            headerRow.style.setProperty('width', `${width}px`, 'important');
            headerRow.style.setProperty('min-width', `${width}px`, 'important');
            headerContent.style.setProperty('overflow', 'auto', 'important'); // habilita scroll nativo
            headerContent.style.setProperty('scrollbar-width', 'none', 'important'); // Firefox
            headerContent.classList.add('rm-hide-scrollbar'); // Chrome/Safari (CSS abajo)
        };

        // Espejo inmediato (sin rAF ni transform) — elimina el desfase incluso al retroceder
        const mirror = () => { headerContent.scrollLeft = scroller.scrollLeft; };

        // (Re)arma listeners tras navegación/render
        const arm = () => {
            applyHeaderWidth();
            // Limpia posibles listeners previos
            scroller.removeEventListener('scroll', mirror as any);
            // Espejo en el mismo frame del scroll
            scroller.addEventListener('scroll', mirror, { passive: true });
            cleanups.push(() => scroller.removeEventListener('scroll', mirror));
            // Sync inicial (doble rAF por si RBC refluye tras navegar)
            requestAnimationFrame(() => {
                headerContent.scrollLeft = scroller.scrollLeft;
                requestAnimationFrame(() => { headerContent.scrollLeft = scroller.scrollLeft; });
            });
        };

        arm();

        // Si RBC re-renderiza el header al navegar atrás/adelante, re-armamos
        const mo = new MutationObserver(() => arm());
        mo.observe(headerContent, { childList: true, subtree: true });
        cleanups.push(() => mo.disconnect());

        // También si cambia el ancho del scroller (sidebar, resize, etc.)
        const ro = new ResizeObserver(() => {
            applyHeaderWidth();
            headerContent.scrollLeft = scroller.scrollLeft;
        });
        ro.observe(scroller);
        cleanups.push(() => ro.disconnect());

        return () => {
            canceled = true;
            cleanups.forEach(fn => { try { fn(); } catch { } });
        };
    }, [view, date]);

    /* =========================================================
       SYNC 1/2 — Línea “ahora” y óvalo
       (robusta: remount + resize + H/V scroll + posición cuantizada por slot)
       ========================================================= */
    React.useEffect(() => {
        // Solo en vistas con time-grid (Day/Week)
        if (view !== Views.DAY && view !== Views.WEEK) return;

        let canceled = false;
        const cleanupFns: Array<() => void> = [];

        const waitFor = (sel: string) =>
            new Promise<HTMLElement>((resolve) => {
                const hit = document.querySelector<HTMLElement>(sel);
                if (hit) return resolve(hit);
                const obs = new MutationObserver(() => {
                    const el = document.querySelector<HTMLElement>(sel);
                    if (el) { obs.disconnect(); resolve(el); }
                });
                obs.observe(document.body, { childList: true, subtree: true });
                cleanupFns.push(() => obs.disconnect());
            });

        (async () => {
            const gutter = await waitFor(".rbc-time-gutter");
            const content = await waitFor(".rbc-time-content");

            // ——— Normaliza columnas: recorta última hora y neutraliza “pushers” por columna ———
            const normalizeColumns = () => {
                const cols = Array.from(
                    content.querySelectorAll<HTMLElement>(".rbc-time-columns .rbc-day-slot, .rbc-time-content .rbc-day-slot, .rbc-time-columns .rbc-time-column, .rbc-time-content .rbc-time-column")
                );
                if (!cols.length) return;

                const firstGroup = content.querySelector<HTMLElement>(".rbc-timeslot-group");
                if (!firstGroup) return;

                const slotsPerHour = firstGroup.querySelectorAll(".rbc-time-slot").length || 2;
                const hourH = firstGroup.getBoundingClientRect().height;
                const slotH = hourH / Math.max(1, slotsPerHour);
                const cut = Math.max(0, Math.round(hourH - slotH));

                cols.forEach(col => {
                    const groups = col.querySelectorAll<HTMLElement>(".rbc-timeslot-group");
                    if (!groups.length) return;
                    const last = groups[groups.length - 1];

                    // 1) Recorte exacto de la última hora (elimina “media hora” vacía)
                    last.style.minHeight = "100px";
                    last.style.height = "100px";
                    last.style.borderBottom = "4";

                    // 2) Neutraliza empujes que toquen/pasen el borde inferior
                    const lastBottom = last.getBoundingClientRect().bottom;
                    const pushers = Array.from(
                        col.querySelectorAll<HTMLElement>(".rbc-events-container, .rbc-event, [style*='bottom'], [style*='top']")
                    ).filter(n => n.getBoundingClientRect().bottom > lastBottom - 0.5);
                    // 4) Corrige stretching de columna y elimina placeholders ocultos
                    col.style.alignItems = "flex-start";
                    col.style.display = "block"; // evita stretch vertical por flexbox

                    // limpia cualquier body de DnD o placeholder fantasma
                    col.querySelectorAll(".rbc-addons-dnd-row-body, .rbc-addons-dnd-resizable")
                        .forEach(n => (n as HTMLElement).style.minHeight = "0px");

                    pushers.forEach(n => {
                        n.style.marginBottom = "0";
                        n.style.paddingBottom = "0";
                        const cs = getComputedStyle(n);
                        if (cs.position === "absolute" && cs.bottom !== "auto") n.style.bottom = "0";
                    });

                    // 3) Colapsa el último sub-slot por si quedara un borde residual
                    const ls = last.querySelector<HTMLElement>(".rbc-time-slot:last-child");
                    if (ls) {
                        ls.style.height = "0px";
                        ls.style.minHeight = "0px";
                        ls.style.border = "0";
                    }
                });
            };

            // 1ª pasada y re-aplicación en cambios de layout/render
            requestAnimationFrame(() => requestAnimationFrame(normalizeColumns));
            const roNormalize = new ResizeObserver(() => normalizeColumns());
            roNormalize.observe(content);
            cleanupFns.push(() => roNormalize.disconnect());


            if (canceled) return;

            // Color desde variable CSS con fallback
            const color =
                getComputedStyle(document.documentElement)
                    .getPropertyValue("--rm-now-line")
                    .trim() || "#ff9500";

            // --- Línea en GUTTER ---
            let gLine = gutter.querySelector<HTMLDivElement>(".rm-now-line.rm-gutter");
            if (!gLine) {
                gLine = document.createElement("div");
                gLine.className = "rm-now-line rm-gutter";
                gutter.appendChild(gLine);
            }
            Object.assign(gLine.style, {
                position: "absolute",
                left: "-150px",
                width: "100%",
                height: "0",
                borderTop: `3px dotted ${color}`,
                pointerEvents: "none",
                zIndex: "61",
            } as CSSStyleDeclaration);

            // --- Línea en BODY (vive en .rbc-time-content) ---
            let bLine = content.querySelector<HTMLDivElement>(".rm-now-line.rm-body");
            if (!bLine) {
                bLine = document.createElement("div");
                bLine.className = "rm-now-line rm-body";
                content.appendChild(bLine);
            }
            Object.assign(bLine.style, {
                position: "absolute",
                height: "0",
                borderTop: `3px dotted ${color}`,
                pointerEvents: "none",
                zIndex: "4",
                boxSizing: "border-box",
            } as CSSStyleDeclaration);

            // --- Punto/óvalo ---
            let cap = content.querySelector<HTMLDivElement>(".rm-now-cap");
            if (!cap) {
                cap = document.createElement("div");
                cap.className = "rm-now-cap";
                content.appendChild(cap);
            }
            Object.assign(cap.style, {
                position: "absolute",
                width: "",
                height: "",
                borderRadius: "9999px",
                background: color,
                pointerEvents: "none",
                zIndex: "4",
                transform: "translate(-50%, -50%)", // centra respecto a (left, top)
            } as CSSStyleDeclaration);

            // ======= Alturas y “cuantización” por timeslot =======
            const firstGroup2 = content.querySelector<HTMLElement>(".rbc-timeslot-group");
            const slotsPerHour2 =
                firstGroup2?.querySelectorAll(".rbc-time-slot").length || 2; // fallback: 2 (30 min)

            const hourH2 =
                firstGroup2?.getBoundingClientRect().height ??
                (() => {
                    const anySlot = content.querySelector<HTMLElement>(".rbc-time-slot");
                    const slotH2 = anySlot?.getBoundingClientRect().height ?? 24;
                    return slotH2 * slotsPerHour2;
                })();

            const stepMinutes = Math.round(60 / slotsPerHour2);

            const yForNowQuantized = () => {
                const now = new Date();
                const hour = now.getHours();
                const mins = now.getMinutes();

                const slotIdx = Math.min(
                    slotsPerHour2 - 1,
                    Math.floor(mins / stepMinutes)
                );

                const ratioWithinHour = (slotIdx + 0.5) / slotsPerHour2; // centro de slot
                return hour * hourH2 + ratioWithinHour * hourH2;
            };

            // ======= Anclaje horizontal (sin inflar el scrollWidth) =======
            const measure = () => {
                const gw = Math.round(gutter.getBoundingClientRect().width);
                const vw = content.clientWidth;        // ancho visible
                const sl = content.scrollLeft;         // scroll horizontal actual
                return { gw, vw, sl };
            };

            const placeHoriz = () => {
                const { gw, vw, sl } = measure();

                // Línea: left fijo + ancho visible, se desplaza con transform
                bLine.style.left = `${gw}px`;
                bLine.style.right = "";
                bLine.style.width = `${Math.max(0, vw - gw)}px`;
                bLine.style.transform = `translateX(${sl}px)`;
                bLine.style.willChange = "transform";

                // Cap: left fijo + translateX
                cap.style.left = `${gw}px`;
                cap.style.transform = `translate(${sl}px, -50%)`;
                cap.style.willChange = "transform";
            };

            // ======= Posición vertical usando cuantización =======
            const setTop = () => {
                const LINE_W = 3;                               // si usas 3px dotted
                const lineCenterFix = (LINE_W % 2) ? 0.5 : 0;   // microajuste para impares
                const y = yForNowQuantized();
                gLine.style.top = `${y}px`;
                bLine.style.top = `${y}px`;
                cap.style.top = `${y + lineCenterFix}px`;
            };

            // ======= Medición diferida para evitar cortes tras hidratar =======
            const placeHorizDeferred = () => {
                let tries = 0;
                const tick = () => {
                    const { gw, vw } = measure();
                    if (vw > gw + 16) { placeHoriz(); setTop(); return; }
                    if (tries++ < 40) requestAnimationFrame(tick);
                    else { placeHoriz(); setTop(); }
                };
                requestAnimationFrame(tick);
            };

            // Primera pasada
            placeHorizDeferred();

            // Observa cambios de tamaño del contenedor (expand/colapse sidebars, etc.)
            const ro = new ResizeObserver(() => { placeHoriz(); setTop(); });
            ro.observe(content);
            cleanupFns.push(() => ro.disconnect());

            // Scroll: vertical → Y; horizontal → reancla X y ancho
            const onScroll = () => { placeHoriz(); setTop(); };
            content.addEventListener("scroll", onScroll, { passive: true });
            cleanupFns.push(() => content.removeEventListener("scroll", onScroll));

            // Re-anchado también en resize de ventana
            const onResize = () => { placeHoriz(); setTop(); };
            window.addEventListener("resize", onResize);
            cleanupFns.push(() => window.removeEventListener("resize", onResize));

            // Recalcula por cambios de hora
            const t = window.setInterval(setTop, 15_000);
            cleanupFns.push(() => window.clearInterval(t));

            // Cuando fuentes/ventana están listas
            if ("fonts" in document) {
                (document as any).fonts?.ready?.then(() => { placeHoriz(); setTop(); });
            }
            const onLoad = () => { placeHoriz(); setTop(); };
            window.addEventListener("load", onLoad, { once: true });
            cleanupFns.push(() => window.removeEventListener("load", onLoad));
        })();

        return () => {
            canceled = true;
            cleanupFns.forEach(fn => { try { fn(); } catch { } });
        };
    }, [view, date, calendarKey]);


    /* =================================================================
       SYNC 2/2 — “Hora próxima” en el gutter con la MISMA lógica/snap
       ================================================================= */
    React.useEffect(() => {
        const container = document.querySelector(".calendar-container");
        const gutter = document.querySelector(".rbc-time-gutter") as HTMLElement | null;
        if (!container || !gutter) return;

        const clear = () => {
            gutter
                .querySelectorAll(".rbc-label.rm-next-hour, .rm-sub-label.rm-next-hour")
                .forEach((el) => el.classList.remove("rm-next-hour"));
        };

        const pad2 = (n: number) => String(n).padStart(2, "0");

        const highlightCurrentSlot = () => {
            clear();

            const enhanced = container.classList.contains("rm-gutter-enhanced");
            const now = new Date();

            // mismas fuentes que usa la línea “ahora”
            const slotsPerHour = getSlotsPerHour(gutter, step);
            const minutesPerSlot = 60 / slotsPerHour;
            const curHour = now.getHours();
            const curIndex = Math.floor(now.getMinutes() / minutesPerSlot);

            if (enhanced) {
                // Sub-labels: marcamos HH:MM del slot ACTUAL (p. ej. 22:30)
                const targetText = `${pad2(curHour)}:${pad2(Math.round(curIndex * minutesPerSlot))}`;
                const found = Array.from(
                    gutter.querySelectorAll<HTMLElement>(".rm-sub-label")
                ).find((el) => el.textContent?.trim() === targetText);
                found?.classList.add("rm-next-hour"); // reutilizamos la clase de color
                return;
            }

            // Labels nativas: marcamos la HORA actual (no hay sub-slots)
            const groups = Array.from(gutter.querySelectorAll<HTMLElement>(".rbc-timeslot-group"));
            const targetGroup = groups[curHour];
            const lbl = targetGroup?.querySelector<HTMLElement>(".rbc-label");
            lbl?.classList.add("rm-next-hour");
        };

        // primera vez
        highlightCurrentSlot();

        // misma cadencia que la línea
        const id = window.setInterval(highlightCurrentSlot, 15_000);
        window.addEventListener("resize", highlightCurrentSlot);

        return () => {
            window.clearInterval(id);
            window.removeEventListener("resize", highlightCurrentSlot);
            clear();
        };
    }, [view, date, step, timeslots]);

    /** Responsive inicial (sin cambios) */
    React.useEffect(() => {
        const apply = () => {
            const w = window.innerWidth;
            if (w < 640) {
                setView(Views.AGENDA);
                setStep(60);
            } else if (w < 1024) {
                setView(Views.DAY);
                setStep(30);
            } else {
                setView(Views.WEEK);
                setStep(30);
            }
        };
        apply();
        window.addEventListener("resize", apply);
        return () => window.removeEventListener("resize", apply);
    }, []);

    /** Conectar Topbar (sin cambios) */
    React.useEffect(() => {
        const onNavigate = (e: Event) => {
            const action = (e as CustomEvent).detail?.action as
                | "PREV"
                | "TODAY"
                | "NEXT"
                | undefined;
            if (!action) return;
            navIntentRef.current = action; // <<< NUEVO: recordamos que la navegación vino por botón
            setDate((prev) => {
                if (action === "TODAY") return new Date();
                const m = moment(prev);
                const unit = view === Views.DAY ? "day" : "week";

                return m
                    .add(action === "NEXT" ? 1 : -1, unit as moment.unitOfTime.DurationConstructor)
                    .toDate();
            });

        };
        const onSetView = (e: Event) => {
            const v = (e as CustomEvent).detail?.view as
                | "day"
                | "week"
                | "agenda"
                | undefined;
            if (!v) return;
            setView(v === "day" ? Views.DAY : v === "agenda" ? Views.AGENDA : Views.WEEK);
            window.dispatchEvent(
                new CustomEvent("calendar:view-updated", { detail: { view: v } }),
            );
        };
        window.addEventListener("calendar:navigate", onNavigate as EventListener);
        window.addEventListener("calendar:set-view", onSetView as EventListener);
        return () => {
            window.removeEventListener("calendar:navigate", onNavigate as EventListener);
            window.removeEventListener("calendar:set-view", onSetView as EventListener);
        };
    }, [view]);
    // ——— NUEVO: cuando la navegación viene de flechas, mostrar SIEMPRE la primera columna (inicio de semana)
    React.useEffect(() => {
        if (view !== Views.WEEK) return;
        if (!navIntentRef.current) return; // solo si la fecha vino de Prev/Today/Next

        const body = document.querySelector<HTMLElement>(".rbc-time-content");
        const head = document.querySelector<HTMLElement>(".rbc-time-header-content");
        if (!body || !head) {
            navIntentRef.current = null;
            return;
        }

        // Espera al re-draw de RBC para que las columnas existan y resetea el scroll
        requestAnimationFrame(() => {
            body.scrollLeft = 0;
            head.scrollLeft = 0;
            // limpia el flag hasta la siguiente navegación por botón
            navIntentRef.current = null;
        });
    }, [date, view]);


    // ✅ NUEVO: notificar al Topbar cuando cambie la fecha actual del calendario
    React.useEffect(() => {
        window.dispatchEvent(
            new CustomEvent("calendar:date-updated", { detail: { date } })
        );
    }, [date]);

    // ✅ AGENDA: garantiza que cada fila tenga su .rbc-agenda-date-cell
    React.useEffect(() => {
        if (view !== Views.AGENDA) return;

        const content = document.querySelector<HTMLElement>(
            ".rbc-agenda-view .rbc-agenda-content",
        );
        if (!content) return;

        const ensureDateCellPerRow = () => {
            const tables =
                content.querySelectorAll<HTMLTableElement>("table.rbc-agenda-table");
            tables.forEach((tbl) => {
                const body = tbl.tBodies?.[0] ?? tbl;
                let currentDateText = ""; // última fecha visible

                Array.from(body.querySelectorAll<HTMLTableRowElement>("tr")).forEach(
                    (tr) => {
                        // ¿Hay date-cell en esta fila?
                        const dateTd = tr.querySelector<HTMLTableCellElement>(
                            "td.rbc-agenda-date-cell",
                        );
                        if (dateTd) {
                            // normaliza (sin rowspan y con display de celda)
                            dateTd.setAttribute("rowspan", "1");
                            dateTd.style.display = "table-cell";
                            if (dateTd.textContent?.trim())
                                currentDateText = dateTd.innerHTML || dateTd.textContent!;
                            return; // esta fila ya tiene su celda de fecha
                        }

                        // Si NO hay date-cell, creamos una con el último texto conocido
                        const firstCell = tr.firstElementChild as Element | null;

                        const clone = document.createElement("td");
                        clone.className = "rbc-agenda-date-cell rm-split-clone";
                        clone.setAttribute("rowspan", "1");
                        clone.style.display = "table-cell";
                        clone.style.whiteSpace = "nowrap";
                        clone.innerHTML = currentDateText || ""; // puede quedar vacío si la primera fila no la tenía aún

                        tr.insertBefore(clone, firstCell); // la ponemos como columna 1 (Date)
                    },
                );
            });
        };

        // Observa cambios y reaplica el fix SIEMPRE
        const obs = new MutationObserver(() =>
            requestAnimationFrame(ensureDateCellPerRow),
        );
        obs.observe(content, { childList: true, subtree: true });

        // primera pasada
        requestAnimationFrame(ensureDateCellPerRow);

        return () => obs.disconnect();
    }, [view, date, events.length]);

    /** Avisar al Topbar cuando cambia la fecha por cualquier medio */
    const handleNavigate = (nextDate: Date) => {
        setDate(nextDate);
        window.dispatchEvent(
            new CustomEvent("calendar:date-updated", { detail: { date: nextDate } }),
        );
    };

    // >>> POP: estado y utilidades del popout (nuevo)
    type Participant = string | { name: string; avatar?: string };

    // reemplaza/ajusta tu estado POP existente por este bloque compacto
    const [popOpen, setPopOpen] = React.useState(false);
    const [editOpen, setEditOpen] = React.useState(false);
    const [activeTask, setActiveTask] = React.useState<any | null>(null);
    const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

    const [popEvt, setPopEvt] = React.useState<CalendarEvent | null>(null);
    const [popXY, setPopXY] = React.useState<{ left: number; top: number }>({ left: 0, top: 0 });
    const [popNotes, setPopNotes] = React.useState<string>("");

    const openPopover = (evt: CalendarEvent, anchorEl: HTMLElement | null) => {
        if (!containerRef.current || !anchorEl) {
            setPopEvt(evt); setPopOpen(true); return;
        }
        const contRect = containerRef.current.getBoundingClientRect();
        const rect = anchorEl.getBoundingClientRect();
        const left = Math.max(12, rect.left - contRect.left);
        const top = Math.max(12, rect.bottom - contRect.top + 8);
        setPopXY({ left, top });
        setPopNotes((evt.resource as any)?.description ?? "");
        setPopEvt(evt);
        setPopOpen(true);
    };
    // arriba en CalendarView.tsx
    const dayMin = React.useMemo(() => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);     // inicio del día
        return d;
    }, [date]);

    const dayMax = React.useMemo(() => {
        const d = new Date(date);
        d.setHours(23, 30, 59, 999); // fin del día real (evita el slot fantasma)
        return d;
    }, [date]);
    const closePopover = () => { setPopOpen(false); setPopEvt(null); };

    const applyColor = async (color: string) => {
        if (!popEvt) return;
        // actualiza local
        setEvents((prev) =>
            prev.map((e) => (e.id === popEvt.id ? { ...e, color, resource: { ...e.resource, color } } : e))
        );
        // opcional: persistir si lo soporta
        try { await onUpdateTask(popEvt.id, { color } as any); } catch { }
    };

    const Chip = ({ p }: { p: Participant }) => {
        const name = typeof p === "string" ? p : p.name;
        const avatar = typeof p === "string" ? undefined : p.avatar;
        const initials = name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
        return (
            <div className="rm-chip">
                {avatar ? <img src={avatar} alt={name} /> : <span>{initials}</span>}
                <em>{name}</em>
            </div>
        );
    };

    React.useEffect(() => {
        console.log("[CalendarView] tasks len:", tasks?.length, "first:", tasks?.[0]);
    }, [tasks]);


    // Mapear TaskDTO -> RBC events (y asignar color si falta)
    React.useEffect(() => {
        const mapped: CalendarEvent[] = tasks
            .map((t) => {
                const start = pickDate(t as any, START_KEYS);  // usa las listas de arriba
                let end = pickDate(t as any, END_KEYS);

                if (!start) return null;
                if (!end) {
                    end = new Date(start);
                    end.setMinutes(end.getMinutes() + 60); // fallback +60 min
                }


                const rawId = (t as any).id ?? (t as any).uuid ?? null;
                if (!rawId) return null; // sin id real, no renderizamos
                const id = String(rawId);

                const title = (t as any).title ?? (t as any).name ?? "Untitled";
                const color =
                    (t as any).color ||
                    PALETTE[hashStr(String(id + title)) % PALETTE.length];
                return { id, title, start, end, color, resource: { ...t, color } };
            })
            .filter(Boolean) as CalendarEvent[];

        setEvents(mapped);
    }, [tasks]);



    // <<< POP
    // Activa columnas fijas + scroll-x solo en Week
    React.useEffect(() => {
        const root = document.querySelector(".calendar-container");
        if (!root) return;

        if (view === Views.WEEK) root.classList.add("rm-fixed-cols");
        else root.classList.remove("rm-fixed-cols");

        return () => root.classList.remove("rm-fixed-cols");
    }, [view]);

    // Ancho igualitario para eventos traslapados (DAY/WEEK)
    const equalWidthLayout: DayLayoutFunction<any> = ({
        events,
        accessors,
        slotMetrics,
    }) => {
        // 1) Normaliza: rango visual de cada evento (top/height en %)
        const nodes = events.map((ev) => {
            const start = accessors.start(ev);
            const end = accessors.end(ev);
            const r = slotMetrics.getRange(start, end); // { top, height }
            return { ev, start, end, top: r.top, height: r.height };
        });

        // 2) Clusters por traslape temporal
        const clusters: typeof nodes[] = [];
        nodes
            .sort((a, b) => +a.start - +b.start)
            .forEach((n) => {
                const hit = clusters.find((c) =>
                    c.some((m) => !(n.end <= m.start || n.start >= m.end)),
                );
                (hit ? hit : clusters[clusters.length] = []).push(n);
            });

        // 3) Reparto en columnas dentro de cada cluster (mismo ancho)
        const out: { event: any; style: { top: number; height: number; width: number; xOffset: number } }[] = [];
        clusters.forEach((cluster) => {
            const cols: typeof cluster[] = [];
            cluster.forEach((n) => {
                const slot = cols.find((col) =>
                    col.every((m) => n.start >= m.end || n.end <= m.start),
                );
                (slot ?? (cols[cols.length] = [])).push(n);
            });

            const total = cols.length || 1;
            cols.forEach((col, colIdx) => {
                col.forEach((n) => {
                    out.push({
                        event: n.ev,
                        style: {
                            top: n.top,
                            height: n.height,
                            width: 100 / total,               // ⬅️ ancho igualitario
                            xOffset: (100 / total) * colIdx,  // ⬅️ desplazamiento horizontal
                        },
                    });
                });
            });
        });

        return out;
    };

    const sameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();


    return (
        <div ref={containerRef} className="h-full w-full overflow-hidden">
            <div className="calendar-container" style={{ height: "100%" }}>
                <DnDCalendar
                    key={calendarKey}  // 👈 remount al cambiar ventana de columnas
                    localizer={localizer}
                    culture="en"
                    events={visibleEvents}
                    onSelectEvent={handleSelectEvent}
                    onEventDrop={handleEventDrop}      // ← AÑADIDO
                    onEventResize={handleEventResize}  // ← AÑADIDO
                    startAccessor="start"
                    endAccessor="end"
                    view={view}
                    dayLayoutAlgorithm={
                        (view === Views.DAY || view === Views.WEEK)
                            ? equalWidthLayout          // función con la firma correcta
                            : undefined                 // en Agenda u otras vistas no aplica
                    }
                    onView={(v) => {
                        setView(v);
                        const simple =
                            v === Views.DAY ? "day" : v === Views.AGENDA ? "agenda" : "week";
                        window.dispatchEvent(
                            new CustomEvent("calendar:view-updated", { detail: { view: simple } }),
                        );
                    }}
                    date={date}
                    min={new Date(1970, 0, 1, 0, 0, 0)}
                    max={new Date(1970, 0, 1, 23, 30, 0)}
                    // step={30} timeslots={2}  // (si los usas, déjalos como están)
                    onNavigate={(d) =>
                        setDate((prev) => (sameDay(prev, d) ? prev : d))
                    }
                    views={{
                        day: true,
                        week: WindowedWeekView as any,  // 👈 “week” ahora es el view extendido a 2 años
                        agenda: true,
                    }}
                    step={step}
                    timeslots={timeslots}
                    resizable
                    draggableAccessor={() => true}
                    eventPropGetter={eventPropGetter}
                    components={{
                        /** ⬇️ Encabezado superior + body con wrap */
                        event: ({ event }: { event: CalendarEvent }) => {
                            const base = (event.resource?.color || event.color || "#60A5FA") as string;
                            const soft = lighten(String(base));
                            const start = new Intl.DateTimeFormat(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                            }).format(event.start);
                            const end = new Intl.DateTimeFormat(undefined, {
                                hour: "2-digit",
                                minute: "2-digit",
                            }).format(event.end);

                            // >>> POP: hook de click para abrir popover (nuevo)
                            const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
                                e.preventDefault();
                                e.stopPropagation();

                                // TaskDTO enriquecido para que el dialog tenga start/end/title/color
                                const t = {
                                    ...(event.resource as any),
                                    id: event.id,
                                    title: event.title,
                                    start: event.start.toISOString(),
                                    end: event.end.toISOString(),
                                };

                                setActiveTask(t);     // <- usa el estado que ya consume tu <EventDialog>
                                setEditOpen(true);    // <- muestra el dialog centrado (ya lo renderizas con editOpen)
                                setPopOpen(false);    // <- por si estaba abierto el popover
                            };

                            // <<< POP

                            return (
                                <div
                                    className="rm-event-inner rm-event-card"
                                    style={
                                        {
                                            ["--ev" as any]: base,
                                            ["--ev-soft" as any]: soft,
                                        } as React.CSSProperties
                                    }
                                    onClick={onClick} // >>> POP (nuevo)
                                >
                                    {/* Header pegado al borde superior (ocupa todo el ancho del evento) */}
                                    <div className="rm-event-head">
                                        {start} – {end}
                                    </div>

                                    {/* Body con wrap */}
                                    <div className="rm-event-title rm-wrap">{event.title}</div>

                                    {/* NUEVO: descripción (o notas) debajo del título, sin bold */}
                                    {(() => {
                                        const desc =
                                            (event.resource?.description ??
                                                event.description ??
                                                event.resource?.notes ??
                                                event.notes ??
                                                "") as string;

                                        return desc ? <div className="rm-event-desc rm-wrap">{desc}</div> : null;
                                    })()}
                                </div>
                            );

                        },
                    }}
                    popup
                    toolbar={false}
                    style={{ height: "100%" }}
                />

                {/* >>> POP: Backdrop + Popover (nuevo) */}
                {/* Popover conectado a API (PATCH/DELETE vía props onUpdateTask/onDeleteTask) */}
                {popOpen && activeTask && anchorRect && containerRef.current && (
                    <EventPopover
                        event={activeTask}
                        rect={anchorRect}
                        containerRect={containerRef.current.getBoundingClientRect()}
                        onClose={() => setPopOpen(false)}
                        onEdit={() => { setPopOpen(false); setEditOpen(true); }}
                        onDelete={async () => {
                            try {
                                await onDeleteTask?.(activeTask.id);
                            } finally {
                                setPopOpen(false);
                            }
                        }}
                        onUpdate={async (id, data) => {
                            await onUpdateTask(id, data);
                        }}
                    />
                )}

                {/* Dialog de edición rápida → PATCH */}
                {editOpen && activeTask && (
                    <EventDialog
                        event={activeTask}
                        open={editOpen}
                        onOpenChange={setEditOpen}
                        onSave={async (data: Partial<TaskDTO>) => {
                            await onUpdateTask(activeTask.id, data);
                        }}
                    />
                )}
                <div id="calendar-portal" />




                {/* <<< POP */}
            </div>
        </div>
    );
}
