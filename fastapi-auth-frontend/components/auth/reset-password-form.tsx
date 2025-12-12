"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "components/ui/button"
import { Input } from "components/ui/input"
import { Label } from "components/ui/label"
import { Alert, AlertDescription } from "components/ui/alert"
import { Loader2, ArrowLeft, CheckCircle } from "lucide-react"
import { authApi } from "lib/auth-api"

interface ResetPasswordFormProps {
  onBack: () => void
}

export function ResetPasswordForm({ onBack }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [tokens, setTokens] = useState<{ access_token: string; refresh_token: string } | null>(null)

  useEffect(() => {
    // Extract tokens from URL hash (Supabase auth callback format)
    const hash = window.location.hash
    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get("access_token")
    const refreshToken = params.get("refresh_token")

    if (accessToken && refreshToken) {
      setTokens({ access_token: accessToken, refresh_token: refreshToken })
    } else {
      setError("Invalid reset link. Please request a new password reset.")
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!tokens) {
      setError("Invalid reset tokens")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      const result = await authApi.resetPassword(tokens.access_token, tokens.refresh_token, password)

      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error || "Failed to reset password")
      }
    } catch (err) {
      setError("Network error. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="space-y-4">
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            Password updated successfully! You can now sign in with your new password.
          </AlertDescription>
        </Alert>

        <Button onClick={onBack} className="w-full">
          Sign In Now
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <AlertDescription className="text-red-800 dark:text-red-200">{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="new-password">New Password</Label>
        <Input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading || !tokens}
          minLength={6}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-new-password">Confirm New Password</Label>
        <Input
          id="confirm-new-password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={isLoading || !tokens}
          minLength={6}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading || !tokens}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Updating Password...
          </>
        ) : (
          "Update Password"
        )}
      </Button>

      <Button variant="outline" type="button" onClick={onBack} className="w-full bg-transparent">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Sign In
      </Button>
    </form>
  )
}
