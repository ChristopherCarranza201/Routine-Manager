// components/auth/auth-container.tsx
"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "components/ui/tabs"
import { LoginForm } from "./login-form"
import { RegisterForm } from "./register-form"
import { ForgotPasswordForm } from "./forgot-password-form"
import { ResetPasswordForm } from "./reset-password-form"

export type AuthView = "login" | "register" | "forgot-password" | "reset-password"

export function AuthContainer() {
  const [currentView, setCurrentView] = useState<AuthView>("login")
  const searchParams = useSearchParams()

  useEffect(() => {
    const urlHash = window.location.hash
    if (urlHash) {
      const hashParams = new URLSearchParams(urlHash.substring(1))
      const type = hashParams.get("type")

      if (type === "recovery") {
        setCurrentView("reset-password")
      }
    }
  }, [searchParams])

  // ... (El resto del componente sigue igual)
  return (
    <Card className="w-full">
      <CardHeader>
        {currentView === "login" || currentView === "register" ? (
          <>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in to your account or create a new one</CardDescription>
          </>
        ) : currentView === "forgot-password" ? (
          <>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>Enter your email address and we'll send you a reset link</CardDescription>
          </>
        ) : (
          <>
            <CardTitle>Set New Password</CardTitle>
            <CardDescription>Enter your new password below</CardDescription>
          </>
        )}
      </CardHeader>
      <CardContent>
        {currentView === "login" || currentView === "register" ? (
          <Tabs value={currentView} onValueChange={(value) => setCurrentView(value as AuthView)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <LoginForm onForgotPassword={() => setCurrentView("forgot-password")} />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm />
            </TabsContent>
          </Tabs>
        ) : currentView === "forgot-password" ? (
          <ForgotPasswordForm onBack={() => setCurrentView("login")} />
        ) : (
          <ResetPasswordForm onBack={() => setCurrentView("login")} />
        )}
      </CardContent>
    </Card>
  )
}
