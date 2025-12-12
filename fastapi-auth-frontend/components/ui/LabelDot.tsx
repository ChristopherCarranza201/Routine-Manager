"use client"

export const LABEL_COLORS = [
  { name: "Pink", value: "#FFB7C5" },
  { name: "Cyan", value: "#7BDFF2" },
  { name: "Green", value: "#B5E48C" },
  { name: "Amber", value: "#FFD166" },
  { name: "Lavender", value: "#BDB2FF" },
  { name: "Orchid", value: "#F1C0E8" },
  { name: "Salmon", value: "#FFADAD" },
  { name: "Mauve", value: "#CDB4DB" },
  { name: "Blue", value: "#A0C4FF" },
  { name: "Peach", value: "#FEC89A" },
  { name: "Light Blue", value: "#CAE9FF" },
  { name: "Lemon", value: "#F9F871" },
]

interface LabelDotProps {
  color: string
  selected?: boolean
  onClick?: () => void
  size?: "sm" | "md" | "lg"
}

export function LabelDot({ color, selected = false, onClick, size = "md" }: LabelDotProps) {
  const sizeClasses = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${sizeClasses[size]} rounded-full transition-all ${
        selected ? "ring-2 ring-offset-2 ring-primary" : ""
      } ${onClick ? "cursor-pointer hover:scale-110" : ""}`}
      style={{ backgroundColor: color }}
      aria-label={`Color ${color}`}
    />
  )
}

interface LabelDotPickerProps {
  selectedColor?: string
  onColorSelect: (color: string) => void
}

export function LabelDotPicker({ selectedColor, onColorSelect }: LabelDotPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {LABEL_COLORS.map((color) => (
        <LabelDot
          key={color.value}
          color={color.value}
          selected={selectedColor === color.value}
          onClick={() => onColorSelect(color.value)}
        />
      ))}
    </div>
  )
}
