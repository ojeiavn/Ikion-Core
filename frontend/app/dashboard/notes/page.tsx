"use client"

import { useEffect, useMemo, useState } from "react"

import { useAuth } from "@/components/auth-provider"
import { FormattedRichText } from "@/components/formatted-rich-text"
import { VideoThumbnail } from "@/components/video-thumbnail"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  IkionAsset,
  IkionInsights,
  IkionQueryEvent,
  IkionTopicNotesResponse,
  formatUtcTimestamp,
  ikionFetch,
} from "@/lib/ikion-api"
import {
  Calendar,
  Copy,
  FileText,
  Search,
  Sparkles,
  StickyNote,
  Video,
} from "lucide-react"
import { toast } from "sonner"

const TOPIC_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "answer",
  "answers",
  "because",
  "between",
  "could",
  "define",
  "describe",
  "does",
  "exam",
  "from",
  "give",
  "have",
  "into",
  "just",
  "like",
  "more",
  "need",
  "notes",
  "ikion",
  "please",
  "question",
  "questions",
  "show",
  "tell",
  "than",
  "that",
  "them",
  "these",
  "they",
  "this",
  "topic",
  "understand",
  "using",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
])

interface TopicCluster {
  id: string
  label: string
  summary: string
  brief: string
  keywords: string[]
  notes: IkionQueryEvent[]
  topAssets: Array<{ id: string; title: string; asset_type: string; status?: string }>
  lastUpdated: string
  playbackCount: number
  graphLabel: string | null
  representativeQuestions: string[]
}

interface TopicSeed {
  id: string
  label: string
  keywords: string[]
  assetIds: string[]
  examples: string[]
  graphLabel: string | null
}

function extractKeywords(...values: Array<string | null | undefined>) {
  const tokens = values
    .join(" ")
    .toLowerCase()
    .match(/[a-z][a-z0-9-]+/g)

  if (!tokens) return []

  return Array.from(
    new Set(tokens.filter((token) => token.length > 2 && !TOPIC_STOPWORDS.has(token)))
  )
}

function formatTopicToken(token: string) {
  return token
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-")
}

function buildTopicLabel(keywords: string[], notes: IkionQueryEvent[]) {
  if (keywords.length > 0) {
    return keywords.slice(0, 3).map(formatTopicToken).join(" / ")
  }

  const fallback = notes[0]?.query_text ?? "Untitled Topic"
  return fallback.length > 56 ? `${fallback.slice(0, 53)}...` : fallback
}

function seedKeywords(...values: Array<string | null | undefined>) {
  return extractKeywords(...values).slice(0, 12)
}

function buildTopicSeeds(insights: IkionInsights | null) {
  if (!insights) return []

  const graphTopics = insights.graph_topics ?? []
  const graphTopicSeeds: TopicSeed[] = graphTopics.map((topic) => ({
    id: topic.topic_id,
    label: topic.label,
    keywords: seedKeywords(topic.label, ...(topic.top_terms ?? [])),
    assetIds: [],
    examples: [],
    graphLabel: topic.label,
  }))

  const queryClusterSeeds: TopicSeed[] = (insights.query_clusters ?? []).map((cluster) => {
    const clusterKeywords = seedKeywords(
      cluster.label,
      ...(cluster.top_terms ?? []),
      ...(cluster.examples ?? []),
    )
    const graphMatch =
      graphTopics.find((topic) =>
        (topic.top_terms ?? []).some((term) => clusterKeywords.includes(term.toLowerCase()))
      ) ?? null

    return {
      id: cluster.cluster_id,
      label: cluster.label,
      keywords: clusterKeywords,
      assetIds: (cluster.top_assets ?? []).map((asset) => asset.asset_id),
      examples: (cluster.examples ?? []).slice(0, 3),
      graphLabel: graphMatch?.label ?? null,
    }
  })

  const seedMap = new Map<string, TopicSeed>()
  for (const seed of [...queryClusterSeeds, ...graphTopicSeeds]) {
    if (!seedMap.has(seed.id)) {
      seedMap.set(seed.id, seed)
    }
  }
  return Array.from(seedMap.values())
}

function scoreTopicSeed(keywords: string[], assetIds: string[], seed: TopicSeed) {
  const keywordOverlap = keywords.filter((keyword) => seed.keywords.includes(keyword)).length
  const assetOverlap = assetIds.filter((assetId) => seed.assetIds.includes(assetId)).length
  const exampleOverlap = seed.examples.reduce((score, example) => {
    const exampleKeywords = seedKeywords(example)
    return score + keywords.filter((keyword) => exampleKeywords.includes(keyword)).length
  }, 0)
  return (assetOverlap * 4) + (keywordOverlap * 3) + (exampleOverlap * 2) + (seedKeywords(seed.label).filter((keyword) => keywords.includes(keyword)).length * 2)
}

function buildTopicClusters(
  notes: IkionQueryEvent[],
  assetsById: Map<string, IkionAsset>,
  insights: IkionInsights | null,
) {
  type MutableCluster = {
    id: string
    notes: IkionQueryEvent[]
    keywordCounts: Map<string, number>
    assetCounts: Map<string, number>
    playbackCount: number
    seed: TopicSeed | null
  }

  const sortedNotes = [...notes].sort((left, right) => right.created_at.localeCompare(left.created_at))
  const clusters: MutableCluster[] = []
  const seeds = buildTopicSeeds(insights)

  for (const note of sortedNotes) {
    const keywords = extractKeywords(note.query_text, note.response_text)
    const assetIds = Array.from(new Set(note.cited_asset_ids))

    let bestSeed: TopicSeed | null = null
    let bestSeedScore = 0

    for (const seed of seeds) {
      const score = scoreTopicSeed(keywords, assetIds, seed)
      if (score > bestSeedScore) {
        bestSeedScore = score
        bestSeed = seed
      }
    }

    let bestCluster: MutableCluster | null = null
    let bestScore = 0

    for (const cluster of clusters) {
      if (bestSeed && cluster.seed?.id === bestSeed.id) {
        bestCluster = cluster
        bestScore = Number.POSITIVE_INFINITY
        break
      }
      const keywordOverlap = keywords.filter((keyword) => cluster.keywordCounts.has(keyword)).length
      const assetOverlap = assetIds.filter((assetId) => cluster.assetCounts.has(assetId)).length
      const score = keywordOverlap * 2 + assetOverlap * 3
      if (score > bestScore) {
        bestScore = score
        bestCluster = cluster
      }
    }

    if (!bestCluster || bestScore < 2) {
      bestCluster = {
        id: bestSeed?.id ?? note.id,
        notes: [],
        keywordCounts: new Map<string, number>(),
        assetCounts: new Map<string, number>(),
        playbackCount: 0,
        seed: bestSeedScore >= 3 ? bestSeed : null,
      }
      clusters.push(bestCluster)
    }

    bestCluster.notes.push(note)
    if (note.playback) bestCluster.playbackCount += 1

    keywords.forEach((keyword) => {
      bestCluster?.keywordCounts.set(keyword, (bestCluster?.keywordCounts.get(keyword) ?? 0) + 1)
    })
    assetIds.forEach((assetId) => {
      bestCluster?.assetCounts.set(assetId, (bestCluster?.assetCounts.get(assetId) ?? 0) + 1)
    })
  }

  return clusters
    .map<TopicCluster>((cluster) => {
      const keywords = Array.from(cluster.keywordCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([keyword]) => keyword)
        .slice(0, 6)

      const topAssets = Array.from(cluster.assetCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([assetId]) => assetsById.get(assetId))
        .filter((asset): asset is IkionAsset => Boolean(asset))
        .map((asset) => ({ id: asset.id, title: asset.title, asset_type: asset.asset_type, status: asset.status }))
        .slice(0, 4)

      const label = cluster.seed?.label || buildTopicLabel(keywords, cluster.notes)
      const summary = cluster.seed
        ? `Knowledge-graph cluster built from ${cluster.notes.length} grounded Ikion ${cluster.notes.length === 1 ? "answer" : "answers"} around ${label.toLowerCase()}.`
        : `Built from ${cluster.notes.length} grounded Ikion ${cluster.notes.length === 1 ? "answer" : "answers"} around ${label.toLowerCase()}.`
      const briefSections = [
        "Topic Brief",
        `This topic groups ${cluster.notes.length} personal Ikion ${cluster.notes.length === 1 ? "answer" : "answers"} that revolve around ${label.toLowerCase()}.`,
        cluster.seed?.graphLabel ? `Knowledge-graph anchor\n\n- ${cluster.seed.graphLabel}` : "",
        cluster.seed?.examples.length ? "Representative queries" : "",
        ...(cluster.seed?.examples ?? []).map((example) => `- ${example}`),
        keywords.length > 0 ? "Key themes" : "",
        ...keywords.slice(0, 5).map((keyword) => `- ${formatTopicToken(keyword)}`),
        topAssets.length > 0 ? "Most referenced materials" : "",
        ...topAssets.slice(0, 3).map((asset) => `- ${asset.title}`),
        cluster.playbackCount > 0 ? "Playback usage" : "",
        cluster.playbackCount > 0
          ? `- ${cluster.playbackCount} ${cluster.playbackCount === 1 ? "note includes" : "notes include"} a linked lecture playback reference.`
          : "",
      ].filter(Boolean)

      return {
        id: cluster.id,
        label,
        summary,
        brief: briefSections.join("\n\n"),
        keywords: keywords.map(formatTopicToken),
        notes: cluster.notes.sort((left, right) => right.created_at.localeCompare(left.created_at)),
        topAssets,
        lastUpdated: cluster.notes[0]?.created_at ?? "",
        playbackCount: cluster.playbackCount,
        graphLabel: cluster.seed?.graphLabel ?? null,
        representativeQuestions: cluster.seed?.examples ?? [],
      }
    })
    .sort((left, right) => right.lastUpdated.localeCompare(left.lastUpdated))
}

export default function NotesPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const { user, isLoading: isAuthLoading } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("all")
  const [queries, setQueries] = useState<IkionQueryEvent[]>([])
  const [assets, setAssets] = useState<IkionAsset[]>([])
  const [insights, setInsights] = useState<IkionInsights | null>(null)
  const [serverTopicClusters, setServerTopicClusters] = useState<TopicCluster[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setError(null)
      setIsLoading(true)

      try {
        if (!workspaceId) {
          setQueries([])
          setAssets([])
          setInsights(null)
          setServerTopicClusters([])
          return
        }

        const [queryEvents, assetList, summary, topicNotesResult] = await Promise.all([
          ikionFetch<IkionQueryEvent[]>(`/workspaces/${workspaceId}/queries`),
          ikionFetch<IkionAsset[]>(`/workspaces/${workspaceId}/assets`),
          ikionFetch<IkionInsights>(`/workspaces/${workspaceId}/insights`),
          ikionFetch<IkionTopicNotesResponse>(`/workspaces/${workspaceId}/notes/topics`).catch(() => null),
        ])

        setQueries(queryEvents)
        setAssets(assetList)
        setInsights(summary)
        setServerTopicClusters(
          (topicNotesResult?.topics ?? []).map((topic) => ({
            id: topic.id,
            label: topic.label,
            summary: topic.summary,
            brief: topic.brief,
            keywords: topic.keywords,
            notes: topic.notes,
            topAssets: (topic.top_assets ?? []).map((asset) => ({
              id: asset.asset_id,
              title: asset.title ?? asset.asset_id,
              asset_type: asset.asset_type ?? "asset",
            })),
            lastUpdated: topic.last_updated,
            playbackCount: topic.playback_count,
            graphLabel: topic.graph_label,
            representativeQuestions: topic.representative_questions ?? [],
          }))
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load workspace notes.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [workspaceId])

  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])

  const personalQueries = useMemo(
    () => (user?.id ? queries.filter((note) => note.user_id === user.id) : []),
    [queries, user?.id]
  )

  const filteredNotes = useMemo(() => {
    return personalQueries.filter((note) => {
      const haystack = `${note.query_text} ${note.response_text ?? ""}`.toLowerCase()
      const matchesSearch = haystack.includes(searchQuery.toLowerCase())

      if (activeTab === "playback") return matchesSearch && Boolean(note.playback)
      if (activeTab === "attention") return matchesSearch && note.response_status !== "answered"
      return matchesSearch
    })
  }, [activeTab, personalQueries, searchQuery])

  const topicClusters = useMemo(() => {
    if (serverTopicClusters.length > 0) {
      return serverTopicClusters
        .map((topic) => {
          const scopedNotes = topic.notes.filter((note) => {
            const haystack = `${note.query_text} ${note.response_text ?? ""}`.toLowerCase()
            const matchesSearch = haystack.includes(searchQuery.toLowerCase()) || topic.label.toLowerCase().includes(searchQuery.toLowerCase())
            if (!matchesSearch) return false
            if (activeTab === "playback") return Boolean(note.playback)
            if (activeTab === "attention") return note.response_status !== "answered"
            return true
          })
          return {
            ...topic,
            notes: scopedNotes,
            playbackCount: scopedNotes.filter((note) => Boolean(note.playback)).length,
            lastUpdated: scopedNotes[0]?.created_at ?? topic.lastUpdated,
          }
        })
        .filter((topic) => topic.notes.length > 0 || topic.label.toLowerCase().includes(searchQuery.toLowerCase()))
    }
    return buildTopicClusters(filteredNotes, assetsById, insights)
  }, [activeTab, assetsById, filteredNotes, insights, searchQuery, serverTopicClusters])

  useEffect(() => {
    setSelectedTopicId((current) =>
      current && topicClusters.some((topic) => topic.id === current)
        ? current
        : topicClusters[0]?.id ?? null
    )
  }, [topicClusters])

  const selectedTopic =
    topicClusters.find((topic) => topic.id === selectedTopicId) ??
    topicClusters[0] ??
    null

  const handleCopy = async (text: string) => {
    if (!text.trim()) return

    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied note content.")
    } catch {
      toast.error("Copy failed in this browser session.")
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="w-full border-r border-border bg-background lg:w-[24rem]">
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h1 className="text-lg font-semibold">Personal Notes</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Clustered from your own Ikion queries using workspace insight clusters and the knowledge graph.
                </p>
              </div>
                    <Button size="sm" className="gap-1.5" disabled>
                <Sparkles className="h-4 w-4" />
                Topic View
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search your topics and notes..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
            <TabsList className="mx-4 mt-4 grid w-auto grid-cols-3">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="playback">Playback</TabsTrigger>
              <TabsTrigger value="attention">Attention</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <div className="space-y-3 p-4">
                {!workspaceId ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Select a workspace before opening Notes.
                  </div>
                ) : isLoading || isAuthLoading ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    Organizing your notes by topic...
                  </div>
                ) : topicClusters.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <StickyNote className="h-10 w-10 text-muted-foreground/50" />
                    <p className="mt-3 text-sm text-muted-foreground">No personal Ikion notes found yet.</p>
                  </div>
                ) : (
                  topicClusters.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => setSelectedTopicId(topic.id)}
                      className={`ikion-hover-item w-full rounded-xl border p-4 text-left transition-colors ${
                        selectedTopic?.id === topic.id
                          ? "border-accent/35 bg-accent/5"
                          : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-sm font-semibold">{topic.label}</h2>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{topic.summary}</p>
                          {topic.graphLabel && (
                            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-accent">
                              {topic.graphLabel}
                            </p>
                          )}
                        </div>
                        <Badge variant="secondary">{topic.notes.length}</Badge>
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{formatUtcTimestamp(topic.lastUpdated)}</span>
                        {topic.playbackCount > 0 && (
                          <>
                            <span className="text-border">|</span>
                            <Video className="h-3 w-3" />
                            <span>{topic.playbackCount}</span>
                          </>
                        )}
                      </div>

                      {topic.keywords.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {topic.keywords.slice(0, 3).map((keyword) => (
                            <Badge key={keyword} variant="outline" className="text-[11px]">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </Tabs>
        </div>
      </div>

      <div className="hidden flex-1 bg-background lg:block">
        {selectedTopic ? (
          <ScrollArea className="h-full">
            <div className="mx-auto max-w-5xl space-y-6 p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold">{selectedTopic.label}</h1>
                    <Badge variant="secondary">
                      {selectedTopic.notes.length} {selectedTopic.notes.length === 1 ? "note" : "notes"}
                    </Badge>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    Knowledge-graph and query-cluster organized notes from your grounded Ikion answers for this workspace.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      Updated {formatUtcTimestamp(selectedTopic.lastUpdated)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      {selectedTopic.topAssets.length} key sources
                    </span>
                    {selectedTopic.playbackCount > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Video className="h-4 w-4" />
                        {selectedTopic.playbackCount} playback references
                      </span>
                    )}
                  </div>
                  {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
                </div>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Topic Brief</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="ikion-section-frame rounded-2xl border border-border/70 p-4">
                    <FormattedRichText text={selectedTopic.brief} />
                  </div>
                  {selectedTopic.topAssets.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {selectedTopic.topAssets.map((asset) => (
                        <div key={asset.id} className="ikion-hover-item rounded-xl border border-border/70 p-3">
                          <p className="text-sm font-medium">{asset.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                            {asset.asset_type}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-5">
                {selectedTopic.notes.map((note) => {
                  const citedAssets = note.cited_asset_ids
                    .map((assetId) => assetsById.get(assetId))
                    .filter((asset): asset is IkionAsset => Boolean(asset))

                  return (
                    <Card key={note.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-base leading-7">{note.query_text}</CardTitle>
                              <Badge variant={note.response_status === "answered" ? "default" : "secondary"}>
                                {note.response_status}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="h-4 w-4" />
                                {formatUtcTimestamp(note.created_at)}
                              </span>
                              <span className="inline-flex items-center gap-1.5">
                                <FileText className="h-4 w-4" />
                                {note.cited_asset_ids.length} sources
                              </span>
                              {note.playback && (
                                <span className="inline-flex items-center gap-1.5">
                                  <Video className="h-4 w-4" />
                                  Playback linked
                                </span>
                              )}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void handleCopy(note.response_text ?? "")}>
                            <Copy className="h-3.5 w-3.5" />
                            Copy
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="ikion-section-frame rounded-2xl border border-border/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Grounded Answer
                          </p>
                          <div className="mt-3">
                            <FormattedRichText text={note.response_text ?? "No response text logged."} />
                          </div>
                        </div>

                        {citedAssets.length > 0 && (
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Referenced Materials
                            </p>
                            <div className="grid gap-3 md:grid-cols-2">
                              {citedAssets.map((asset) => (
                                <div key={asset.id} className="ikion-hover-item rounded-2xl border border-border/70 p-3">
                                  {asset.asset_type === "video" ? (
                                    <VideoThumbnail
                                      asset={asset}
                                      workspaceId={workspaceId}
                                      className="aspect-video w-full"
                                      overlayLabel="Lecture"
                                    />
                                  ) : null}
                                  <div className={asset.asset_type === "video" ? "mt-3" : ""}>
                                    <div className="flex items-center justify-between gap-3">
                                      <div>
                                        <p className="font-medium">{asset.title}</p>
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                          {asset.asset_type}
                                        </p>
                                      </div>
                                      <Badge variant="outline">{asset.status}</Badge>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {note.playback && (
                          <div className="ikion-section-frame rounded-2xl border border-border/70 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              Playback Reference
                            </p>
                            <p className="mt-2 text-sm font-medium">
                              {note.playback.video_title ?? "Linked video"} at {Math.floor(note.playback.timestamp_start)}s
                              {note.playback.timestamp_end ? `-${Math.floor(note.playback.timestamp_end)}s` : ""}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.playback.snippet}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a topic to inspect your grouped notes.
          </div>
        )}
      </div>
    </div>
  )
}
