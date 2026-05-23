"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IkionSessionRecord, formatUtcTimestamp, ikionFetch } from "@/lib/ikion-api"
import { LogOut, ShieldCheck, Trash2 } from "lucide-react"
import { toast } from "sonner"

export default function SettingsPage() {
  const { user, sessionId, logout } = useAuth()
  const router = useRouter()
  const [sessions, setSessions] = useState<IkionSessionRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadSessions = async () => {
    try {
      const sessionList = await ikionFetch<IkionSessionRecord[]>("/auth/sessions")
      setSessions(sessionList)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load sessions.")
    }
  }

  useEffect(() => {
    void loadSessions()
  }, [])

  const revokeSession = async (id: string) => {
    try {
      await ikionFetch(`/auth/sessions/${id}`, { method: "DELETE" })
      if (id === sessionId) {
        await logout()
        router.replace("/login")
        return
      }
      await loadSessions()
      toast.success("Session revoked.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to revoke session."
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
        <p className="mt-1 text-muted-foreground">Inspect your current Ikion identity and active sessions.</p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Profile
          </CardTitle>
          <CardDescription>Current authenticated Ikion user.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><strong>Name:</strong> {user?.full_name}</p>
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Role:</strong> <Badge>{user?.role}</Badge></p>
          {user?.last_login_at && <p><strong>Last login:</strong> {formatUtcTimestamp(user.last_login_at)}</p>}
          <Button
            variant="outline"
            className="mt-4 gap-2"
            onClick={async () => {
              await logout()
              router.replace("/login")
            }}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Sessions</CardTitle>
          <CardDescription>Revoke any session you no longer trust.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="font-medium">{session.user_agent ?? "Unknown client"}</p>
                <p className="text-xs text-muted-foreground">
                  Started {formatUtcTimestamp(session.created_at)} • last seen {formatUtcTimestamp(session.last_seen_at)}
                </p>
                <p className="text-xs text-muted-foreground">Expires {formatUtcTimestamp(session.expires_at)}</p>
              </div>
              <div className="flex items-center gap-2">
                {session.id === sessionId && <Badge variant="secondary">Current</Badge>}
                <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={() => void revokeSession(session.id)}>
                  <Trash2 className="h-4 w-4" />
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
