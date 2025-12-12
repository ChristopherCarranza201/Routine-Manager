import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export default function ClientsPage() {
  return (
    <PageShell title="Clients">
      <div className="p-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Clients</CardTitle>
              <CardDescription>Manage your client relationships</CardDescription>
            </div>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Client
            </Button>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Your clients will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
