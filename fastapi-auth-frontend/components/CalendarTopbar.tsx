"use client";

import * as React from "react";
import { Button } from "components/ui/button";
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";



type RbcView = "day" | "week" | "agenda";

function Topbar() {
  const [currentView, setCurrentView] = React.useState<RbcView>("week");
  const [displayDate, setDisplayDate] = React.useState<Date>(new Date());
  // ✅ Igual en SSR y primer render del cliente
  const [secondaryPinned, setSecondaryPinned] = React.useState<boolean>(false);

  React.useEffect(() => {
    const v = localStorage.getItem("secondarybar:pinned") === "true";
    setSecondaryPinned(v);
  }, []);

  React.useEffect(() => {
    const onDateUpdated = (e: Event) => {
      const d = (e as CustomEvent).detail?.date as Date | string | undefined;
      if (!d) return;
      setDisplayDate(new Date(d));
    };
    const onViewUpdated = (e: Event) => {
      const v = (e as CustomEvent).detail?.view as RbcView | undefined;
      if (v) setCurrentView(v);
    };
    window.addEventListener("calendar:date-updated", onDateUpdated as EventListener);
    window.addEventListener("calendar:view-updated", onViewUpdated as EventListener);
    return () => {
      window.removeEventListener("calendar:date-updated", onDateUpdated as EventListener);
      window.removeEventListener("calendar:view-updated", onViewUpdated as EventListener);
    };
  }, []);

  // sincr. con cambios externos del pin (por si colapsas con el handle)
  React.useEffect(() => {
    const sync = () => {
      const v = localStorage.getItem("secondarybar:pinned") === "true";
      setSecondaryPinned(v);
    };
    const id = setInterval(sync, 500);
    return () => clearInterval(id);
  }, []);

  const dispatchNav = (action: "PREV" | "TODAY" | "NEXT") => {
    window.dispatchEvent(new CustomEvent("calendar:navigate", { detail: { action } }));
  };

  // 👇 Enlace de los botones de vista:
  const setView = (view: RbcView) => {
    setCurrentView(view);
    window.dispatchEvent(new CustomEvent("calendar:set-view", { detail: { view } }));
  };

  const toggleSecondary = () => {
    window.dispatchEvent(new CustomEvent("secondarybar:toggle"));
    // actualización optimista del icono
    setSecondaryPinned((v) => !v);
  };

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" })
    .format(displayDate);

  // ===== NUEVO: helpers para "Week NN" y rango comprimido
  const startOfWeekMon = (d: Date) => {
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    // getDay(): 0=Dom,1=Lun,... → pasamos a base lunes (0=lun)
    const dowMon0 = (s.getDay() + 6) % 7;
    s.setDate(s.getDate() - dowMon0);
    return s;
  };
  const isoWeekNumber = (d: Date) => {
    // ISO (lunes a domingo): calculamos jueves de la semana ISO
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = (dt.getUTCDay() + 6) % 7;           // 0..6 (0=lunes)
    dt.setUTCDate(dt.getUTCDate() - day + 3);       // jueves
    const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
    const diff = dt.getTime() - firstThu.getTime();
    return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
  };
  const monthDay = (d: Date) =>
    new Intl.DateTimeFormat(undefined, { month: "long", day: "2-digit" }).format(d);

  const weekRangeLabel = (base: Date) => {
    const s = startOfWeekMon(base);
    const e = new Date(s); e.setDate(s.getDate() + 6);
    const w = isoWeekNumber(s);
    const mS = new Intl.DateTimeFormat(undefined, { month: "long" }).format(s);
    const mE = new Intl.DateTimeFormat(undefined, { month: "long" }).format(e);
    const sameMonth = mS === mE;

    const leftDay = String(s.getDate()).padStart(2, "0");
    const rightDay = String(e.getDate()).padStart(2, "0");

    const range = sameMonth
      ? `${mS} ${leftDay} – ${rightDay}`
      : `${monthDay(s)} – ${monthDay(e)}`;

    return range;
  };


  // ✅ Texto del centro: en DAY muestra SOLO el día; en WEEK/AGENDA muestra el rango
  const centerLabelText = React.useMemo(() => {
    if (currentView === "day") {
      return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "long",
        day: "2-digit",
        year: "numeric",
      }).format(displayDate);
    }
    // week / agenda
    return weekRangeLabel(displayDate);
  }, [currentView, displayDate]);
  return (
    <div className="w-full">
      {/* relative para poder centrar el label */}
      <div className="relative flex flex-wrap items-center justify-between gap-3 bg-[#F5F6F8] px-6 py-3">
        {/* IZQUIERDA: chip de mes + navegación */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-white px-3 py-2 text-2x1 font-medium text-gray-700 shadow-sm">
            {monthLabel}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="text 2x1" aria-label="Previous" onClick={() => dispatchNav("PREV")}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="text-2x1" onClick={() => dispatchNav("TODAY")}>Today</Button>
            <Button variant="outline" className="text-2x1" aria-label="Next" onClick={() => dispatchNav("NEXT")}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* CENTRO: NUEVO label sincronizado con RBC (no bloquea clics) */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block"
          aria-live="polite"
        >
          <span className="inline-flex items-center rounded-none bg-transparent px-4 py-1 text-base font-medium text-gray-700 border-0 shadow-none">
            {centerLabelText}
          </span>
        </div>

        {/* DERECHA: botones de vista + toggle secondary */}
        <div className="flex items-center gap-2">
          <Button variant="outline" aria-pressed={currentView === "day"} onClick={() => setView("day")}>Day</Button>
          <Button variant="outline" aria-pressed={currentView === "week"} onClick={() => setView("week")}>Week</Button>
          <Button variant="outline" aria-pressed={currentView === "agenda"} onClick={() => setView("agenda")}>Agenda</Button>

        </div>
      </div>
    </div>
  );
}

export default Topbar;
export { Topbar };
