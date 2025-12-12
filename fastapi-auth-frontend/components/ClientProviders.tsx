"use client";

import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Analytics } from "@vercel/analytics/react";

export function ClientProviders({ children }: { children: React.ReactNode }) {
    return (
        <DndProvider backend={HTML5Backend}>
            {children}
            <Analytics />
        </DndProvider>
    );
}
