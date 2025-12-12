"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Share2, Pencil, Trash2, X } from "lucide-react";
import { Button } from "components/ui/button";
import { Textarea } from "components/ui/textarea";
import { AvatarGroup } from "components/ui/AvatarGroup";
import { LabelDotPicker } from "components/ui/LabelDot";
import type { TaskDTO } from "types/task";

interface EventPopoverProps {
  event: TaskDTO;
  rect: DOMRect;            // rect del target (evento clickeado)
  containerRect: DOMRect;   // rect del viewport del calendario (relative root)
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdate: (id: string, data: Partial<TaskDTO>) => Promise<void>;
}

export function EventPopover({
  event, rect, containerRect, onClose, onEdit, onDelete, onUpdate,
}: EventPopoverProps) {
  const portal = typeof document !== "undefined" ? document.getElementById("calendar-portal") : null;
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar con ESC / click fuera
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  if (!portal) return null;

  // Medidas del popover (aprox) para decidir lado
  const POP_W = 380;
  const POP_H = 320;
  let left = rect.left - containerRect.left + rect.width + 8;
  let top = rect.top - containerRect.top;

  if (left + POP_W > containerRect.width) {
    left = rect.left - containerRect.left - POP_W - 8;
  }
  if (top + POP_H > containerRect.height) {
    top = Math.max(0, containerRect.height - POP_H - 8);
  }

  return createPortal(
    <>
      {/* Backdrop SOLO dentro del widget */}
      <div className="rm-backdrop pointer-events-auto" onClick={onClose} />
      <div
        ref={ref}
        className="rm-popover pointer-events-auto w-[380px] bg-white rounded-2xl shadow-lg border border-[#E5E7EB] overflow-hidden"
        style={{ left, top, width: POP_W }}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-[#E5E7EB]">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold shrink-0"
              style={{ backgroundColor: event.color || "#B5E48C" }}
            >
              {event.title?.charAt(0) ?? "T"}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base leading-tight truncate">{event.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {formatTime(event.start)} - {formatTime(event.end)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0" onClick={() => {
              navigator.clipboard?.writeText(`${event.title}\n${formatTime(event.start)} - ${formatTime(event.end)}`);
            }}>
              <Share2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Participants */}
          <div>
            <label className="text-sm font-medium mb-2 block">Participants</label>
            <div className="flex items-center gap-2">
              {event.participants?.length ? (
                <AvatarGroup participants={event.participants} max={5} size="md" />
              ) : (
                <p className="text-sm text-muted-foreground">No participants</p>
              )}
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="text-sm font-medium mb-2 block">Label</label>
            <LabelDotPicker
              selectedColor={event.color || "#B5E48C"}
              onColorSelect={(color) => onUpdate(event.id, { color })}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-2 block">Notes</label>
            <Textarea
              defaultValue={event.notes || ""}
              onBlur={(e) => {
                const v = e.currentTarget.value;
                if (v !== (event.notes || "")) onUpdate(event.id, { notes: v });
              }}
              placeholder="Add notes..."
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[#E5E7EB]">
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-2 bg-transparent">
            <Pencil className="h-4 w-4" />
            Edit Event
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>
    </>,
    portal
  );
}

function formatTime(ts: string | Date) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
