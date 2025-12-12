import { PageShell } from "@/components/PageShell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function IntegrationsPage() {
  return (
    <PageShell title="Integrations">
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>Connect with your favorite tools and services</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Available integrations will be displayed here.</p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
