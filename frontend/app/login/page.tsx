"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { OrionLogo } from "@/components/orion-logo"
import { roleHomePath, useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OrionSetupStatus, orionFetch } from "@/lib/orion-api"
import { ArrowRight, LockKeyhole, ShieldCheck, UserRoundPlus } from "lucide-react"
import { toast } from "sonner"

export default function LoginPage() {
  const { user, isLoading, login, bootstrap, getSetupStatus } = useAuth()
  const router = useRouter()
  const [setupStatus, setSetupStatus] = useState<OrionSetupStatus | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResettingAuth, setIsResettingAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextPath, setNextPath] = useState<string | null>(null)
  const [fullName, setFullName] = useState("Orion Administrator")
  const [email, setEmail] = useState("admin@orion.local")
  const [password, setPassword] = useState("")

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath || roleHomePath(user.role))
    }
  }, [isLoading, nextPath, router, user])

  useEffect(() => {
    if (typeof window === "undefined") return
    setNextPath(new URLSearchParams(window.location.search).get("next"))
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const status = await getSetupStatus()
        setSetupStatus(status)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load authentication status.")
      }
    }

    void load()
  }, [getSetupStatus])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const authenticatedUser = setupStatus?.setup_required
        ? await bootstrap(fullName, email, password)
        : await login(email, password)
      toast.success(setupStatus?.setup_required ? "Initial administrator created." : "Signed in.")
      router.replace(nextPath || roleHomePath(authenticatedUser.role))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed."
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetAuth = async () => {
    setError(null)
    setIsResettingAuth(true)

    try {
      await orionFetch<{ status: string }>("/auth/dev-reset", { method: "POST" })
      const status = await getSetupStatus()
      setSetupStatus(status)
      setFullName("Orion Administrator")
      setEmail("admin@orion.local")
      setPassword("")
      toast.success("Local auth reset. You can bootstrap a new admin account now.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reset local auth."
      setError(message)
      toast.error(message)
    } finally {
      setIsResettingAuth(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-8">
            <OrionLogo size="md" />
          </div>

          <h1 className="text-3xl font-bold tracking-tight">
            {setupStatus?.setup_required ? "Bootstrap Orion Core" : "Sign in to Orion"}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {setupStatus?.setup_required
              ? "Create the initial administrator account for this local Orion instance."
              : "Use your Orion account to access the workspace platform."}
          </p>

          <div className="mt-8 space-y-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" />
              <p>Session-backed authentication is now enforced by the Orion backend.</p>
            </div>
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-4 w-4 text-accent" />
              <p>Admin and lecturer surfaces are protected by role-aware route guards.</p>
            </div>
            <div className="flex items-start gap-3">
              <UserRoundPlus className="mt-0.5 h-4 w-4 text-accent" />
              <p>The first account becomes the instance administrator and can create additional users later.</p>
            </div>
          </div>
        </div>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>{setupStatus?.setup_required ? "Create Admin Account" : "Account Access"}</CardTitle>
            <CardDescription>
              {setupStatus?.setup_required
                ? "This only appears when the Orion user table is empty."
                : "Sign in with a locally managed Orion account."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {setupStatus?.setup_required && (
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full name</Label>
                  <Input
                    id="full-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Orion Administrator"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@orion.local"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full gap-2" disabled={isSubmitting || !email.trim() || password.length < 8}>
                {setupStatus?.setup_required ? "Create Administrator" : "Sign In"}
                <ArrowRight className="h-4 w-4" />
              </Button>

              {!setupStatus?.setup_required && setupStatus?.allow_dev_auth_reset && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isSubmitting || isResettingAuth}
                  onClick={handleResetAuth}
                >
                  {isResettingAuth ? "Resetting Local Auth..." : "Reset Local Auth"}
                </Button>
              )}
            </form>

            <div className="mt-6 text-sm text-muted-foreground">
              <Link href="/" className="underline underline-offset-4">
                Back to Orion home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
