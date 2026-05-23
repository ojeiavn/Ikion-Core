"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

import { PlaybackMomentsPanel } from "@/components/playback-moments-panel"
import { VideoPlayerCard } from "@/components/video-player-card"
import { VideoThumbnail } from "@/components/video-thumbnail"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  IkionAsset,
  IkionInsights,
  IkionPlayback,
  formatUtcTimestamp,
  getBackendBaseUrl,
  ikionFetch,
} from "@/lib/ikion-api"
import { Calendar, ExternalLink, Search, Sparkles } from "lucide-react"

function formatPlaybackTimestamp(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "00:00"
  const total = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function canUseProxyPlayback(asset: IkionAsset) {
  if (asset.content_path) return true
  if (typeof asset.metadata?.drive_file_id === "string" && asset.metadata.drive_file_id) return true

  if (!asset.external_ref) return false
  try {
    const url = new URL(asset.external_ref)
    return url.hostname.includes("drive.google.com") || url.hostname.includes("googleusercontent.com")
  } catch {
    return false
  }
}

type LectureTranscriptState = {
  status: "missing" | "queued" | "processing" | "ready" | "failed" | "unsupported"
  linkedTranscriptAssetId: string | null
  error: string | null
}

function getLectureTranscriptState(asset: IkionAsset, transcriptVideoIds: Set<string>): LectureTranscriptState {
  const linkedTranscriptAssetId =
    typeof asset.metadata?.linked_transcript_asset_id === "string" ? asset.metadata.linked_transcript_asset_id : null
  const autoStatusRaw =
    typeof asset.metadata?.auto_transcript_status === "string" ? asset.metadata.auto_transcript_status : ""
  const autoStatus = autoStatusRaw.trim().toLowerCase()
  const autoError = typeof asset.metadata?.auto_transcript_error === "string" ? asset.metadata.auto_transcript_error : null

  if (transcriptVideoIds.has(asset.id) || linkedTranscriptAssetId || autoStatus === "ready") {
    return { status: "ready", linkedTranscriptAssetId, error: null }
  }
  if (autoStatus === "queued") {
    return { status: "queued", linkedTranscriptAssetId, error: null }
  }
  if (autoStatus === "processing") {
    return { status: "processing", linkedTranscriptAssetId, error: null }
  }
  if (autoStatus === "unsupported_external_only") {
    return { status: "unsupported", linkedTranscriptAssetId, error: autoError }
  }
  if (autoStatus === "failed") {
    return { status: "failed", linkedTranscriptAssetId, error: autoError }
  }
  return { status: "missing", linkedTranscriptAssetId, error: autoError }
}

export default function LecturesPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const backendBase = useMemo(() => getBackendBaseUrl(), [])
  const [searchQuery, setSearchQuery] = useState("")
  const [assets, setAssets] = useState<IkionAsset[]>([])
  const [insights, setInsights] = useState<IkionInsights | null>(null)
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null)
  const [transcriptQuery, setTranscriptQuery] = useState("")
  const [transcriptResults, setTranscriptResults] = useState<IkionPlayback[]>([])
  const [isSearchingMoments, setIsSearchingMoments] = useState(false)
  const [isGeneratingTranscript, setIsGeneratingTranscript] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError(null)
      setIsLoading(true)

      try {
        if (!workspaceId) {
          setAssets([])
          setInsights(null)
          return
        }

        const [assetList, summary] = await Promise.all([
          ikionFetch<IkionAsset[]>(`/workspaces/${workspaceId}/assets`),
          ikionFetch<IkionInsights>(`/workspaces/${workspaceId}/insights`),
        ])

        setAssets(assetList)
        setInsights(summary)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load lecture assets.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [workspaceId])

  const usageByAssetId = useMemo(
    () => new Map((insights?.most_queried_assets ?? []).map((asset) => [asset.asset_id, asset.count])),
    [insights]
  )

  const transcriptVideoIds = useMemo(() => {
    const linkedIds = assets
      .filter((asset) => asset.asset_type === "transcript")
      .map((asset) => {
        const linked = asset.metadata?.linked_video_asset_id
        return typeof linked === "string" ? linked : null
      })
      .filter((value): value is string => Boolean(value))
    return new Set(linkedIds)
  }, [assets])

  const lectureAssets = useMemo(
    () =>
      assets
        .filter((asset) => asset.asset_type === "video")
        .filter((asset) => {
          const haystack = `${asset.title} ${asset.external_ref ?? ""} ${asset.content_path ?? ""}`.toLowerCase()
          return haystack.includes(searchQuery.toLowerCase())
        })
        .sort((left, right) => right.created_at.localeCompare(left.created_at)),
    [assets, searchQuery]
  )

  useEffect(() => {
    setSelectedLectureId((current) =>
      current && lectureAssets.some((asset) => asset.id === current) ? current : lectureAssets[0]?.id ?? null
    )
  }, [lectureAssets])

  const selectedLecture = useMemo(
    () => lectureAssets.find((lecture) => lecture.id === selectedLectureId) ?? null,
    [lectureAssets, selectedLectureId]
  )

  const selectedLectureTranscriptState = useMemo(
    () => (selectedLecture ? getLectureTranscriptState(selectedLecture, transcriptVideoIds) : null),
    [selectedLecture, transcriptVideoIds]
  )

  const refreshLectureAssets = async () => {
    if (!workspaceId) return
    const assetList = await ikionFetch<IkionAsset[]>(`/workspaces/${workspaceId}/assets`, { timeoutMs: 20000 })
    setAssets(assetList)
  }

  const selectedLecturePlayback = useMemo(() => {
    if (!selectedLecture || !workspaceId) return null
    const videoUrl = canUseProxyPlayback(selectedLecture)
      ? `${backendBase}/workspaces/${workspaceId}/assets/${selectedLecture.id}/content`
      : null
    return {
      title: selectedLecture.title,
      timestamp: "00:00",
      videoUrl,
      externalUrl: selectedLecture.external_ref,
      startAtSeconds: 0,
      summary:
        selectedLectureTranscriptState?.status === "ready"
          ? "Use transcript search to jump directly to the most relevant lecture moments."
          : selectedLectureTranscriptState?.status === "queued" || selectedLectureTranscriptState?.status === "processing"
            ? "Ikion is generating a timestamped transcript for this lecture now."
            : selectedLectureTranscriptState?.status === "unsupported"
              ? "This lecture is externally referenced only. Upload the lecture media or add a manual transcript to unlock transcript search."
              : "Generate or register a timestamped transcript for this lecture to unlock transcript query search.",
    }
  }, [backendBase, selectedLecture, selectedLectureTranscriptState, workspaceId])

  useEffect(() => {
    if (!workspaceId || !selectedLecture || !selectedLectureTranscriptState) return
    if (!["queued", "processing"].includes(selectedLectureTranscriptState.status)) return

    const intervalId = window.setInterval(() => {
      void refreshLectureAssets().catch(() => {})
    }, 5000)
    return () => window.clearInterval(intervalId)
  }, [workspaceId, selectedLecture, selectedLectureTranscriptState])

  const handleGenerateTranscript = async () => {
    if (!workspaceId || !selectedLecture) return
    setIsGeneratingTranscript(true)
    setTranscriptError(null)
    try {
      await ikionFetch<{ status: string; scheduled: boolean; linked_transcript_asset_id: string | null; error: string | null }>(
        `/workspaces/${workspaceId}/videos/${selectedLecture.id}/transcript/generate`,
        {
          method: "POST",
          timeoutMs: 20000,
        }
      )
      await refreshLectureAssets()
    } catch (err) {
      setTranscriptError(err instanceof Error ? err.message : "Unable to generate a transcript for this lecture.")
    } finally {
      setIsGeneratingTranscript(false)
    }
  }

  const handleTranscriptSearch = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!workspaceId || !selectedLecture || !transcriptQuery.trim()) return
    setIsSearchingMoments(true)
    setTranscriptError(null)
    try {
      const results = await ikionFetch<IkionPlayback[]>(`/workspaces/${workspaceId}/playback/search`, {
        method: "POST",
        body: JSON.stringify({
          query: transcriptQuery.trim(),
          video_asset_id: selectedLecture.id,
          top_k: 3,
        }),
      })
      setTranscriptResults(results)
    } catch (err) {
      setTranscriptResults([])
      setTranscriptError(err instanceof Error ? err.message : "Unable to search this lecture transcript.")
    } finally {
      setIsSearchingMoments(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Lecture Explorer</h1>
        <p className="mt-1 text-muted-foreground">
          Watch lectures, search timestamped transcripts, and jump straight to the most relevant moments.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {!workspaceId ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active course is selected. Open Courses to pick one first.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search lecture titles or source links..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {selectedLecture && selectedLecturePlayback && (
            <Card className="mb-8">
              <CardHeader className="pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg">{selectedLecture.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Transcript query search surfaces the three strongest lecture moments for what you are looking for.
                    </p>
                  </div>
                  {selectedLecture.external_ref && (
                    <a href={selectedLecture.external_ref} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        Open source
                      </Button>
                    </a>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <VideoPlayerCard
                  title={selectedLecturePlayback.title}
                  timestamp={selectedLecturePlayback.timestamp}
                  videoUrl={selectedLecturePlayback.videoUrl}
                  externalUrl={selectedLecturePlayback.externalUrl}
                  startAtSeconds={selectedLecturePlayback.startAtSeconds}
                  summary={selectedLecturePlayback.summary}
                />

                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 text-accent" />
                      Find in this lecture
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ask about a concept, derivation, worked example, or exam topic and Ikion will pull the top 3 matching lecture moments.
                    </p>
                    <form onSubmit={handleTranscriptSearch} className="mt-4 space-y-3">
                      <Input
                        value={transcriptQuery}
                        onChange={(event) => setTranscriptQuery(event.target.value)}
                        placeholder={
                          selectedLectureTranscriptState?.status === "ready"
                            ? "e.g. Where does the lecture explain MPI scatter vs gather?"
                            : selectedLectureTranscriptState?.status === "queued" || selectedLectureTranscriptState?.status === "processing"
                              ? "Transcript generation is in progress for this lecture..."
                              : "Generate a timestamped transcript for this lecture to enable transcript search"
                        }
                        disabled={selectedLectureTranscriptState?.status !== "ready" || isSearchingMoments}
                      />
                      <Button
                        type="submit"
                        className="w-full gap-2"
                        disabled={selectedLectureTranscriptState?.status !== "ready" || !transcriptQuery.trim() || isSearchingMoments}
                      >
                        <Search className="h-4 w-4" />
                        {isSearchingMoments ? "Searching transcript..." : "Find top 3 moments"}
                      </Button>
                    </form>
                    {selectedLectureTranscriptState?.status !== "ready" && (
                      <div className="mt-3 rounded-xl border border-border/70 bg-background/40 p-3">
                        <p className="text-sm text-muted-foreground">
                          {selectedLectureTranscriptState?.status === "queued" || selectedLectureTranscriptState?.status === "processing"
                            ? "Ikion is generating the timed transcript for this lecture. This panel will unlock automatically when it is ready."
                            : selectedLectureTranscriptState?.status === "unsupported"
                              ? selectedLectureTranscriptState.error || "This lecture needs an uploaded media file or a manual linked transcript before transcript search can work."
                              : selectedLectureTranscriptState?.status === "failed"
                                ? selectedLectureTranscriptState.error || "Transcript generation failed for this lecture."
                                : "This lecture does not have a timestamped transcript yet."}
                        </p>
                        {selectedLectureTranscriptState?.status !== "unsupported" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full"
                            onClick={handleGenerateTranscript}
                            disabled={isGeneratingTranscript || selectedLectureTranscriptState?.status === "queued" || selectedLectureTranscriptState?.status === "processing"}
                          >
                            {isGeneratingTranscript
                              ? "Starting transcript generation..."
                              : selectedLectureTranscriptState?.status === "failed"
                                ? "Retry transcript generation"
                                : selectedLectureTranscriptState?.status === "queued" || selectedLectureTranscriptState?.status === "processing"
                                  ? "Transcript generation in progress"
                                  : "Generate timed transcript"}
                          </Button>
                        )}
                      </div>
                    )}
                    {transcriptError && <p className="mt-3 text-sm text-destructive">{transcriptError}</p>}
                  </div>

                  {transcriptResults.length > 0 ? (
                    <PlaybackMomentsPanel
                      segments={transcriptResults}
                      title="Top matching moments"
                      description="These are the strongest timestamped transcript matches inside the selected lecture."
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                      {selectedLectureTranscriptState?.status === "ready"
                        ? "Search the transcript to reveal the three most relevant moments for this lecture."
                        : selectedLectureTranscriptState?.status === "queued" || selectedLectureTranscriptState?.status === "processing"
                          ? "Transcript generation is in progress. Ikion will unlock the top matching moments as soon as the transcript is ready."
                          : "This lecture does not have a linked timestamped transcript yet."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading lecture assets...</div>
          ) : lectureAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 font-semibold">No lecture assets found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Register video assets in Admin to populate this view.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {lectureAssets.map((lecture) => {
                const usageCount = usageByAssetId.get(lecture.id) ?? 0
                const isSelected = lecture.id === selectedLectureId
                const hasTranscript = transcriptVideoIds.has(lecture.id)
                return (
                  <button
                    key={lecture.id}
                    type="button"
                    onClick={() => {
                      setSelectedLectureId(lecture.id)
                      setTranscriptResults([])
                      setTranscriptError(null)
                    }}
                    className="text-left"
                  >
                    <Card className={isSelected ? "border-accent/40 shadow-[0_0_0_1px_rgba(134,99,255,0.16)]" : ""}>
                      <div className="p-4 pb-0">
                        <VideoThumbnail asset={lecture} workspaceId={workspaceId} className="aspect-video w-full" />
                      </div>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="line-clamp-2 font-semibold leading-tight">{lecture.title}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                {formatUtcTimestamp(lecture.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{usageCount} cites</Badge>
                          <Badge variant={hasTranscript ? "default" : "outline"}>
                            {hasTranscript ? "Transcript ready" : "No transcript"}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
