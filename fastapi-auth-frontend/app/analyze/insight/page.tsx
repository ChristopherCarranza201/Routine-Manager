import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function InsightPage() {
  return (
    <PageShell title="Insights">
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Time Insights</CardTitle>
            <CardDescription>Get insights into your productivity patterns</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Productivity insights will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
