import { AuthContainer } from "components/auth/auth-container"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">AgentAuth</h1>
              <p className="text-muted-foreground">AI-Powered Secure Authentication</p>
            </div>
            <AuthContainer />
          </div>
        </div>
      </div>
    </div>
  )
}
