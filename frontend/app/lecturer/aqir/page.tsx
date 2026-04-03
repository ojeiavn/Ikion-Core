"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { OrionInsights, OrionQueryEvent, formatUtcTimestamp, orionFetch } from "@/lib/orion-api"
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Calendar,
  Download,
  Lightbulb,
  MessageSquare,
  TrendingUp,
  Users,
} from "lucide-react"
import { toast } from "sonner"

export default function AQIRPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const [limit, setLimit] = useState("200")
  const [queries, setQueries] = useState<OrionQueryEvent[]>([])
  const [insights, setInsights] = useState<OrionInsights | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError(null)
      setIsLoading(true)

      try {
        if (!workspaceId) {
          setQueries([])
          setInsights(null)
          return
        }

        const [queryEvents, summary] = await Promise.all([
          orionFetch<OrionQueryEvent[]>(`/workspaces/${workspaceId}/queries?limit=${limit}`),
          orionFetch<OrionInsights>(`/workspaces/${workspaceId}/insights?limit=${limit}`),
        ])

        setQueries(queryEvents)
        setInsights(summary)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load AQIR analytics.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [workspaceId, limit])

  const confusionBySource = useMemo(() => {
    const counters = new Map<string, number>()
    queries.forEach((query) => {
      if (query.response_status !== "answered") {
        query.retrieval.forEach((row) => {
          counters.set(row.asset_type, (counters.get(row.asset_type) ?? 0) + 1)
        })
      }
    })

    return Array.from(counters.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((left, right) => right.count - left.count)
  }, [queries])

  const suggestedInterventions = useMemo(() => {
    return (
      insights?.repeated_weak_queries.slice(0, 5).map((item) => ({
        title: item.bucket,
        description: item.examples.join(" • "),
        priority: item.count >= 4 ? "high" : "medium",
        affectedStudents: item.count,
      })) ?? []
    )
  }, [insights])

  const exportReport = async () => {
    if (!insights) return

    try {
      await navigator.clipboard.writeText(JSON.stringify(insights, null, 2))
      toast.success("AQIR summary copied as JSON.")
    } catch {
      toast.error("Unable to copy AQIR summary.")
    }
  }

  if (isLoading) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading analytics dashboard...</div>
  }

  if (!workspaceId) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active workspace is selected. Open Admin and choose a workspace first.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automated Query Insight Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Workspace analytics driven by query logs, retrieval signals, and support strength.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3">
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="w-[160px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">Recent 50</SelectItem>
              <SelectItem value="100">Recent 100</SelectItem>
              <SelectItem value="200">Recent 200</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => void exportReport()}>
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {insights?.llm_insights?.lecturer_summary && (
        <Card className="orion-neon-card border-accent/25 bg-accent/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Lecturer Strategy Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="break-words text-sm text-foreground/90">{insights.llm_insights.lecturer_summary}</p>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Queries</span>
            </div>
            <p className="mt-2 text-3xl font-bold">{insights?.query_count ?? 0}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-chart-2">
              <ArrowUpRight className="h-3 w-3" />
              <span>Across the selected window</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Playback Available</span>
            </div>
            <p className="mt-2 text-3xl font-bold">
              {queries.filter((query) => query.metrics.playback_available).length}
            </p>
            <div className="mt-1 flex items-center gap-1 text-xs text-chart-2">
              <ArrowUpRight className="h-3 w-3" />
              <span>Queries with linked playback evidence</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Confusion Clusters</span>
            </div>
            <p className="mt-2 text-3xl font-bold">{insights?.repeated_weak_queries.length ?? 0}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <ArrowUpRight className="h-3 w-3" />
              <span>Weak or repeated buckets</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Top Topic</span>
            </div>
            <p className="mt-2 break-words text-2xl font-bold">{insights?.top_topics[0]?.token ?? "-"}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-chart-2">
              <ArrowUpRight className="h-3 w-3" />
              <span>{insights?.top_topics[0]?.count ?? 0} mentions</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="concepts">Misunderstood Concepts</TabsTrigger>
          <TabsTrigger value="queries">Example Queries</TabsTrigger>
          <TabsTrigger value="interventions">Suggested Interventions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Question Distribution by Topic</CardTitle>
                <CardDescription>Most frequent query tokens from the active workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(insights?.top_topics ?? []).map((item) => {
                  const maxCount = Math.max(...(insights?.top_topics ?? []).map((topic) => topic.count), 1)
                  const percentage = Math.round((item.count / maxCount) * 100)
                  return (
                    <div key={item.token} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="pr-3 font-medium break-words">{item.token}</span>
                        <span className="text-muted-foreground">{item.count} queries</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Weak Query Heatmap by Source Type</CardTitle>
                <CardDescription>Where refused and partial answers concentrate.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {confusionBySource.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No weak query signal yet.</p>
                  ) : (
                    confusionBySource.map((entry) => {
                      const intensity = Math.min(entry.count / Math.max(confusionBySource[0]?.count ?? 1, 1), 1)
                      return (
                        <div
                          key={entry.source}
                          className="flex aspect-square flex-col items-center justify-center rounded-lg p-2 text-center"
                          style={{
                            backgroundColor: `oklch(${0.88 - intensity * 0.35} ${0.08 + intensity * 0.15} 27)`,
                          }}
                        >
                          <span className="text-xs font-medium capitalize">{entry.source}</span>
                          <span className="text-lg font-bold">{entry.count}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="concepts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Misunderstood Concepts</CardTitle>
              <CardDescription>Repeated weak buckets inferred from response quality and support score.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(insights?.repeated_weak_queries ?? []).map((item) => (
                  <div
                    key={item.bucket}
                    className={`rounded-lg border p-4 ${item.count >= 4 ? "border-destructive/30 bg-destructive/5" : "border-accent/30 bg-accent/5"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="break-words font-semibold">{item.bucket}</h4>
                          <Badge variant={item.count >= 4 ? "destructive" : "secondary"}>
                            {item.count >= 4 ? "high" : "medium"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.count} related weak queries
                        </p>
                        <div className="mt-3 space-y-1">
                          {item.examples.map((example) => (
                            <p key={example} className="break-words text-sm text-muted-foreground">
                              {example}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Example Student Queries</CardTitle>
              <CardDescription>Anonymized recent workspace questions and their current support status.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {queries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No query events logged yet.</p>
                ) : (
                  queries.slice(0, 12).map((query) => (
                    <div key={query.id} className="rounded-lg border border-border p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                          {query.cited_asset_ids.length}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="break-words text-sm font-medium">{query.query_text}</p>
                            <Badge variant={query.response_status === "answered" ? "default" : "secondary"}>
                              {query.response_status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatUtcTimestamp(query.created_at)} • support {query.metrics.support_score ?? 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interventions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggested Interventions</CardTitle>
              <CardDescription>Operational actions inferred from the strongest weak-query clusters.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {suggestedInterventions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No intervention recommendations yet.</p>
              ) : (
                suggestedInterventions.map((item) => (
                  <div key={item.title} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-accent" />
                          <h4 className="font-medium">{item.title}</h4>
                          <Badge variant={item.priority === "high" ? "destructive" : "secondary"}>
                            {item.priority}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{item.affectedStudents} related query events</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
