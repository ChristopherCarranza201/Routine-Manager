// components/GlobalTopbar.tsx
"use client";

/* =========================================================
   GLOBAL TOPBAR — con "New Project" y popout "New Task"
   ---------------------------------------------------------
   - Split button con lista debajo (New Folder / New Task / From Template / Import).
   - Popout "New Task" con formulario + adjuntos.
   - POST a BACKEND en `${API_BASE}/api/tasks` con schema:
     {
       "title", "description", "priority", "tag", "status",
       "start_ts_local", "end_ts_local", "tz"
     }
   - Usa authHeaders() desde lib/api.ts y normaliza HeadersInit
     para evitar el error TS2769.
   ========================================================= */

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Plus,
  ChevronDown,
  FolderPlus,
  LayoutTemplate,
  Import,
  ClipboardList,
  Paperclip,
  X,
  Trash2,
} from "lucide-react";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { API_BASE, authHeaders } from "lib/api";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// zona horaria del navegador (puedes fijar "America/Tijuana" si prefieres)
const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** Normaliza el valor de <input type="datetime-local">
 *  - acepta "YYYY-MM-DDTHH:mm" o "YYYY-MM-DDTHH:mm:ss"
 *  - devuelve "YYYY-MM-DDTHH:mm" (sin segundos)
 */
const toLocalNoSeconds = (v: string) => {
  if (!v) return "";
  return v.length >= 16 ? v.slice(0, 16) : v;
};

interface GlobalTopbarProps {
  title?: string;
  onToggleSidebar?: () => void;
}

export default function GlobalTopbar({
  title = "What's your next task?",
  onToggleSidebar,
}: GlobalTopbarProps) {
  // ===== Buscador
  const [searchQuery, setSearchQuery] = useState<string>("");

  // ===== Estado del sidebar secundario
  const [secondaryPinned, setSecondaryPinned] = useState<boolean>(false);
  useEffect(() => {
    const v = localStorage.getItem("secondarybar:pinned") === "true";
    setSecondaryPinned(v);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const v = localStorage.getItem("secondarybar:pinned") === "true";
      setSecondaryPinned(v);
    }, 500);
    return () => clearInterval(id);
  }, []);
  const toggleSecondary = () => {
    if (onToggleSidebar) onToggleSidebar();
    window.dispatchEvent(new CustomEvent("secondarybar:toggle"));
    setSecondaryPinned((v) => !v);
  };

  // ===== New Project (acción principal)
  const openNewProject = () => {
    const anyWin = window as any;
    if (typeof anyWin.openNewProjectTab === "function") {
      anyWin.openNewProjectTab();
      return;
    }
    window.dispatchEvent(new CustomEvent("project:new"));
    window.dispatchEvent(new CustomEvent("sheet:open", { detail: { id: "new-project" } }));
    try {
      window.open("/projects/new", "_blank", "noopener,noreferrer");
    } catch { }
  };

  // ===== Menú New Project (lista debajo)
  const [openMenu, setOpenMenu] = useState(false);
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest?.("[data-new-project-split]")) setOpenMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(false);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  const toggleMenu = () => setOpenMenu((v) => !v);
  const onPick = (fn: () => void) => {
    fn();
    setOpenMenu(false);
  };
  const onNewFolder = () => {
    window.dispatchEvent(new CustomEvent("project:new-folder"));
    window.dispatchEvent(new CustomEvent("sheet:open", { detail: { id: "new-folder" } }));
  };
  const onFromTemplate = () => {
    window.dispatchEvent(new CustomEvent("project:new-from-template"));
    window.dispatchEvent(new CustomEvent("sheet:open", { detail: { id: "new-project-template" } }));
  };
  const onImport = () => {
    window.dispatchEvent(new CustomEvent("project:import"));
    window.dispatchEvent(new CustomEvent("sheet:open", { detail: { id: "import-project" } }));
    try {
      window.open("/projects/import", "_blank", "noopener,noreferrer");
    } catch { }
  };

  // ===== Popout: New Task
  const [taskOpen, setTaskOpen] = useState(false);
  type NewTask = {
    title: string;
    priority: "low" | "medium" | "high" | "urgent";
    tag: "Education" | "Workout" | "Home" | "Job" | "Other";
    status: "pending" | "in_progress" | "done" | "canceled";
    description: string;
    start: string; // datetime-local
    end: string; // datetime-local
    files: File[];
  };
  const [task, setTask] = useState<NewTask>({
    title: "",
    priority: "low",
    tag: "Other",
    status: "pending",
    description: "",
    start: "",
    end: "",
    files: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openTaskPopout = () => setTaskOpen(true);
  const closeTaskPopout = () => setTaskOpen(false);

  const onFilesAdd = (files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setTask((t) => ({ ...t, files: [...t.files, ...list] }));
  };
  const onDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) onFilesAdd(e.dataTransfer.files);
  };
  const onDragOver: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const removeFileAt = (idx: number) => {
    setTask((t) => ({ ...t, files: t.files.filter((_, i) => i !== idx) }));
  };

  // ===== Submit → POST a `${API_BASE}/api/tasks`
  const onSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    if (submitting) return;
    try {
      setSubmitting(true);

      const payload = {
        title: task.title,
        description: task.description || "",
        priority: task.priority,
        tag: task.tag,
        status: task.status,
        start_ts_local: toLocalNoSeconds(task.start),
        end_ts_local: toLocalNoSeconds(task.end),
        tz: BROWSER_TZ, // o "America/Tijuana" si quieres fijarlo
      };

      // 1) Auth opcional
      const auth = await authHeaders();
      // 2) Normalizamos a HeadersInit SÓLO si hay Authorization string
      const baseHeaders: HeadersInit =
        auth && typeof (auth as any).Authorization === "string"
          ? { Authorization: (auth as any).Authorization }
          : {};

      // 3) Endpoint ABSOLUTO al backend
      const endpoint = `${API_BASE}/tasks`;

      let res: Response;
      if (task.files.length > 0) {
        // multipart/form-data: NO seteamos Content-Type manualmente
        const fd = new FormData();
        fd.append("data", JSON.stringify(payload));
        task.files.forEach((f) => fd.append("files", f, f.name));
        res = await fetch(endpoint, {
          method: "POST",
          headers: baseHeaders,
          body: fd,
        });
      } else {
        // JSON puro
        const jsonHeaders: HeadersInit = {
          ...baseHeaders,
          "Content-Type": "application/json",
        };
        res = await fetch(endpoint, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`POST ${endpoint} -> ${res.status}: ${text.slice(0, 240)}`);
      }

      alert("Task created ✅");
      setTaskOpen(false);
      setTask({
        title: "",
        priority: "low",
        tag: "Other",
        status: "pending",
        description: "",
        start: "",
        end: "",
        files: [],
      });
    } catch (err: any) {
      console.error("Create task error:", err);
      alert(`Create task error: ${err?.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-b border-[#2a2a2a] bg-[#303030] text-white">
      {/* ===== Fila principal ===== */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0 text-white"
            onClick={toggleSecondary}
            aria-label="Toggle sidebar"
          >
            {secondaryPinned ? (
              <PanelLeftClose className="!h-6 !w-6 shrink-0" strokeWidth={2.25} />
            ) : (
              <PanelLeftOpen className="!h-6 !w-6 shrink-0" strokeWidth={2.25} />
            )}
          </Button>

          <h1 className="text-xl font-semibold">{title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* === NEW PROJECT (split + lista debajo) === */}
          <div className="relative inline-flex rounded-md shadow-sm" data-new-project-split>
            {/* Botón principal */}
            <Button
              onClick={openNewProject}
              size="sm"
              className="h-8 text-sm font-medium bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-r-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>

            {/* Chevron (abre/cierra menú) */}
            <Button
              size="sm"
              onClick={() => setOpenMenu((v) => !v)}
              className="h-8 px-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-l-none border-l border-white/20"
              aria-label="Open new project menu"
              aria-expanded={openMenu}
              aria-haspopup="menu"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>

            {/* Lista debajo */}
            {openMenu && (
              <div
                role="menu"
                className="
                  absolute right-0 top-full mt-2 w-56
                  z-[4000]
                  rounded-md border border-black/10 bg-white shadow-lg
                  p-1 text-gray-900
                "
              >
                <button
                  role="menuitem"
                  onClick={() => onPick(onNewFolder)}
                  className="w-full flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm hover:bg-gray-100"
                >
                  <FolderPlus className="h-4 w-4 text-gray-700" />
                  <span>New Folder</span>
                </button>

                <button
                  role="menuitem"
                  onClick={() => onPick(() => setTaskOpen(true))}
                  className="w-full flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm hover:bg-gray-100"
                >
                  <ClipboardList className="h-4 w-4 text-gray-700" />
                  <span>New Task</span>
                </button>

                <button
                  role="menuitem"
                  onClick={() => onPick(onFromTemplate)}
                  className="w-full flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm hover:bg-gray-100"
                >
                  <LayoutTemplate className="h-4 w-4 text-gray-700" />
                  <span>From Template</span>
                </button>

                <button
                  role="menuitem"
                  onClick={() => onPick(onImport)}
                  className="w-full flex items-center gap-2 rounded-[6px] px-3 py-2 text-sm hover:bg-gray-100"
                >
                  <Import className="h-4 w-4 text-gray-700" />
                  <span>Import Project</span>
                </button>
              </div>
            )}
          </div>

          {/* Botones decorativos de tiempo */}
          <Button variant="outline" size="sm" className="h-8 text-sm font-normal bg-transparent">
            08:00 Today
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-sm font-normal bg-transparent">
            13:00 Today
          </Button>

          {/* Buscador */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white" />
            <Input
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="
                h-8 pl-9 text-sm
                bg-transparent
                text-white
                placeholder:text-white/70
                border-white/30
                focus-visible:ring-white/40
                focus-visible:border-white/60
              "
            />
          </div>
        </div>
      </div>

      {/* ===== POP OUT: New Task ===== */}
      {taskOpen && (
        <div className="fixed inset-0 z-[5000]">
          {/* overlay */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setTaskOpen(false)} aria-hidden />
          {/* modal */}
          <div
            role="dialog"
            aria-modal="true"
            className="
              absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
              w-[92vw] max-w-[980px] max-h-[88vh]
              rounded-xl bg-white text-gray-900 shadow-2xl
              flex flex-col
            "
          >
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">Create New Task</h2>
                <p className="text-sm text-gray-500">
                  Fill in the details and attach any related documents.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-500 hover:text-gray-800"
                onClick={() => setTaskOpen(false)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* body */}
            <form onSubmit={onSubmit} className="flex-1 overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5">
                {/* LEFT: Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2">Upload from your device</label>

                  <div
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    className="border border-dashed rounded-lg p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <Paperclip className="mx-auto h-7 w-7 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-700">
                      <span
                        className="text-blue-600 font-medium cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Click to upload
                      </span>{" "}
                      or drag and drop
                      <br />
                      <span className="text-gray-500">
                        PNG, JPG, DOCX, XLSX, PDF (max ~10MB each)
                      </span>
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                      onChange={(e) => e.target.files && onFilesAdd(e.target.files)}
                    />
                  </div>

                  {task.files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {task.files.map((f, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{f.name}</div>
                            <div className="text-xs text-gray-500">
                              {(f.size / 1024).toFixed(1)} KB
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-gray-500 hover:text-red-600"
                            onClick={() => removeFileAt(idx)}
                            aria-label={`Remove ${f.name}`}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* RIGHT: Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Title *</label>
                    <Input
                      value={task.title}
                      onChange={(e) => setTask({ ...task, title: e.target.value })}
                      placeholder="Enter a title"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Priority *</label>
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={task.priority}
                        onChange={(e) =>
                          setTask({ ...task, priority: e.target.value as NewTask["priority"] })
                        }
                        required
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                        <option value="urgent">urgent</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">Tag *</label>
                      <select
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={task.tag}
                        onChange={(e) => setTask({ ...task, tag: e.target.value as NewTask["tag"] })}
                        required
                      >
                        <option>Education</option>
                        <option>Workout</option>
                        <option>Home</option>
                        <option>Job</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Status *</label>
                    <select
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      value={task.status}
                      onChange={(e) =>
                        setTask({ ...task, status: e.target.value as NewTask["status"] })
                      }
                      required
                    >
                      <option value="pending">pending</option>
                      <option value="in_progress">in_progress</option>
                      <option value="done">done</option>
                      <option value="canceled">canceled</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Start *</label>
                      <input
                        type="datetime-local"
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={task.start}
                        onChange={(e) => setTask({ ...task, start: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">End *</label>
                      <input
                        type="datetime-local"
                        className="w-full rounded-md border px-3 py-2 text-sm"
                        value={task.end}
                        onChange={(e) => setTask({ ...task, end: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Description</label>
                    <textarea
                      className="w-full rounded-md border px-3 py-2 text-sm min-h-[96px]"
                      placeholder="Enter a description"
                      value={task.description}
                      onChange={(e) => setTask({ ...task, description: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-5 py-4 border-t">
                <Button type="button" variant="outline" onClick={() => setTaskOpen(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className={clsx(
                    "bg-[#2563eb] hover:bg-[#1d4ed8] text-white",
                    submitting && "opacity-70 pointer-events-none"
                  )}
                >
                  {submitting ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
