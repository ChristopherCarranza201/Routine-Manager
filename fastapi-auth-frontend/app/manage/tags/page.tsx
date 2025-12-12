import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function TagsPage() {
  return (
    <PageShell title="Tags">
      <div className="p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tags</CardTitle>
              <CardDescription>Organize your tasks with custom tags</CardDescription>
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Tag
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Your tags will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
