"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { ExamRecommendationCard } from "@/components/exam-recommendation-card"
import { VideoThumbnail } from "@/components/video-thumbnail"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  OrionAsset,
  OrionCorpusInspection,
  OrionInsights,
  OrionQueryEvent,
  OrionWorkspaceSummary,
  formatUtcTimestamp,
  getBackendBaseUrl,
  orionFetch,
} from "@/lib/orion-api"
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  MessageSquare,
  Play,
  TrendingUp,
} from "lucide-react"

const TOPIC_FILLER = new Set(["me", "about", "give", "tell", "please", "what", "how", "why"])
const EMPTY_LOAD_ERRORS: Record<"assets" | "corpus" | "insights" | "queries" | "workspaces", string | null> = {
  assets: null,
  corpus: null,
  insights: null,
  queries: null,
  workspaces: null,
}

function formatCorpusLoadError(message: string) {
  const normalized = message.toLowerCase()
  if (
    normalized.includes("ssl") ||
    normalized.includes("tls") ||
    normalized.includes("oauth2.googleapis.com") ||
    normalized.includes("transporterror") ||
    normalized.includes("drive")
  ) {
    return "Active corpus metadata is temporarily unavailable because Orion could not reach its storage provider."
  }
  return message
}

export default function StudentDashboard() {
  const { workspaceId } = useActiveWorkspaceId()
  const backendBase = useMemo(() => getBackendBaseUrl(), [])
  const [workspaces, setWorkspaces] = useState<OrionWorkspaceSummary[]>([])
  const [assets, setAssets] = useState<OrionAsset[]>([])
  const [queries, setQueries] = useState<OrionQueryEvent[]>([])
  const [insights, setInsights] = useState<OrionInsights | null>(null)
  const [corpusInspection, setCorpusInspection] = useState<OrionCorpusInspection | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState<Record<keyof typeof EMPTY_LOAD_ERRORS, string | null>>(EMPTY_LOAD_ERRORS)

  useEffect(() => {
    const controller = new AbortController()
    let isCurrent = true

    const load = async () => {
      setLoadErrors(EMPTY_LOAD_ERRORS)
      setIsLoading(true)

      try {
        const workspaceList = await orionFetch<OrionWorkspaceSummary[]>("/me/workspaces", {
          signal: controller.signal,
        })
        if (!isCurrent || controller.signal.aborted) return
        setWorkspaces(workspaceList)

        if (!workspaceId) {
          setAssets([])
          setQueries([])
          setInsights(null)
          setCorpusInspection(null)
          return
        }

        const [assetList, queryEvents, summary, corpus] = await Promise.allSettled([
          orionFetch<OrionAsset[]>(`/workspaces/${workspaceId}/assets`, { signal: controller.signal }),
          orionFetch<OrionQueryEvent[]>(`/workspaces/${workspaceId}/queries`, { signal: controller.signal }),
          orionFetch<OrionInsights>(`/workspaces/${workspaceId}/insights`, { signal: controller.signal }),
          orionFetch<OrionCorpusInspection>(`/workspaces/${workspaceId}/corpus/active`, { signal: controller.signal }),
        ])
        if (!isCurrent || controller.signal.aborted) return

        setAssets(assetList.status === "fulfilled" ? assetList.value : [])
        setQueries(queryEvents.status === "fulfilled" ? queryEvents.value : [])
        setInsights(summary.status === "fulfilled" ? summary.value : null)
        setCorpusInspection(corpus.status === "fulfilled" ? corpus.value : null)

        setLoadErrors({
          assets: assetList.status === "rejected" ? (assetList.reason instanceof Error ? assetList.reason.message : "Unable to load lecture assets.") : null,
          corpus:
            corpus.status === "rejected"
              ? formatCorpusLoadError(
                  corpus.reason instanceof Error ? corpus.reason.message : "Unable to inspect the active corpus."
                )
              : null,
          insights: summary.status === "rejected" ? (summary.reason instanceof Error ? summary.reason.message : "Unable to load workspace insights.") : null,
          queries: queryEvents.status === "rejected" ? (queryEvents.reason instanceof Error ? queryEvents.reason.message : "Unable to load recent questions.") : null,
          workspaces: null,
        })
      } catch (err) {
        if (!isCurrent || controller.signal.aborted) return
        setWorkspaces([])
        setAssets([])
        setQueries([])
        setInsights(null)
        setCorpusInspection(null)
        setLoadErrors({
          ...EMPTY_LOAD_ERRORS,
          workspaces: err instanceof Error ? err.message : "Unable to load dashboard data.",
        })
      } finally {
        if (isCurrent && !controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      isCurrent = false
      controller.abort()
    }
  }, [workspaceId])

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces]
  )

  const upcomingLectures = useMemo(
    () =>
      assets
        .filter((asset) => asset.asset_type === "video")
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, 3),
    [assets]
  )

  const revisionTopics = useMemo(() => {
    const llmTopics = insights?.llm_insights?.top_topics ?? []
    const topics =
      llmTopics.length > 0
        ? llmTopics.map((item) => ({ token: item.topic, count: item.count }))
        : (insights?.top_topics ?? []).filter((topic) => !TOPIC_FILLER.has(topic.token.toLowerCase()))
    const maxCount = Math.max(...topics.map((topic) => topic.count), 1)
    return topics.slice(0, 4).map((topic) => ({
      topic: topic.token,
      progress: Math.max(20, Math.round((topic.count / maxCount) * 100)),
    }))
  }, [insights])

  const recentQuestions = useMemo(() => queries.slice(0, 3), [queries])

  const resolveVideoHref = (asset: OrionAsset) => {
    if (workspaceId && asset.content_path) {
      return `${backendBase}/workspaces/${workspaceId}/assets/${asset.id}/content`
    }
    if (asset.external_ref) {
      return asset.external_ref
    }
    return "/dashboard/lectures"
  }

  const recommendedReview = useMemo(() => {
    if (insights?.topic_mastery?.weak_topics?.length) {
      return insights.topic_mastery.weak_topics.slice(0, 2).map((item) => ({
        topic: item.topic,
        reason: `Low mastery score (${Math.round((item.mastery_score ?? 0) * 100)}%)`,
        details: [item.reason ?? "Needs reinforced practice in this workspace topic."],
      }))
    }

    if (insights?.repeated_weak_queries.length) {
      return insights.repeated_weak_queries.slice(0, 2).map((item) => ({
        topic: item.bucket,
        reason: `${item.count} weak or repeated questions`,
        details: item.examples,
      }))
    }

    if (insights?.most_queried_assets.length) {
      return insights.most_queried_assets.slice(0, 2).map((item) => ({
        topic: item.title ?? item.asset_id,
        reason: `${item.count} recent citations`,
        details: [item.asset_type ?? "workspace asset"],
      }))
    }

    return []
  }, [insights])

  const examPrep = insights?.exam_prep ?? null

  const visibleErrors = useMemo(
    () =>
      [
        loadErrors.workspaces ? `Workspaces: ${loadErrors.workspaces}` : null,
        loadErrors.assets ? `Video assets: ${loadErrors.assets}` : null,
        loadErrors.queries ? `Recent questions: ${loadErrors.queries}` : null,
        loadErrors.insights ? `Insights: ${loadErrors.insights}` : null,
        loadErrors.corpus ? `Corpus status: ${loadErrors.corpus}` : null,
      ].filter((message): message is string => Boolean(message)),
    [loadErrors]
  )

  if (isLoading) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading workspace dashboard...</div>
  }

  if (!workspaceId) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active course is selected. Open Courses to pick a workspace before using the dashboard.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="orion-hero-panel mb-8 rounded-[1.8rem] border border-white/50 px-6 py-7 shadow-[0_24px_60px_rgba(83,63,170,0.08)]">
        <h1 className="break-words text-2xl font-bold tracking-tight">
          {activeWorkspace ? `Welcome back to ${activeWorkspace.name}` : "Workspace Dashboard"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {corpusInspection?.database_record
            ? `${corpusInspection.database_record.chunk_count} grounded chunks are active in the current corpus.`
            : "Build the active corpus after ingesting content to unlock grounded retrieval."}
        </p>
        {visibleErrors.length > 0 && (
          <div className="mt-2 space-y-1 text-sm text-destructive">
            {visibleErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <Link href="/dashboard/ask">
          <Button className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Ask Orion
          </Button>
        </Link>
        <Link href="/dashboard/exam-prep">
          <Button variant="outline" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Exam Prep
          </Button>
        </Link>
        <Link href="/dashboard/lectures">
          <Button variant="outline" className="gap-2">
            <Play className="h-4 w-4" />
            Browse Lectures
          </Button>
        </Link>
      </div>

      {insights?.llm_insights?.student_summary && (
        <div className="orion-neon-card rounded-[1.45rem] border border-accent/30 bg-accent/5 p-5">
          <p className="text-xs uppercase tracking-wide text-accent">Student Focus</p>
          <p className="mt-2 break-words text-sm leading-7 text-foreground/90">{insights.llm_insights.student_summary}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card className="orion-surface-card xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Exam Readiness</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Conservative estimate weighted heavily toward marked exam practice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {examPrep ? (
              <>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-3xl font-semibold">{examPrep.readiness_score}%</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{examPrep.proficiency_band}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{examPrep.exam_question_count} question{examPrep.exam_question_count === 1 ? "" : "s"} indexed</p>
                    <p>{examPrep.recent_attempt_count} recent attempt{examPrep.recent_attempt_count === 1 ? "" : "s"}</p>
                  </div>
                </div>
                <Progress value={examPrep.readiness_score} className="h-2" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/55 border-t-transparent bg-background/45 p-3 shadow-none">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Exam Prep</p>
                    <p className="mt-1 text-lg font-semibold">{examPrep.exam_attempt_readiness_score}%</p>
                    <p className="text-xs text-muted-foreground">Primary signal from marked answers and evaluation quality.</p>
                  </div>
                  <div className="rounded-2xl border border-border/55 border-t-transparent bg-background/45 p-3 shadow-none">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Ask Orion</p>
                    <p className="mt-1 text-lg font-semibold">{examPrep.chat_readiness_score}%</p>
                    <p className="text-xs text-muted-foreground">
                      Secondary signal from {examPrep.chat_activity_count} exam-style interaction{examPrep.chat_activity_count === 1 ? "" : "s"}.
                    </p>
                  </div>
                </div>
                <p className="rounded-2xl border border-dashed border-border/70 bg-background/45 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  Orion keeps this intentionally strict. Strong scores require repeated high-quality exam answers, not just confident chat.
                </p>
                {examPrep.focus_topics.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {examPrep.focus_topics.slice(0, 4).map((topic) => (
                      <Badge key={topic} variant="secondary">{topic}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Complete a few exam-practice attempts to unlock tighter focus areas.</p>
                )}
                <Link href="/dashboard/exam-prep">
                  <Button variant="ghost" size="sm" className="w-full gap-1">
                    Open Exam Prep
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Upload exam papers and complete practice attempts to unlock readiness tracking.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="orion-surface-card xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recommended Exam Question</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Past-paper practice matched to what Orion thinks you should tackle next.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {examPrep?.recommended_question ? (
              <>
                <ExamRecommendationCard recommendation={examPrep.recommended_question} compact />
                <Link href="/dashboard/exam-prep">
                  <Button variant="ghost" size="sm" className="w-full gap-1">
                    Practice This Question
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Orion will recommend a targeted question once exam papers are uploaded and your learning profile has enough signal.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="orion-surface-card xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Managed Video Assets</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Latest playback-enabled content in the active workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingLectures.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No video assets are registered yet.
              </div>
            ) : (
              upcomingLectures.map((lecture) => (
                <a
                  key={lecture.id}
                  href={resolveVideoHref(lecture)}
                  target={lecture.content_path || lecture.external_ref ? "_blank" : undefined}
                  rel={lecture.content_path || lecture.external_ref ? "noreferrer" : undefined}
                  className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card/80 p-3 transition-colors hover:border-accent/30 hover:bg-card"
                >
                  <VideoThumbnail
                    asset={lecture}
                    workspaceId={workspaceId}
                    className="h-14 w-24 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lecture.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatUtcTimestamp(lecture.created_at)}</span>
                      <span className="text-border">|</span>
                      <span>{lecture.external_ref ? "External" : "Managed"}</span>
                    </div>
                  </div>
                  <Play className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
                </a>
              ))
            )}
            <Link href="/dashboard/lectures">
              <Button variant="ghost" size="sm" className="mt-2 w-full gap-1">
                View All Lectures
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="orion-surface-card xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Topic Coverage</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Derived from the most frequent recent workspace queries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {revisionTopics.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Ask a few questions to generate topic coverage insights.
              </div>
            ) : (
              revisionTopics.map((item) => (
                <div key={item.topic} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="pr-3 text-sm font-medium break-words">{item.topic}</span>
                    <span className="text-xs text-muted-foreground">{item.progress}%</span>
                  </div>
                  <Progress value={item.progress} className="h-2" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="orion-surface-card xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Questions</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Latest grounded queries for this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentQuestions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No query history yet.
              </div>
            ) : (
              recentQuestions.map((query) => (
                <Link
                  key={query.id}
                  href="/dashboard/ask"
                  className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <p className="line-clamp-2 text-sm font-medium">{query.query_text}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatUtcTimestamp(query.created_at)}</span>
                    {query.metrics.playback_available && (
                      <>
                        <span className="text-border">|</span>
                        <Play className="h-3 w-3" />
                        <span>Playback available</span>
                      </>
                    )}
                  </div>
                </Link>
              ))
            )}
            <Link href="/dashboard/ask">
              <Button variant="ghost" size="sm" className="mt-2 w-full gap-1">
                View All Questions
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="orion-surface-card lg:col-span-2 xl:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Recommended Review</CardTitle>
                <CardDescription>Generated from weak query clusters and heavily cited assets.</CardDescription>
              </div>
              <AlertCircle className="h-4 w-4 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            {recommendedReview.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Review suggestions will appear after Orion has enough query activity to analyze.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {recommendedReview.map((item) => (
                  <div
                    key={item.topic}
                    className="flex items-start gap-4 rounded-lg border border-accent/30 bg-accent/5 p-4"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                      <BookOpen className="h-5 w-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <h4 className="break-all font-medium">{item.topic}</h4>
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.details.map((detail) => (
                          <span
                            key={detail}
                            className="rounded-md bg-background px-2 py-0.5 text-xs font-medium"
                          >
                            {detail}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Link href="/dashboard/ask">
                      <Button size="sm" variant="ghost">
                        Review
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
