"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { OrionWorkspaceSummary, orionFetch } from "@/lib/orion-api"
import { setActiveWorkspaceId } from "@/lib/workspace-store"

export default function StudentCoursesPage() {
  const { workspaceId, refreshWorkspaceId } = useActiveWorkspaceId()
  const [courses, setCourses] = useState<OrionWorkspaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError(null)
      setIsLoading(true)
      try {
        const workspaceList = await orionFetch<OrionWorkspaceSummary[]>("/me/workspaces")
        setCourses(workspaceList)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load courses.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  const activeCourse = useMemo(
    () => courses.find((course) => course.id === workspaceId) ?? null,
    [courses, workspaceId]
  )

  if (isLoading) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading courses...</div>
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Your Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Select the course you want to study. Orion will use the active course for answers and playback.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {courses.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            You are not assigned to any courses yet. Contact an administrator to get added.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const isActive = course.id === activeCourse?.id
            return (
              <Card key={course.id} className={isActive ? "border-primary/50" : ""}>
                <CardHeader>
                  <CardTitle className="text-base">{course.name}</CardTitle>
                  <CardDescription>{course.description || "No description provided."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Role: {course.membership_role}
                  </div>
                  <Button
                    variant={isActive ? "secondary" : "default"}
                    onClick={() => {
                      setActiveWorkspaceId(course.id)
                      refreshWorkspaceId()
                    }}
                    className="w-full"
                  >
                    {isActive ? "Active Course" : "Set Active"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {activeCourse && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next Step</CardTitle>
            <CardDescription>Jump into Orion using the active course.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/dashboard/ask">
              <Button>Ask Orion</Button>
            </Link>
            <Link href="/dashboard/lectures">
              <Button variant="outline">Browse Lectures</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
