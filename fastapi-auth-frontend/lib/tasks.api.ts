import type { TaskDTO } from "types/task"
import { mockTasks } from "data/tasks.mock"

export async function listTasks(range?: { start: Date; end: Date }): Promise<TaskDTO[]> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 100))

  if (!range) {
    return mockTasks
  }

  return mockTasks.filter((task) => {
    const taskStart = new Date(task.start)
    return taskStart >= range.start && taskStart <= range.end
  })
}

export async function createTask(data: Omit<TaskDTO, "id">): Promise<TaskDTO> {
  await new Promise((resolve) => setTimeout(resolve, 100))

  const newTask: TaskDTO = {
    ...data,
    id: Math.random().toString(36).substr(2, 9),
  }

  mockTasks.push(newTask)
  return newTask
}

export async function updateTask(id: string, data: Partial<TaskDTO>): Promise<TaskDTO> {
  await new Promise((resolve) => setTimeout(resolve, 100))

  const index = mockTasks.findIndex((task) => task.id === id)
  if (index === -1) {
    throw new Error("Task not found")
  }

  mockTasks[index] = { ...mockTasks[index], ...data }
  return mockTasks[index]
}

export async function deleteTask(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100))

  const index = mockTasks.findIndex((task) => task.id === id)
  if (index === -1) {
    throw new Error("Task not found")
  }

  mockTasks.splice(index, 1)
}
