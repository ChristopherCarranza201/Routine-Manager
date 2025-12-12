import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function TeamPage() {
  return (
    <PageShell title="Team">
      <div className="p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage your team and their permissions</CardDescription>
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Invite Member
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Your team members will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
