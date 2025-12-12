"use client";

import * as React from "react";
import styles from "@/styles/CalendarWidget.module.css";

/**
 * Contenedor del calendario:
 * - Mantiene scroll interno del calendario.
 * - Expone un PORTAL interno (id="calendar-portal") para overlays/popovers
 *   que NO se salgan del viewport del widget.
 */
export default function CalendarWidget({
    children,
    topbarOffset = 112,
    viewportMode = "dynamic",
    lockPageScroll = true,
}: {
    children: React.ReactNode;
    topbarOffset?: number;
    viewportMode?: "vh" | "dvh" | "svh" | "lvh" | "dynamic";
    lockPageScroll?: boolean;
}) {
    // Scroll-lock del documento (opcional)
    React.useEffect(() => {
        if (!lockPageScroll) return;
        const body = document.body;
        const html = document.documentElement;
        const prevBodyOverflow = body.style.overflow;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyPaddingRight = body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - html.clientWidth;
        if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
        body.style.overflow = "hidden";
        html.style.overflow = "hidden";
        return () => {
            body.style.overflow = prevBodyOverflow;
            html.style.overflow = prevHtmlOverflow;
            body.style.paddingRight = prevBodyPaddingRight;
        };
    }, [lockPageScroll]);

    // viewport dinámico (corrige iOS/Android)
    React.useEffect(() => {
        if (viewportMode !== "dynamic") return;
        const root = document.documentElement;
        const setVH = () => {
            const vv: any = (globalThis as any).visualViewport;
            const vh = vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0);
            if (vh) root.style.setProperty("--app-vh", `${vh}px`);
        };
        setVH();
        const onResize = () => setVH();
        window.addEventListener("resize", onResize);
        (globalThis as any).visualViewport?.addEventListener?.("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            (globalThis as any).visualViewport?.removeEventListener?.("resize", onResize);
        };
    }, [viewportMode]);

    const targetHeight =
        viewportMode === "dynamic" ? "var(--app-vh)" :
            viewportMode === "dvh" ? "100dvh" :
                viewportMode === "svh" ? "100svh" :
                    viewportMode === "lvh" ? "100lvh" : "100vh";

    return (
        <div
            className={styles.widget}
            style={
                {
                    "--widget-target-height": targetHeight,
                    "--widget-offset": `${topbarOffset}px`,
                    paddingBottom: "24px",
                } as React.CSSProperties
            }
        >
            <div className={styles.body}>
                {/* Viewport relativo para posicionar popovers dentro del widget */}
                <div className="relative h-full w-full">
                    <div className="calendar-container h-full w-full overflow-auto">
                        {children}
                    </div>
                    {/* Portal INTERNO del calendario */}
                    <div id="calendar-portal" className="absolute inset-0 pointer-events-none" />
                </div>
            </div>
        </div>
    );
}
