"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { IkionInsights, IkionQueryEvent, IkionWorkspaceSummary, formatUtcTimestamp, ikionFetch } from "@/lib/ikion-api"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronRight,
  Clock,
  HelpCircle,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react"

export default function LecturerDashboard() {
  const { workspaceId } = useActiveWorkspaceId()
  const [workspaces, setWorkspaces] = useState<IkionWorkspaceSummary[]>([])
  const [queries, setQueries] = useState<IkionQueryEvent[]>([])
  const [insights, setInsights] = useState<IkionInsights | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError(null)
      setIsLoading(true)

      try {
        const workspaceList = await ikionFetch<IkionWorkspaceSummary[]>("/me/workspaces")
        setWorkspaces(workspaceList)

        if (!workspaceId) {
          setQueries([])
          setInsights(null)
          return
        }

        const [queryEvents, summary] = await Promise.all([
          ikionFetch<IkionQueryEvent[]>(`/workspaces/${workspaceId}/queries`),
          ikionFetch<IkionInsights>(`/workspaces/${workspaceId}/insights`),
        ])

        setQueries(queryEvents)
        setInsights(summary)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load lecturer dashboard.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [workspaceId])

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces]
  )

  const stats = useMemo(() => {
    const totalQueries = insights?.query_count ?? 0
    const activeDays = insights?.recent_query_counts.length ?? 0
    const avgQuestions = activeDays > 0 ? (totalQueries / activeDays).toFixed(1) : "0"
    const weakClusters = insights?.repeated_weak_queries.length ?? 0
    const playbackQueries = queries.filter((query) => query.metrics.playback_available).length

    return [
      { label: "Total Questions", value: totalQueries.toString(), icon: MessageSquare, accent: "default" as const },
      { label: "Playback Queries", value: playbackQueries.toString(), icon: Users, accent: "secondary" as const },
      { label: "Avg. Questions/Day", value: avgQuestions, icon: TrendingUp, accent: "default" as const },
      { label: "Topics Flagged", value: weakClusters.toString(), icon: AlertTriangle, accent: weakClusters > 0 ? "destructive" as const : "secondary" as const },
    ]
  }, [insights, queries])

  const topQuestions = useMemo(
    () =>
      insights?.repeated_weak_queries.map((item) => ({
        question: item.examples[0] ?? item.bucket,
        count: item.count,
        topic: item.bucket,
      })) ??
      [],
    [insights]
  )

  const misconceptionClusters = useMemo(
    () =>
      insights?.repeated_weak_queries.slice(0, 3).map((item) => ({
        topic: item.bucket,
        severity: item.count >= 4 ? "high" : "medium",
        studentCount: item.count,
        description: item.examples.join(" • "),
      })) ?? [],
    [insights]
  )

  const recentActivity = useMemo(
    () =>
      queries.slice(0, 4).map((query) => ({
        time: formatUtcTimestamp(query.created_at),
        event: `${query.response_status.toUpperCase()}: ${query.query_text}`,
      })),
    [queries]
  )

  if (isLoading) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading lecturer dashboard...</div>
  }

  if (!workspaceId) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active course is selected. Open Courses to pick a workspace first.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lecturer Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            {activeWorkspace ? `${activeWorkspace.name} — overview` : "Active workspace overview"}
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3">
          <Link href="/lecturer/aqir">
            <Button variant="outline" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              View Full Report
            </Button>
          </Link>
          <Link href="/lecturer/guidance">
            <Button className="gap-2">
              Edit Guidance
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {insights?.llm_insights?.lecturer_summary && (
        <Card className="ikion-neon-card border-accent/25 bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Teaching Focus This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="break-words text-sm text-foreground/90">{insights.llm_insights.lecturer_summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <stat.icon className="h-5 w-5 text-accent" />
                </div>
                <Badge variant={stat.accent}>{stat.label}</Badge>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Most Common Questions</CardTitle>
                <CardDescription>Recurring weak-query buckets and examples.</CardDescription>
              </div>
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {topQuestions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No repeated question patterns yet.
              </div>
            ) : (
              topQuestions.map((question, index) => (
                <div key={`${question.topic}-${index}`} className="flex items-center gap-4 rounded-lg border border-border p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-medium">{question.question}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="secondary" className="max-w-[14rem] break-words text-xs">{question.topic}</Badge>
                      <span className="text-xs text-muted-foreground">{question.count} times</span>
                    </div>
                  </div>
                  <TrendingUp className="h-4 w-4 text-chart-1" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Misconception Clusters</CardTitle>
                <CardDescription>Weak or partially supported themes worth intervention.</CardDescription>
              </div>
              <AlertTriangle className="h-5 w-5 text-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {misconceptionClusters.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No misconception clusters identified yet.
              </div>
            ) : (
              misconceptionClusters.map((cluster) => (
                <div
                  key={cluster.topic}
                  className={`rounded-lg border p-4 ${
                    cluster.severity === "high"
                      ? "border-destructive/30 bg-destructive/5"
                      : "border-accent/30 bg-accent/5"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="break-words font-medium">{cluster.topic}</h4>
                        <Badge variant={cluster.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                          {cluster.severity}
                        </Badge>
                      </div>
                      <p className="mt-1 break-words text-sm text-muted-foreground">{cluster.description}</p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{cluster.studentCount} related events</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            <Link href="/lecturer/aqir">
              <Button variant="ghost" size="sm" className="w-full gap-1">
                View All Insights
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>Latest logged query events in the workspace.</CardDescription>
              </div>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-4">
              {recentActivity.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No recent activity yet.
                </div>
              ) : (
                recentActivity.map((activity, index) => (
                  <div key={`${activity.time}-${index}`} className="flex gap-4">
                    <div className="relative flex flex-col items-center">
                      <div className="h-2 w-2 rounded-full bg-accent" />
                      {index < recentActivity.length - 1 && (
                        <div className="absolute top-2 h-full w-px bg-border" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="break-words text-sm">{activity.event}</p>
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
