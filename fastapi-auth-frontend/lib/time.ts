// Timezone: America/Tijuana (GMT-7)
const TZ = "America/Tijuana"

export function toLocal(dateISO: string): Date {
  return new Date(dateISO)
}

export function toUTC(date: Date): string {
  return date.toISOString()
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  })
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: TZ,
  })
}

export function getTimezone(): string {
  return TZ
}
