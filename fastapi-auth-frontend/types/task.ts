export type TaskStatus = "todo" | "doing" | "done"

export interface Participant {
  id: string
  name: string
  avatarUrl?: string
}

export interface TaskDTO {
  id: string
  title: string
  description?: string
  tag?: string
  status: TaskStatus
  start: string // ISO UTC
  end: string // ISO UTC
  color?: string // hex
  participants?: Participant[]
  notes?: string
  recurrence_id?: string | null
}
