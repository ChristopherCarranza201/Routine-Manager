import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, Pause, Square } from "lucide-react"

export default function TimerPage() {
  return (
    <PageShell>
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">Timer</h1>

        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Time Tracker</CardTitle>
            <CardDescription>Track your time on tasks and projects</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="mb-6 font-mono text-6xl font-bold">00:00:00</div>
              <div className="flex items-center justify-center gap-3">
                <Button size="lg" className="gap-2">
                  <Play className="h-5 w-5" />
                  Start
                </Button>
                <Button size="lg" variant="outline" className="gap-2 bg-transparent">
                  <Pause className="h-5 w-5" />
                  Pause
                </Button>
                <Button size="lg" variant="destructive" className="gap-2">
                  <Square className="h-5 w-5" />
                  Stop
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
