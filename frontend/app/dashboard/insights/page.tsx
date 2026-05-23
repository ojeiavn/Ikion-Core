"use client"

import { useEffect, useState } from "react"

import { AlertCircle, BarChart3, Clock3, FileText, Layers3, RefreshCw, Video } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { IkionInsights, IkionQueryEvent, formatUtcTimestamp, ikionFetch } from "@/lib/ikion-api"

export default function InsightsPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const [insights, setInsights] = useState<IkionInsights | null>(null)
  const [queries, setQueries] = useState<IkionQueryEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!workspaceId) {
      setIsLoading(false)
      setInsights(null)
      setQueries([])
      return
    }

    const load = async () => {
      setError(null)
      setIsLoading(true)

      try {
        const [queryEvents, summary] = await Promise.all([
          ikionFetch<IkionQueryEvent[]>(`/workspaces/${workspaceId}/queries`),
          ikionFetch<IkionInsights>(`/workspaces/${workspaceId}/insights`),
        ])
        setQueries(queryEvents)
        setInsights(summary)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load insights.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [workspaceId])

  if (isLoading) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading workspace insights...</div>
  }

  if (!workspaceId) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active workspace is selected. Open Admin, create or select a workspace, ingest content, and build a corpus first.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workspace Insights</h1>
          <p className="mt-1 text-muted-foreground">
            Query patterns, weak spots, source usage, and recent activity for the active workspace.
          </p>
        </div>
        <Button variant="outline" className="w-fit gap-2" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {insights && (
        <>
          {(insights.llm_insights?.student_summary || insights.llm_insights?.lecturer_summary) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {insights.llm_insights?.student_summary && (
                <Card className="ikion-neon-card border-accent/25 bg-accent/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Student Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="break-words text-sm text-foreground/90">{insights.llm_insights.student_summary}</p>
                  </CardContent>
                </Card>
              )}
              {insights.llm_insights?.lecturer_summary && (
                <Card className="ikion-neon-card border-accent/25 bg-accent/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Lecturer Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="break-words text-sm text-foreground/90">{insights.llm_insights.lecturer_summary}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total queries</CardDescription>
                <CardTitle className="text-3xl">{insights.query_count}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Weak clusters</CardDescription>
                <CardTitle className="text-3xl">{insights.repeated_weak_queries.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Queried assets</CardDescription>
                <CardTitle className="text-3xl">{insights.most_queried_assets.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Generated</CardDescription>
                <CardTitle className="text-base">{formatUtcTimestamp(insights.generated_at)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Top Topics
                </CardTitle>
                <CardDescription>Most frequent conversation topics across recent queries.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {insights.top_topics.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No topics yet.</p>
                ) : (
                  insights.top_topics.map((topic) => (
                    <Badge key={topic.token} variant="secondary" className="gap-2 px-3 py-1.5">
                      <span className="max-w-[20rem] break-words text-left">{topic.token}</span>
                      <span>{topic.count}</span>
                    </Badge>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4" />
                  Source Type Usage
                </CardTitle>
                <CardDescription>How often each content type appears in retrieval results.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.source_type_usage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No source usage captured yet.</p>
                ) : (
                  insights.source_type_usage.map((row) => (
                    <div key={row.source_type} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-sm font-medium capitalize">{row.source_type}</span>
                      <Badge variant="outline">{row.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {insights.topic_mastery && (
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Strong Topics</CardTitle>
                  <CardDescription>Topics with consistently stronger support and response quality.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {insights.topic_mastery.strong_topics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No strong topics identified yet.</p>
                  ) : (
                    insights.topic_mastery.strong_topics.map((topic) => (
                      <div key={topic.topic} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{topic.topic}</p>
                          <Badge variant="outline">{Math.round((topic.mastery_score ?? 0) * 100)}%</Badge>
                        </div>
                        {topic.reason && <p className="mt-2 text-sm text-muted-foreground">{topic.reason}</p>}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Weak Topics</CardTitle>
                  <CardDescription>Topics that need targeted reinforcement and exam practice.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {insights.topic_mastery.weak_topics.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No weak topics identified yet.</p>
                  ) : (
                    insights.topic_mastery.weak_topics.map((topic) => (
                      <div key={topic.topic} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{topic.topic}</p>
                          <Badge>{Math.round((topic.mastery_score ?? 0) * 100)}%</Badge>
                        </div>
                        {topic.reason && <p className="mt-2 text-sm text-muted-foreground">{topic.reason}</p>}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Repeated Weak Queries
                </CardTitle>
                <CardDescription>Questions that were refused, only partially supported, or repeatedly weakly grounded.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.repeated_weak_queries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No repeated weak query clusters yet.</p>
                ) : (
                  insights.repeated_weak_queries.map((bucket) => (
                    <div key={bucket.bucket} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="break-words font-medium">{bucket.bucket}</p>
                        <Badge variant="secondary">{bucket.count}</Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {bucket.examples.map((example) => (
                          <p key={example} className="text-sm text-muted-foreground">
                            {example}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Most Queried Assets
                </CardTitle>
                <CardDescription>Assets most frequently cited in recent query responses.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.most_queried_assets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cited assets yet.</p>
                ) : (
                  insights.most_queried_assets.map((asset) => (
                    <div key={asset.asset_id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="break-all font-medium">{asset.title ?? asset.asset_id}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          {asset.asset_type ?? "unknown"}
                        </p>
                      </div>
                      <Badge>{asset.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  Recent Query Counts
                </CardTitle>
                <CardDescription>Daily volume from the recent logged events.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {insights.recent_query_counts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No query count data yet.</p>
                ) : (
                  insights.recent_query_counts.map((entry) => (
                    <div key={entry.date} className="flex items-center justify-between rounded-lg border p-3">
                      <span className="text-sm">{entry.date}</span>
                      <Badge variant="outline">{entry.count}</Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Recent Query Log
                </CardTitle>
                <CardDescription>Latest workspace questions with support and playback metadata.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {queries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logged queries yet.</p>
                ) : (
                  queries.map((query) => (
                    <div key={query.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="break-words font-medium">{query.query_text}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            <span className="line-clamp-3 break-words">
                              {query.response_text ?? "No response text logged."}
                            </span>
                          </p>
                        </div>
                        <Badge variant={query.response_status === "answered" ? "default" : "secondary"}>
                          {query.response_status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Support {query.metrics.support_score ?? 0}</span>
                        <span>Latency {query.metrics.latency_ms ?? 0}ms</span>
                        <span>{query.metrics.playback_available ? "Playback available" : "No playback"}</span>
                        <span>{formatUtcTimestamp(query.created_at)}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
