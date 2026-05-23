const CONFIGURED_BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://127.0.0.1:8000"

function getBackendBase() {
  if (typeof window === "undefined") {
    return CONFIGURED_BACKEND_BASE
  }

  try {
    const url = new URL(CONFIGURED_BACKEND_BASE)
    const frontendHost = window.location.hostname
    const localHosts = new Set(["127.0.0.1", "localhost"])

    if (localHosts.has(url.hostname) && localHosts.has(frontendHost)) {
      url.hostname = frontendHost
    }

    return url.toString().replace(/\/$/, "")
  } catch {
    return CONFIGURED_BACKEND_BASE
  }
}

export function getBackendBaseUrl() {
  return getBackendBase()
}

export type IkionUserRole = "student" | "lecturer" | "admin"

export interface IkionUser {
  id: string
  email: string
  full_name: string
  role: IkionUserRole
  is_active: boolean
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface IkionSessionRecord {
  id: string
  user_id: string
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
}

export interface IkionUserSummary extends IkionUser {
  active_session_count: number
}

export interface IkionAuthSession {
  user: IkionUser
  session: IkionSessionRecord
}

export interface IkionSetupStatus {
  setup_required: boolean
  user_count: number
  allowed_roles: IkionUserRole[]
  allow_dev_auth_reset: boolean
}

export interface IkionWorkspace {
  id: string
  slug: string
  name: string
  description: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface IkionWorkspaceSummary extends IkionWorkspace {
  membership_role: IkionUserRole
}

export interface IkionWorkspaceMembership {
  id: string
  workspace_id: string
  user_id: string
  role: IkionUserRole
  created_at: string
  user_email?: string
  user_full_name?: string
  user_role?: IkionUserRole
}

export interface IkionAsset {
  id: string
  workspace_id: string
  asset_type: "pdf" | "transcript" | "video" | "notice"
  title: string
  status: string
  source_path: string | null
  content_path: string | null
  mime_type: string | null
  external_ref: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface IkionGuidancePack {
  id: string
  workspace_id: string
  name: string
  instructions: string
  metadata: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface IkionExamQuestion {
  id: string
  workspace_id: string
  source_asset_id: string | null
  mark_scheme_asset_id: string | null
  question_number: string | null
  question_text: string
  normalized_question: string
  topic_label: string | null
  difficulty: number
  marks: number | null
  origin_type: "uploaded" | "inspired" | string
  source_question_id: string | null
  guidance: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface IkionExamAttempt {
  id: string
  workspace_id: string
  user_id: string
  exam_question_id: string | null
  prompt_text: string
  student_answer: string
  evaluation_text: string
  score: number
  rubric: Record<string, unknown>
  strengths: string[]
  improvements: string[]
  focus_topics: string[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface IkionExamRecommendation {
  id: string | null
  question_text: string
  question_number: string | null
  topic_label: string | null
  marks: number | null
  origin_type: "uploaded" | "inspired" | string
  guidance: string | null
  source_asset_id: string | null
  source_asset_title: string | null
  mark_scheme_available: boolean
  focus_topics: string[]
  rationale: string
  paper_label: string | null
  command_word: string | null
  task_summary: string
  answer_framework: string[]
  why_this_now: string[]
  lecturer_focus: string[]
  inspired_variant?: {
    question_text: string
    origin_type: "inspired" | string
    source_question_id: string
    source_question_text: string
  }
}

export interface IkionExamEvaluation {
  workspace_id: string
  exam_question_id: string | null
  question_text: string
  score: number
  score_percent: number
  band: string
  support_score: number
  strengths: string[]
  improvements: string[]
  focus_topics: string[]
  model_answer: string
  guidance: string
  evaluation_text: string
  readiness_score: number
}

export interface IkionExamPrepProfile {
  workspace_id: string
  exam_question_count: number
  exam_paper_count: number
  mark_scheme_count: number
  readiness_score: number
  exam_attempt_readiness_score: number
  chat_readiness_score: number
  chat_activity_count: number
  proficiency_band: string
  avg_attempt_score: number | null
  recent_attempt_count: number
  focus_topics: string[]
  lecturer_exam_guidance: string[]
  recommended_question: IkionExamRecommendation | null
  recent_attempts: IkionExamAttempt[]
}

export interface IkionCorpusRecord {
  id: string
  workspace_id: string
  status: string
  chunk_count: number
  created_at: string
  activated_at: string | null
  is_active: boolean
  build_metadata: Record<string, unknown>
}

export interface IkionCorpusInspection {
  database_record: IkionCorpusRecord | null
  workspace_manifest: Record<string, unknown>
  version_manifest: Record<string, unknown> | null
}

export interface IkionCitation {
  index: number
  chunk_id: string
  asset_id: string
  asset_title: string
  asset_type: "pdf" | "notice" | "transcript" | "video"
  locator: string | null
  quote: string
  score: number
}

export interface IkionPlayback {
  video_asset_id: string
  timestamp_start: number
  timestamp_end: number | null
  transcript_excerpt: string
  snippet: string
  source_chunk_id: string
  video_title: string | null
  video_source_path: string | null
  video_external_ref: string | null
  video_stream_url: string | null
}

export interface IkionQueryEvent {
  id: string
  workspace_id: string
  user_id: string | null
  conversation_id: string | null
  query_text: string
  response_text: string | null
  response_status: string
  cited_chunk_ids: string[]
  cited_asset_ids: string[]
  retrieval: Array<{
    chunk_id: string
    asset_id: string
    asset_type: string
    score: number
    semantic_score: number
    lexical_score: number
  }>
  playback: IkionPlayback | null
  metrics: {
    support_score?: number
    latency_ms?: number
    playback_available?: boolean
    guidance_applied?: string[]
  }
  created_at: string
}

export interface IkionConversation {
  id: string
  workspace_id: string
  user_id: string | null
  title: string
  created_at: string
  updated_at: string
  message_count: number
  last_message_preview: string | null
}

export interface IkionConversationMessage {
  id: string
  conversation_id: string
  workspace_id: string
  user_id: string | null
  role: "user" | "assistant"
  content: string
  status: string | null
  citations: IkionCitation[]
  playback: IkionPlayback | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface IkionAskResponse {
  workspace_id: string
  query: string
  conversation_id: string | null
  answer_mode: "standard" | "thinking"
  complexity_score: number
  status: "answered" | "partial" | "refused" | "error"
  answer: string
  citations: IkionCitation[]
  cited_chunk_ids: string[]
  cited_asset_ids: string[]
  support_score: number
  guidance_applied: string[]
  playback: IkionPlayback | null
  playback_segments: IkionPlayback[]
}

export interface IkionInsights {
  workspace_id: string
  generated_at: string
  query_count: number
  top_topics: Array<{ token: string; count: number }>
  repeated_weak_queries: Array<{ bucket: string; count: number; examples: string[] }>
  most_queried_assets: Array<{ asset_id: string; count: number; title: string | null; asset_type: string | null }>
  source_type_usage: Array<{ source_type: string; count: number }>
  recent_query_counts: Array<{ date: string; count: number }>
  role_breakdown?: Array<{ role: string; count: number }>
  query_clusters?: Array<{
    cluster_id: string
    label: string
    count: number
    examples: string[]
    top_terms: string[]
    status_breakdown: Record<string, number>
    role_breakdown: Record<string, number>
    avg_support_score: number
    avg_complexity_score: number
    top_assets: Array<{ asset_id: string; count: number; title: string | null; asset_type: string | null }>
    source_type_usage: Array<{ asset_type: string; count: number }>
  }>
  topic_coverage?: {
    top_terms_considered: number
    covered_top_terms: Array<{ term: string }>
    uncovered_top_terms: Array<{ term: string }>
    coverage_ratio: number
    graph_topic_coverage: Array<{ topic_id: string; label: string; has_recent_queries: boolean }> | null
  } | null
  graph_topics?: Array<{ topic_id: string; label: string; size: number; top_terms: string[] }> | null
  segments?: unknown
  llm_insights?: {
    cluster_topics: Array<{ cluster_id: string; topic: string }>
    top_topics: Array<{ topic: string; count: number }>
    student_summary: string
    lecturer_summary: string
    highlights: string[]
  } | null
  topic_mastery?: {
    strong_topics: Array<{ topic: string; reason?: string; mastery_score: number; count?: number }>
    weak_topics: Array<{ topic: string; reason?: string; mastery_score: number; count?: number }>
    judge_summary: string
  } | null
  exam_prep?: IkionExamPrepProfile | null
}

export interface IkionTopicNotesResponse {
  workspace_id: string
  generated_at: string
  topics: Array<{
    id: string
    label: string
    summary: string
    brief: string
    keywords: string[]
    notes: IkionQueryEvent[]
    top_assets: Array<{ asset_id: string; count: number; title: string | null; asset_type: string | null }>
    last_updated: string
    playback_count: number
    graph_label: string | null
    representative_questions: string[]
  }>
}

type IkionFetchInit = RequestInit & {
  timeoutMs?: number
}

export async function ikionFetch<T>(path: string, init?: IkionFetchInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const controller = new AbortController()
  const timeoutMs =
    init?.timeoutMs ??
    ((init?.method ?? "GET").toUpperCase() === "GET" ? 12000 : 300000)
  const timeoutId = typeof window !== "undefined"
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${getBackendBase()}${path}`, {
      credentials: "include",
      ...init,
      headers,
      signal: init?.signal ?? controller.signal,
    })
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out. The Ikion backend did not respond in time.")
    }
    throw new Error(error instanceof Error ? error.message : "Load failed")
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const text = await response.text()
    let detail: string | null = null
    try {
      const payload = JSON.parse(text)
      detail = typeof payload.detail === "string" ? payload.detail : null
    } catch {}
    throw new Error(detail || text || `Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function fileToBase64(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ""
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return window.btoa(binary)
}

export function formatUtcTimestamp(value: string | null | undefined) {
  if (!value) return "Unknown"

  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    second: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
    year: "numeric",
  }).format(timestamp)
}

export function secondsToTimestamp(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}
