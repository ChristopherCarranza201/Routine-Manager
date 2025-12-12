import type { TaskDTO, Participant } from "@/types/task"

const participants: Participant[] = [
  { id: "1", name: "Carolina", avatarUrl: "/diverse-woman-avatar.png" },
  { id: "2", name: "Angelina", avatarUrl: "/woman-avatar-2.png" },
  { id: "3", name: "Andy", avatarUrl: "/man-avatar.png" },
]

/**
 * Genera tareas de ejemplo ANCLADAS a la semana actual (lunes a sábado).
 * Mantiene el mismo "look" que tus ejemplos de abril, pero siempre visibles.
 */
function startOfWeekLocal(d: Date) {
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  const res = new Date(d);
  res.setDate(diff);
  res.setHours(0, 0, 0, 0);
  return res;
}
function mk(base: Date, dayOffset: number, startH: number, endH: number,
  title: string, color: string, status: "todo" | "doing" | "done" = "todo",
  notes?: string): TaskDTO {
  const s = new Date(base); s.setDate(s.getDate() + dayOffset); s.setHours(startH, 0, 0, 0);
  const e = new Date(base); e.setDate(e.getDate() + dayOffset); e.setHours(endH, 0, 0, 0);
  return {
    id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
    title, start: s.toISOString(), end: e.toISOString(),
    color, status, participants, notes,
    tag: "general", recurrence_id: null, description: notes,
  };
}

const base = startOfWeekLocal(new Date());

export const mockTasks: TaskDTO[] = [
  mk(base, 0, 8, 10, "Moodboarding – Routine Product", "#FFB7C5", "done", "Gather inspiration for the routine product design"),
  mk(base, 1, 9, 10, "Wireframe – Audit", "#7BDFF2", "doing", "Review and audit existing wireframes"),
  mk(base, 1, 11, 13, "Exploration Design – Odama Shot", "#B28DFF", "todo", "Design exploration for the Odama shot concept"),
  mk(base, 2, 10, 12, "Feedback – Routine Product", "#FFD29D", "doing", "Collect feedback and iterate on designs"),
  mk(base, 4, 11, 13, "Wireframe – RTGO", "#9DE8C1", "todo", "High-fidelity wireframe for RTGO"),
  mk(base, 5, 8, 11, "Review – Launch Readiness", "#A0C4FF", "todo", "Final review before launch"),
]
