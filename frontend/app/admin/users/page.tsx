"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  IkionSessionRecord,
  IkionUserRole,
  IkionUserSummary,
  IkionWorkspace,
  IkionWorkspaceMembership,
  formatUtcTimestamp,
  ikionFetch,
} from "@/lib/ikion-api"
import { RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { toast } from "sonner"

export default function AdminUsersPage() {
  const [users, setUsers] = useState<IkionUserSummary[]>([])
  const [sessions, setSessions] = useState<IkionSessionRecord[]>([])
  const [workspaces, setWorkspaces] = useState<IkionWorkspace[]>([])
  const [memberships, setMemberships] = useState<IkionWorkspaceMembership[]>([])
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("")
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [membershipRole, setMembershipRole] = useState<IkionUserRole>("student")
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "student",
  })

  const load = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const [userList, sessionList, workspaceList] = await Promise.all([
        ikionFetch<IkionUserSummary[]>("/users"),
        ikionFetch<IkionSessionRecord[]>("/auth/sessions?all_users=true"),
        ikionFetch<IkionWorkspace[]>("/workspaces"),
      ])
      setUsers(userList)
      setSessions(sessionList)
      setWorkspaces(workspaceList)
      if (!selectedWorkspaceId && workspaceList.length > 0) {
        setSelectedWorkspaceId(workspaceList[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load user management.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const loadMembers = async () => {
      if (!selectedWorkspaceId) {
        setMemberships([])
        return
      }
      try {
        const memberList = await ikionFetch<IkionWorkspaceMembership[]>(
          `/workspaces/${selectedWorkspaceId}/members`
        )
        setMemberships(memberList)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load workspace members.")
      }
    }
    void loadMembers()
  }, [selectedWorkspaceId])

  const createUser = async () => {
    setIsCreating(true)
    setError(null)
    try {
      await ikionFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: formData.fullName,
          email: formData.email,
          password: formData.password,
          role: formData.role,
        }),
      })
      setFormData({ fullName: "", email: "", password: "", role: "student" })
      await load()
      toast.success("User created.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create user."
      setError(message)
      toast.error(message)
    } finally {
      setIsCreating(false)
    }
  }

  const revokeSession = async (sessionId: string) => {
    try {
      await ikionFetch(`/auth/sessions/${sessionId}`, {
        method: "DELETE",
      })
      await load()
      toast.success("Session revoked.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to revoke session."
      setError(message)
      toast.error(message)
    }
  }

  const addMembership = async () => {
    if (!selectedWorkspaceId || !selectedUserId) return
    setIsCreating(true)
    setError(null)
    try {
      await ikionFetch(`/workspaces/${selectedWorkspaceId}/members`, {
        method: "POST",
        body: JSON.stringify({
          user_id: selectedUserId,
          role: membershipRole,
        }),
      })
      const memberList = await ikionFetch<IkionWorkspaceMembership[]>(
        `/workspaces/${selectedWorkspaceId}/members`
      )
      setMemberships(memberList)
      toast.success("Member assigned.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to assign member."
      setError(message)
      toast.error(message)
    } finally {
      setIsCreating(false)
    }
  }

  const removeMembership = async (userId: string) => {
    if (!selectedWorkspaceId) return
    setError(null)
    try {
      await ikionFetch(`/workspaces/${selectedWorkspaceId}/members/${userId}`, {
        method: "DELETE",
      })
      const memberList = await ikionFetch<IkionWorkspaceMembership[]>(
        `/workspaces/${selectedWorkspaceId}/members`
      )
      setMemberships(memberList)
      toast.success("Member removed.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to remove member."
      setError(message)
      toast.error(message)
    }
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users & Sessions</h1>
          <p className="mt-1 text-muted-foreground">
            Manage local Ikion accounts and inspect active session records.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" />
              Create User
            </CardTitle>
            <CardDescription>Add a locally managed Ikion account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input id="full-name" value={formData.fullName} onChange={(event) => setFormData((previous) => ({ ...previous, fullName: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={(event) => setFormData((previous) => ({ ...previous, email: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={formData.password} onChange={(event) => setFormData((previous) => ({ ...previous, password: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={formData.role}
                onChange={(event) => setFormData((previous) => ({ ...previous, role: event.target.value }))}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Button
              className="w-full gap-2"
              onClick={() => void createUser()}
              disabled={isCreating || !formData.fullName.trim() || !formData.email.trim() || formData.password.length < 8}
            >
              <ShieldCheck className="h-4 w-4" />
              {isCreating ? "Creating..." : "Create User"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accounts</CardTitle>
            <CardDescription>
              {isLoading ? "Loading accounts..." : `${users.length} users and ${sessions.length} active sessions`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Created {formatUtcTimestamp(user.created_at)}
                      {user.last_login_at ? ` • last login ${formatUtcTimestamp(user.last_login_at)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{user.role}</Badge>
                    <Badge variant="secondary">{user.active_session_count} sessions</Badge>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {sessions.filter((session) => session.user_id === user.id).map((session) => (
                    <div key={session.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div>
                        <p>{session.user_agent ?? "Unknown client"}</p>
                        <p className="text-xs text-muted-foreground">
                          Started {formatUtcTimestamp(session.created_at)} • expires {formatUtcTimestamp(session.expires_at)}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={() => void revokeSession(session.id)}>
                        <Trash2 className="h-4 w-4" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course Memberships</CardTitle>
          <CardDescription>Assign students and lecturers to specific courses.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="workspace-select">Course</Label>
              <select
                id="workspace-select"
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-select">User</Label>
              <select
                id="user-select"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="membership-role">Role in course</Label>
              <select
                id="membership-role"
                value={membershipRole}
                onChange={(event) => setMembershipRole(event.target.value as IkionUserRole)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <Button className="gap-2" onClick={() => void addMembership()} disabled={isCreating || !selectedWorkspaceId || !selectedUserId}>
            <UserPlus className="h-4 w-4" />
            Assign to Course
          </Button>

          {selectedWorkspaceId && (
            <div className="space-y-3">
              {memberships.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No members are assigned to this course yet.
                </div>
              ) : (
                memberships.map((member) => (
                  <div key={member.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <div>
                      <p className="font-medium">{member.user_full_name ?? member.user_id}</p>
                      <p className="text-xs text-muted-foreground">{member.user_email ?? "Unknown email"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{member.role}</Badge>
                      <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={() => void removeMembership(member.user_id)}>
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
