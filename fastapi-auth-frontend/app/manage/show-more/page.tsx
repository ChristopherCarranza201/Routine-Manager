import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ShowMorePage() {
  return (
    <PageShell title="More Options">
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Additional Options</CardTitle>
            <CardDescription>Access more management features</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Additional management options will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
