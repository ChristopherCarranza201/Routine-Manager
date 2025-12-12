"use client";

import { useEffect, useState } from "react";
import Sidebar from "components/Sidebar";
import GlobalTopbar from "components/GlobalTopbar";
import "@/styles/primarybar.css";

export function PageShell({ children }: { children: React.ReactNode }) {
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const saved =
      typeof window !== "undefined" &&
      localStorage.getItem("secondarybar:pinned") === "true";
    setPinned(!!saved);
    document.documentElement.dataset.secondaryPinned = String(!!saved);
  }, []);

  const setPinnedState = (next: boolean) => {
    setPinned(next);
    document.documentElement.dataset.secondaryPinned = String(next);
    try {
      localStorage.setItem("secondarybar:pinned", String(next));
    } catch { }
  };

  // 🔗 Control centralizado (Topbar y Panel disparan estos eventos)
  useEffect(() => {
    const onPin = () => setPinnedState(true);
    const onUnpin = () => setPinnedState(false);
    const onToggle = () => setPinnedState(!pinned);

    window.addEventListener("secondarybar:pin", onPin as EventListener);
    window.addEventListener("secondarybar:unpin", onUnpin as EventListener);
    window.addEventListener("secondarybar:toggle", onToggle as EventListener);
    return () => {
      window.removeEventListener("secondarybar:pin", onPin as EventListener);
      window.removeEventListener("secondarybar:unpin", onUnpin as EventListener);
      window.removeEventListener("secondarybar:toggle", onToggle as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned]);

  return (
    <>
      {/* Rail (primary) */}
      <Sidebar variant="rail" />

      {/* Overlay (secondary) */}
      <div
        className="pb-overlay"
        tabIndex={-1}
        style={{
          left: "var(--pb-rail)",
          transform: pinned ? "translateX(0)" : undefined,
          pointerEvents: pinned ? "auto" : undefined,
        }}
        // 👇 Al hacer hover, se fija (queda pinned=true y se persiste)
        onMouseEnter={() => setPinnedState(true)}
      >

        <div className="pb-overlay-inner">
          <Sidebar
            variant="panel"
            onPin={() => setPinnedState(true)}
            onUnpin={() => setPinnedState(false)}
          />
        </div>
      </div>

      {/* ❌ Se elimina el handle flotante que aparecía a mitad del borde derecho */}

      {/* Contenido */}
      <div className="pb-content min-h-screen flex flex-col">
        <div style={{ position: "sticky", top: 0, zIndex: 2001 }}>
          <GlobalTopbar />
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </>
  );
}
