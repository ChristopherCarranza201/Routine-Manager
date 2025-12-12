import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function BillableRatesPage() {
  return (
    <PageShell title="Billable Rates">
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Billable Rates</CardTitle>
            <CardDescription>Configure your hourly rates for different projects</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Billable rates configuration will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
