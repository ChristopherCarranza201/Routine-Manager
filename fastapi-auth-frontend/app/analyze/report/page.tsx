import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function ReportPage() {
  return (
    <PageShell title="Reports">
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Time Reports</CardTitle>
            <CardDescription>View detailed reports of your time tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Report analytics will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
