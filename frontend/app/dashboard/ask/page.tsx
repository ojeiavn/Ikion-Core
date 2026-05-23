"use client"

import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CitationCard } from "@/components/citation-card"
import { PlaybackMomentsPanel } from "@/components/playback-moments-panel"
import { SlideDeck } from "@/components/slide-deck"
import { VideoPlayerCard } from "@/components/video-player-card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  IkionAskResponse,
  IkionConversation,
  IkionConversationMessage,
  IkionInsights,
  IkionPlayback,
  getBackendBaseUrl,
  formatUtcTimestamp,
  ikionFetch,
} from "@/lib/ikion-api"
import { cn } from "@/lib/utils"

import {
  BookOpen,
  ChevronRight,
  Copy,
  FileText,
  MessageSquare,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  Send,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Video,
} from "lucide-react"

type UiMessage = IkionConversationMessage

function buildSuggestedQuestions(insights: IkionInsights | null) {
  const prompts: string[] = []
  const seen = new Set<string>()
  const llmTopics = (insights?.llm_insights?.top_topics ?? []).map((item) => item.topic)
  const graphTopics = (insights?.graph_topics ?? []).map((item) => item.label)
  const examFocusTopics = insights?.exam_prep?.focus_topics ?? []
  const recommendedQuestion = insights?.exam_prep?.recommended_question
  const citedAssets = (insights?.most_queried_assets ?? [])
    .map((asset) => asset.title)
    .filter((title): title is string => Boolean(title))

  const pushPrompt = (value: string) => {
    const prompt = value.trim()
    if (!prompt) return
    const key = prompt.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    prompts.push(prompt)
  }

  const examLabel = [recommendedQuestion?.paper_label, recommendedQuestion?.question_number]
    .filter(Boolean)
    .join(" ")
    .trim()
  const examAnchor = recommendedQuestion?.task_summary || recommendedQuestion?.topic_label || recommendedQuestion?.question_text

  if (recommendedQuestion && examAnchor) {
    pushPrompt(
      `Walk me through ${examLabel ? `${examLabel} on ` : ""}${examAnchor} using the uploaded exam paper, mark scheme, and lectures.`
    )
  }

  for (const topic of examFocusTopics.slice(0, 2)) {
    pushPrompt(`Ask me an exam-style question on ${topic} based on this module's past papers and lecture content.`)
  }

  for (let index = 0; index < Math.min(2, llmTopics.length); index += 1) {
    const topic = llmTopics[index]
    const assetTitle = citedAssets[index]
    if (assetTitle) {
      pushPrompt(`Teach me ${topic} using ${assetTitle}, then test me with one short follow-up question.`)
    } else {
      pushPrompt(`Explain ${topic} using only this module's lecture evidence and give me one concrete example.`)
    }
  }

  if (llmTopics.length >= 2) {
    pushPrompt(`Compare ${llmTopics[0]} and ${llmTopics[1]} exactly as they were taught in this workspace.`)
  }

  for (const topic of graphTopics.slice(0, 2)) {
    pushPrompt(`Show me where ${topic} appears across the lectures and why it matters for this module.`)
  }

  for (const assetTitle of citedAssets.slice(0, 2)) {
    pushPrompt(`Summarize the key ideas from ${assetTitle} and connect them to likely exam questions.`)
  }

  if (prompts.length === 0) {
    pushPrompt("Give me a module-grounded overview of the most important ideas I should learn first.")
    pushPrompt("Show me one concept from the lectures, one example, and one quick check question.")
    pushPrompt("Find a topic from this module that students often struggle with and teach it clearly.")
    pushPrompt("Prepare me with one exam-style prompt using only this module's materials.")
  }

  return prompts.slice(0, 4)
}

function renderInline(text: string): ReactNode[] {
  const normalized = text
    .replace(/\\\((.+?)\\\)/g, "$$$1$")
    .replace(/\\\[(.+?)\\\]/g, "$$$$1$$$$")
  const parts = normalized.split(/(`[^`]+`|\*\*[^*]+\*\*|\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={`code-${index}`}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={`strong-${index}`} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith("$$") && part.endsWith("$$") && part.length >= 4) {
      const mathPreview = renderLatexPreview(part.slice(2, -2))
      return (
        <span
          key={`math-block-${index}`}
          className="my-1 inline-block rounded-md bg-muted/60 px-2 py-1 font-mono text-[0.92em] text-foreground"
        >
          {mathPreview}
        </span>
      )
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length >= 2) {
      const mathPreview = renderLatexPreview(part.slice(1, -1))
      return (
        <span
          key={`math-inline-${index}`}
          className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground"
        >
          {mathPreview}
        </span>
      )
    }
    return <span key={`text-${index}`}>{part}</span>
  })
}

function renderLatexPreview(value: string) {
  const symbols: Record<string, string> = {
    alpha: "alpha",
    beta: "beta",
    gamma: "gamma",
    delta: "delta",
    Delta: "Delta",
    theta: "theta",
    lambda: "lambda",
    mu: "mu",
    sigma: "sigma",
    pi: "pi",
    times: "×",
    cdot: "·",
    leq: "<=",
    geq: ">=",
    neq: "!=",
    approx: "~",
  }
  let normalized = value.replace(/\\\\/g, "\\").trim()
  normalized = normalized.replace(/\\([A-Za-z]+)/g, (_, command: string) => symbols[command] ?? `\\${command}`)
  normalized = normalized.replace(/\s+/g, " ")
  return normalized
}

function FormattedAnswer({ content }: { content: string }) {
  const normalized = content.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  const nodes: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i += 1
      continue
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) i += 1
      nodes.push(
        <pre key={`pre-${i}`} className="overflow-x-auto rounded-lg bg-background/70 p-3">
          <code className="text-xs leading-relaxed text-foreground">{codeLines.join("\n")}</code>
        </pre>
      )
      continue
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/)
    if (headingMatch) {
      nodes.push(
        <h3 key={`h3-${i}`} className="mt-1 text-sm font-semibold tracking-wide text-foreground">
          {headingMatch[1]}
        </h3>
      )
      i += 1
      continue
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^-\s+/, ""))
        i += 1
      }
      nodes.push(
        <ul key={`ul-${i}`} className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-foreground/95">
          {items.map((item, idx) => (
            <li key={`li-${i}-${idx}`}>{renderInline(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""))
        i += 1
      }
      nodes.push(
        <ol key={`ol-${i}`} className="ml-5 list-decimal space-y-1 text-sm leading-relaxed text-foreground/95">
          {items.map((item, idx) => (
            <li key={`oli-${i}-${idx}`}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraphLines = [lines[i].trim()]
    i += 1
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s+/.test(lines[i].trim()) &&
      !/^- /.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("```")
    ) {
      paragraphLines.push(lines[i].trim())
      i += 1
    }
    nodes.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed text-foreground/95">
        {renderInline(paragraphLines.join(" "))}
      </p>
    )
  }

  return <div className="space-y-3">{nodes}</div>
}

function formatTimestamp(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "00:00"
  const total = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function mapPlayback(
  playback: IkionPlayback | null,
  workspaceId: string,
  backendBase: string
) {
  if (!playback) return null
  return {
    title: playback.video_title ?? "Lecture recording",
    timestamp: formatTimestamp(playback.timestamp_start),
    videoUrl:
      playback.video_stream_url ??
      (playback.video_external_ref ? null : `${backendBase}/workspaces/${workspaceId}/assets/${playback.video_asset_id}/content`),
    externalUrl: playback.video_external_ref,
    startAtSeconds: playback.timestamp_start,
    summary: playback.snippet || playback.transcript_excerpt,
  }
}

function mapPlaybackSegments(
  segments: IkionPlayback[],
  workspaceId: string,
  backendBase: string
) {
  return segments.map((segment) => ({
    ...segment,
    video_stream_url:
      segment.video_stream_url ??
      (segment.video_external_ref
        ? null
        : `${backendBase}/workspaces/${workspaceId}/assets/${segment.video_asset_id}/content`),
  }))
}

function extractMessagePlaybackSegments(
  message: UiMessage,
  workspaceId: string,
  backendBase: string
) {
  const raw = message.metadata?.playback_segments
  const fromMetadata = Array.isArray(raw) ? raw : []
  const segments = fromMetadata.filter(
    (item): item is IkionPlayback =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as IkionPlayback).video_asset_id === "string" &&
      typeof (item as IkionPlayback).timestamp_start === "number"
  )

  if (segments.length > 0) {
    return mapPlaybackSegments(segments, workspaceId, backendBase)
  }
  if (message.playback) {
    return mapPlaybackSegments([message.playback], workspaceId, backendBase)
  }
  return []
}

function mapCitationType(assetType: string) {
  if (assetType === "video") return "video"
  if (assetType === "transcript") return "transcript"
  if (assetType === "pdf") return "reading"
  return "reading"
}

function parseLocator(locator?: string | null) {
  if (!locator) return {}
  const pageMatch = locator.match(/page\s+(\d+)/i) || locator.match(/p\.?\s*(\d+)/i)
  const timestampMatch = locator.match(/(\d{1,2}:\d{2})/)
  return {
    page: pageMatch ? Number(pageMatch[1]) : undefined,
    timestamp: timestampMatch ? timestampMatch[1] : undefined,
    source: locator,
  }
}

function countSlideRefs(citations: IkionConversationMessage["citations"]) {
  const seen = new Set<string>()
  let count = 0
  for (const citation of citations ?? []) {
    if (citation.asset_type !== "pdf") continue
    const page = (citation.locator ?? "").match(/page\s+(\d+)/i) || (citation.locator ?? "").match(/p\.?\s*(\d+)/i)
    if (!page) continue
    const pageNum = Number(page[1])
    if (!Number.isFinite(pageNum) || pageNum <= 0) continue
    const key = `${citation.asset_id}:${pageNum}`
    if (seen.has(key)) continue
    seen.add(key)
    count += 1
  }
  return count
}

function compactPreview(text?: string | null, maxLength = 120) {
  if (!text) return "No messages yet"
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return "No messages yet"
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1)}…`
}

export default function AskIkionPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const backendBase = useMemo(() => getBackendBaseUrl(), [])
  const [conversations, setConversations] = useState<IkionConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState("")
  const [insights, setInsights] = useState<IkionInsights | null>(null)
  const [conversationFilter, setConversationFilter] = useState("")
  const [isConversationPanelOpen, setIsConversationPanelOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  )

  const filteredConversations = useMemo(() => {
    const needle = conversationFilter.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter((conv) => {
      const haystack = `${conv.title} ${conv.last_message_preview ?? ""}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [conversations, conversationFilter])

  const suggestedQuestions = useMemo(() => buildSuggestedQuestions(insights), [insights])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem("ikion.ask.conversations.open")
    if (saved === "0") {
      setIsConversationPanelOpen(false)
      return
    }
    if (saved === "1") {
      setIsConversationPanelOpen(true)
      return
    }
    if (window.innerWidth < 1024) {
      setIsConversationPanelOpen(false)
    }
  }, [])

  const loadConversations = async (preferredConversationId?: string | null) => {
    if (!workspaceId) {
      setConversations([])
      setActiveConversationId(null)
      setMessages([])
      return
    }
    setError(null)
    setIsLoading(true)
    try {
      const list = await ikionFetch<IkionConversation[]>(`/workspaces/${workspaceId}/conversations`)
      setConversations(list)
      const nextId = preferredConversationId ?? activeConversationId ?? list[0]?.id ?? null
      setActiveConversationId(nextId)
      if (nextId) {
        const messageList = await ikionFetch<IkionConversationMessage[]>(
          `/workspaces/${workspaceId}/conversations/${nextId}/messages`
        )
        setMessages(messageList)
      } else {
        setMessages([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load conversations.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadConversations(null)
  }, [workspaceId])

  useEffect(() => {
    const loadInsights = async () => {
      if (!workspaceId) {
        setInsights(null)
        return
      }

      try {
        const summary = await ikionFetch<IkionInsights>(`/workspaces/${workspaceId}/insights`)
        setInsights(summary)
      } catch {
        setInsights(null)
      }
    }

    void loadInsights()
  }, [workspaceId])

  const handleSelectConversation = async (conversationId: string) => {
    if (!workspaceId) return
    setActiveConversationId(conversationId)
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsConversationPanelOpen(false)
      window.localStorage.setItem("ikion.ask.conversations.open", "0")
    }
    setIsLoading(true)
    try {
      const messageList = await ikionFetch<IkionConversationMessage[]>(
        `/workspaces/${workspaceId}/conversations/${conversationId}/messages`
      )
      setMessages(messageList)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load messages.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleNewConversation = async () => {
    if (!workspaceId) return
    setIsSending(true)
    setError(null)
    try {
      const conversation = await ikionFetch<IkionConversation>(`/workspaces/${workspaceId}/conversations`, {
        method: "POST",
        body: JSON.stringify({ title: "New conversation" }),
      })
      await loadConversations(conversation.id)
      if (typeof window !== "undefined" && window.innerWidth < 1024) {
        setIsConversationPanelOpen(false)
        window.localStorage.setItem("ikion.ask.conversations.open", "0")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create conversation.")
    } finally {
      setIsSending(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!workspaceId || !input.trim() || isSending) return

    const draft = input.trim()
    setInput("")
    setIsSending(true)
    setError(null)

    const optimisticMessage: UiMessage = {
      id: `draft-${Date.now()}`,
      conversation_id: activeConversationId ?? "",
      workspace_id: workspaceId,
      user_id: null,
      role: "user",
      content: draft,
      status: null,
      citations: [],
      playback: null,
      metadata: {},
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMessage])

    try {
      const response = await ikionFetch<IkionAskResponse>(`/workspaces/${workspaceId}/ask`, {
        method: "POST",
        body: JSON.stringify({
          query: draft,
          conversation_id: activeConversationId,
        }),
      })

      if (response.conversation_id && response.conversation_id !== activeConversationId) {
        setActiveConversationId(response.conversation_id)
      }

      await loadConversations(response.conversation_id ?? activeConversationId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get a response.")
    } finally {
      setIsSending(false)
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
  }

  const toggleConversationPanel = () => {
    setIsConversationPanelOpen((current) => {
      const next = !current
      if (typeof window !== "undefined") {
        window.localStorage.setItem("ikion.ask.conversations.open", next ? "1" : "0")
      }
      return next
    })
  }

  const hasWorkspace = Boolean(workspaceId)

  return (
    <div className="relative flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="ikion-neon-orb ikion-neon-orb-cyan -left-36 top-16" />
        <div className="ikion-neon-orb ikion-neon-orb-violet right-8 top-20" />
        <div className="ikion-neon-orb ikion-neon-orb-indigo bottom-10 right-1/3" />
      </div>

      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex w-[88vw] max-w-[320px] min-h-0 flex-col border-r border-border/90 bg-background/90 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out lg:relative lg:z-auto lg:max-w-none lg:shadow-none",
          isConversationPanelOpen ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0 pointer-events-none lg:translate-x-0",
          isConversationPanelOpen
            ? "lg:w-[360px] lg:opacity-100"
            : "lg:w-0 lg:opacity-0 lg:pointer-events-none lg:border-r-0"
        )}
      >
        <div className="border-b border-border/80 p-4">
          <Button
            className="w-full gap-2"
            size="sm"
            onClick={() => void handleNewConversation()}
            disabled={!hasWorkspace || isSending}
          >
            <Plus className="h-4 w-4" />
            New Conversation
          </Button>
        </div>
        <div className="border-b border-border/80 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={conversationFilter}
              onChange={(event) => setConversationFilter(event.target.value)}
              placeholder="Search chats..."
              className="h-9 pl-9 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between px-2">
              <p className="py-1.5 text-xs font-medium text-muted-foreground">Recent</p>
              <p className="text-[11px] text-muted-foreground">{filteredConversations.length}</p>
            </div>
            {filteredConversations.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                {conversations.length === 0 ? "No conversations yet." : "No matches."}
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => void handleSelectConversation(conv.id)}
                  className={cn(
                    "flex w-full max-w-full items-start gap-3 overflow-hidden rounded-xl border border-transparent px-3 py-3 text-left text-sm transition-colors",
                    conv.id === activeConversationId
                      ? "border-accent/15 bg-muted/70 shadow-[0_0_24px_rgba(94,58,255,0.12)]"
                      : "hover:border-border/80 hover:bg-muted/45"
                  )}
                >
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 w-0 flex-1 overflow-hidden">
                    <p className="overflow-hidden text-sm font-medium leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {conv.title}
                    </p>
                    <p className="mt-1 overflow-hidden text-xs leading-5 text-muted-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {compactPreview(conv.last_message_preview)}
                    </p>
                    <p className="mt-2 truncate text-[11px] text-muted-foreground">
                      {formatUtcTimestamp(conv.updated_at)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {isConversationPanelOpen && (
        <button
          type="button"
          aria-label="Close conversation list"
          onClick={toggleConversationPanel}
          className="absolute inset-0 z-20 bg-black/50 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border/80 bg-background/80 px-4 py-4 backdrop-blur-md sm:px-6">
          <div className="flex flex-wrap items-center gap-3 lg:gap-4">
            <Button
              variant="outline"
              size="sm"
              className="hidden shrink-0 gap-2 lg:inline-flex"
              onClick={toggleConversationPanel}
            >
              {isConversationPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
              {isConversationPanelOpen ? "Hide chats" : "Show chats"}
            </Button>
            <div className="ikion-neon-chip flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold">Ask Ikion</h1>
              <p className="truncate text-sm text-muted-foreground">
                {activeConversation ? activeConversation.title : "Grounded answers from your course materials"}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2 lg:hidden">
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={toggleConversationPanel}
                aria-label={isConversationPanelOpen ? "Hide conversations" : "Show conversations"}
              >
                {isConversationPanelOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
            {!hasWorkspace ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                No active course is selected. Visit{" "}
                <Link href="/dashboard/courses" className="underline underline-offset-4">
                  Courses
                </Link>{" "}
                to pick one.
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                  <BookOpen className="h-8 w-8 text-accent" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Ask anything about your course</h2>
                <p className="text-muted-foreground mb-8">
                  Ikion will answer using your lecture slides, readings, and recordings with citations.
                </p>
                <div className="mx-auto mt-6 grid max-w-6xl gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => handleSuggestedQuestion(question)}
                      className="flex min-h-[124px] items-start gap-3 rounded-xl border border-border/80 bg-card px-5 py-4 text-left text-sm transition-all hover:border-accent/40 hover:bg-muted/35"
                    >
                      <span className="flex-1 leading-7">{question}</span>
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => {
                  const playback = workspaceId ? mapPlayback(message.playback ?? null, workspaceId, backendBase) : null
                  const playbackSegments = workspaceId
                    ? extractMessagePlaybackSegments(message, workspaceId, backendBase)
                    : []
                  const slideCount = workspaceId ? countSlideRefs(message.citations) : 0
                  return (
                    <div key={message.id} className="space-y-4">
                      {message.role === "user" ? (
                        <div className="flex justify-end">
                          <div className="ikion-user-bubble max-w-2xl rounded-2xl rounded-tr-sm bg-primary px-5 py-3 text-primary-foreground">
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="ikion-neon-card rounded-xl border border-border bg-card/95">
                            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                                <Sparkles className="h-4 w-4 text-accent" />
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold">Ikion</span>
                                <span className="text-xs text-muted-foreground">Grounded Answer</span>
                              </div>
                            </div>

                            <div className="p-5">
                              <FormattedAnswer content={message.content} />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                                  <Copy className="h-3.5 w-3.5" />
                                  Copy
                                </Button>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ThumbsUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ThumbsDown className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>

                          {message.citations && message.citations.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <FileText className="h-3.5 w-3.5" />
                                Evidence
                              </div>
                              <Tabs defaultValue="sources" className="gap-3">
                                <TabsList>
                                  <TabsTrigger value="sources">
                                    Sources ({message.citations.length})
                                  </TabsTrigger>
                                  {workspaceId && slideCount > 0 && (
                                    <TabsTrigger value="slides">
                                      Slides ({slideCount})
                                    </TabsTrigger>
                                  )}
                                </TabsList>
                                <TabsContent value="sources">
                                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {message.citations.map((citation) => {
                                      const locator = parseLocator(citation.locator)
                                      return (
                                        <CitationCard
                                          key={citation.index}
                                          type={mapCitationType(citation.asset_type)}
                                          title={citation.asset_title}
                                          source={locator.source ?? citation.asset_type}
                                          excerpt={citation.quote}
                                          timestamp={locator.timestamp}
                                          page={locator.page}
                                        />
                                      )
                                    })}
                                  </div>
                                </TabsContent>
                                {workspaceId && slideCount > 0 && (
                                  <TabsContent value="slides">
                                    <SlideDeck workspaceId={workspaceId} citations={message.citations} showHeader={false} />
                                  </TabsContent>
                                )}
                              </Tabs>
                            </div>
                          )}

                          {playbackSegments.length > 0 ? (
                            <PlaybackMomentsPanel
                              segments={playbackSegments}
                              title="Relevant lecture moments"
                              description="Ikion found the three strongest transcript-matched moments for this answer."
                            />
                          ) : playback ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                                <Video className="h-3.5 w-3.5" />
                                Related Lecture
                              </p>
                              <div className="max-w-md">
                                <VideoPlayerCard
                                  title={playback.title}
                                  timestamp={playback.timestamp}
                                  videoUrl={playback.videoUrl}
                                  externalUrl={playback.externalUrl}
                                  startAtSeconds={playback.startAtSeconds}
                                  summary={playback.summary}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}

                {isSending && (
                  <div className="ikion-neon-card rounded-xl border border-border bg-card/95 p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                        <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Ikion is thinking</span>
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border/80 bg-background/85 p-4 backdrop-blur-md">
          {error && (
            <div className="mx-auto mb-2 max-w-4xl rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-4xl flex-col gap-2">
            <div className="relative flex items-center gap-2">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask a question about your course..."
                className="h-12 flex-1 border-border/70 bg-background/90 pr-12 text-base shadow-[0_0_24px_rgba(56,120,255,0.08)]"
                disabled={!hasWorkspace || isSending}
              />
              <Button
                type="submit"
                size="icon"
                className="ikion-neon-chip h-10 w-10"
                disabled={!hasWorkspace || !input.trim() || isSending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Ikion answers using only your course materials with full citations
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
