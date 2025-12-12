import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { Participant } from "@/src/types/task"

interface AvatarGroupProps {
  participants: Participant[]
  max?: number
  size?: "sm" | "md" | "lg"
}

export function AvatarGroup({ participants, max = 3, size = "sm" }: AvatarGroupProps) {
  const displayParticipants = participants.slice(0, max)
  const remaining = participants.length - max

  const sizeClasses = {
    sm: "h-[18px] w-[18px]",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  }

  return (
    <div className="flex -space-x-2">
      {displayParticipants.map((participant, index) => (
        <Avatar key={participant.id} className={`${sizeClasses[size]} border-2 border-white`}>
          <AvatarImage src={participant.avatarUrl || "/placeholder.svg"} alt={participant.name} />
          <AvatarFallback className="text-[10px]">
            {participant.name
              .split(" ")
              .map((n) => n[0])
              .join("")}
          </AvatarFallback>
        </Avatar>
      ))}
      {remaining > 0 && (
        <Avatar className={`${sizeClasses[size]} border-2 border-white`}>
          <AvatarFallback className="text-[10px] bg-muted">+{remaining}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
