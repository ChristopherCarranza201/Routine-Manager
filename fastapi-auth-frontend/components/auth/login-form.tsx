"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "components/ui/button"
import { Input } from "components/ui/input"
import { Label } from "components/ui/label"
import { Alert, AlertDescription } from "components/ui/alert"
import { Loader2, Shield, ShieldAlert, ShieldCheck } from "lucide-react"
import { authApi } from "lib/auth-api"
import { supabase } from "lib/supabaseClient"

interface LoginFormProps {
  onForgotPassword: () => void
}

type SecurityStatus = "idle" | "analyzing" | "approved" | "denied"

export function LoginForm({ onForgotPassword }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>("idle")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    setSecurityStatus("analyzing")

    try {
      // ⬇️ ahora login recibe 1 argumento (objeto) y devuelve { access_token, token_type, user? }
      const res = await authApi.login({ email, password })

      // Si llegó aquí no hubo 401/4xx (auth-api lanza Error en esos casos)
      if (!res?.access_token) {
        setSecurityStatus("idle")
        setError("Login successful, but access token is missing.")
        setIsLoading(false)
        return
      }

      // (opcional) también iniciamos sesión de Supabase para tener su JWT en otras peticiones
      const { error: sErr } = await supabase.auth.signInWithPassword({ email, password })
      if (sErr) {
        // No bloqueamos el login del backend por esto; solo avisamos
        console.warn("Supabase login failed:", sErr.message)
      }

      // Persistimos token (mismo patrón que antes)
      localStorage.setItem("access_token", res.access_token)
      if (res.user) {
        localStorage.setItem("user", JSON.stringify(res.user))
      }

      setSecurityStatus("approved")
      // redirigir
      setTimeout(() => {
        window.location.href = "/dashboard"
      }, 800)
    } catch (err: any) {
      // auth-api lanza Error con mensaje "HTTP 401 – <detalle>" en credenciales inválidas
      const msg = (err && typeof err.message === "string") ? err.message : "Network error. Please try again."
      setError(msg)
      // Si tu agente de seguridad escribe términos clave, puedes marcar denied
      if (msg.includes("actividad anómala") || msg.toLowerCase().includes("denied")) {
        setSecurityStatus("denied")
      } else {
        setSecurityStatus("idle")
      }
    } finally {
      setIsLoading(false)
    }
  }

  const getSecurityStatusDisplay = () => {
    switch (securityStatus) {
      case "analyzing":
        return (
          <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              AI Security Agent is analyzing your login attempt...
            </AlertDescription>
          </Alert>
        )
      case "approved":
        return (
          <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-200">
              Login approved by AI Security Agent. Redirecting...
            </AlertDescription>
          </Alert>
        )
      case "denied":
        return (
          <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 dark:text-red-200">
              Login denied by AI Security Agent due to suspicious activity.
            </AlertDescription>
          </Alert>
        )
      default:
        return null
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {getSecurityStatusDisplay()}

      {error && securityStatus !== "denied" && (
        <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {securityStatus === "analyzing" ? "AI Analyzing..." : "Signing In..."}
          </>
        ) : (
          "Sign In"
        )}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Forgot your password?
        </button>
      </div>
    </form>
  )
}
