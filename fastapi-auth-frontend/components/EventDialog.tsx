"use client"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "components/ui/dialog"
import { Button } from "components/ui/button"
import { Input } from "components/ui/input"
import { Label } from "components/ui/label"
import { Textarea } from "components/ui/textarea"
import { LabelDotPicker } from "components/ui/LabelDot"
import type { TaskDTO } from "types/task"

interface EventDialogProps {
  event: TaskDTO
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<TaskDTO>) => Promise<void>
}

export function EventDialog({ event, open, onOpenChange, onSave }: EventDialogProps) {
  const [title, setTitle] = useState(event.title)
  const [notes, setNotes] = useState(event.description || event.notes || "")
  const [color, setColor] = useState(event.color || "#B5E48C")
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      const patch: Partial<TaskDTO> = {}

      if (title !== event.title) patch.title = title
      // El backend persiste `description`, no `notes`
      if ((notes || "") !== (event.description || event.notes || "")) {
        ; (patch as any).description = notes
      }
      // Enviamos color; el front lo mantiene con overrides
      if ((color || "") !== (event.color || "")) {
        ; (patch as any).color = color
      }

      await onSave(patch)
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          fixed left-1/2 top-1/2 
          -translate-x-1/2 -translate-y-1/2
          z-[1001]
          w-[min(92vw,640px)]
          sm:max-w-[500px]
          rounded-2xl
        "
      >
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>Make changes to your event details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Label Color</Label>
            <LabelDotPicker selectedColor={color} onColorSelect={setColor} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="min-h-[100px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
