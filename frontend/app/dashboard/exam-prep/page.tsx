"use client"

import { useEffect, useMemo, useState } from "react"

import { ExamRecommendationCard } from "@/components/exam-recommendation-card"
import { FormattedRichText } from "@/components/formatted-rich-text"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  OrionAskResponse,
  OrionCitation,
  OrionExamEvaluation,
  OrionExamPrepProfile,
  OrionExamRecommendation,
  getBackendBaseUrl,
  orionFetch,
} from "@/lib/orion-api"
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  Lightbulb,
  Sparkles,
  Target,
} from "lucide-react"
import { toast } from "sonner"

interface ExamResponse {
  structure: string[]
  keyConcepts: string[]
  exampleExplanation: string
  commonMistakes: string[]
  citations: OrionCitation[]
}

function buildExamResponse(question: string, response: OrionAskResponse): ExamResponse {
  const citations = response.citations

  const structure = [
    `Start by answering the command word in "${question}" directly.`,
    ...citations.slice(0, 2).map((citation) => `Develop one clear exam point using evidence from ${citation.asset_title}.`),
    "Finish by linking the evidence back to the exam wording and any required comparison or justification.",
  ].slice(0, 4)

  const keyConcepts = citations
    .map((citation) => citation.quote.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 6)

  return {
    structure,
    keyConcepts,
    exampleExplanation: response.answer,
    commonMistakes: [
      "Answering from memory instead of using the strongest taught evidence.",
      "Writing description only when the question needs explanation, comparison, or evaluation.",
      "Missing the direct link between your point and the wording of the exam question.",
    ],
    citations,
  }
}

function parseLocatorPage(locator: string | null) {
  if (!locator) return null
  const match = locator.match(/page\s+(\d+)/i) || locator.match(/p\.?\s*(\d+)/i)
  if (!match) return null
  const page = Number(match[1])
  return Number.isFinite(page) && page > 0 ? page : null
}

export default function ExamPrepPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const backendBase = useMemo(() => getBackendBaseUrl(), [])
  const [question, setQuestion] = useState("")
  const [studentAnswer, setStudentAnswer] = useState("")
  const [profile, setProfile] = useState<OrionExamPrepProfile | null>(null)
  const [response, setResponse] = useState<ExamResponse | null>(null)
  const [evaluation, setEvaluation] = useState<OrionExamEvaluation | null>(null)
  const [activeRecommendation, setActiveRecommendation] = useState<OrionExamRecommendation | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [isRefreshingRecommendation, setIsRefreshingRecommendation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCitation, setSelectedCitation] = useState<OrionCitation | null>(null)
  const [isResourceViewerOpen, setIsResourceViewerOpen] = useState(false)

  const loadProfile = async () => {
    if (!workspaceId) {
      setProfile(null)
      setActiveRecommendation(null)
      setQuestion("")
      return
    }
    setIsLoadingProfile(true)
    try {
      const nextProfile = await orionFetch<OrionExamPrepProfile>(`/workspaces/${workspaceId}/exam-prep/profile`)
      setProfile(nextProfile)
      setActiveRecommendation(nextProfile.recommended_question)
      if (!question.trim() && nextProfile.recommended_question?.question_text) {
        setQuestion(nextProfile.recommended_question.question_text)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load exam-prep profile.")
      setProfile(null)
      setActiveRecommendation(null)
    } finally {
      setIsLoadingProfile(false)
    }
  }

  useEffect(() => {
    setError(null)
    setResponse(null)
    setEvaluation(null)
    setStudentAnswer("")
    setQuestion("")
    void loadProfile()
  }, [workspaceId])

  const recentAttempts = useMemo(() => profile?.recent_attempts ?? [], [profile])

  const handleRecommendationRefresh = async (preferInspired: boolean) => {
    if (!workspaceId) return
    setIsRefreshingRecommendation(true)
    setError(null)
    try {
      const recommendation = await orionFetch<OrionExamRecommendation | null>(`/workspaces/${workspaceId}/exam-prep/recommendation`, {
        method: "POST",
        body: JSON.stringify({ prefer_inspired: preferInspired }),
      })
      setActiveRecommendation(recommendation)
      if (recommendation?.question_text) {
        setQuestion(
          preferInspired && recommendation.inspired_variant?.question_text
            ? recommendation.inspired_variant.question_text
            : recommendation.question_text
        )
        setResponse(null)
        setEvaluation(null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to refresh recommendation."
      setError(message)
      toast.error(message)
    } finally {
      setIsRefreshingRecommendation(false)
    }
  }

  const handleSubmit = async () => {
    if (!question.trim() || isGeneratingGuide) return
    if (!workspaceId) {
      setError("Create or select a workspace before generating exam guidance.")
      return
    }

    setIsGeneratingGuide(true)
    setError(null)
    try {
      const examPrompt = [
        "Prepare me for this exam question using only the active workspace corpus.",
        "Use uploaded exam papers, mark schemes, lecturer guidance, and taught materials where relevant.",
        "Return a concise, exam-structured, evidence-first model answer guide.",
        "Question:",
        question.trim(),
      ].join("\n\n")

      const grounded = await orionFetch<OrionAskResponse>(`/workspaces/${workspaceId}/ask`, {
        method: "POST",
        body: JSON.stringify({
          query: examPrompt,
          top_k: 8,
        }),
      })

      setResponse(buildExamResponse(question.trim(), grounded))
      toast.success("Grounded exam guide generated.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate exam guidance."
      setError(message)
      toast.error("Exam guidance request failed.")
    } finally {
      setIsGeneratingGuide(false)
    }
  }

  const handleEvaluate = async () => {
    if (!workspaceId || !question.trim() || !studentAnswer.trim() || isEvaluating) return
    setIsEvaluating(true)
    setError(null)
    try {
      const result = await orionFetch<OrionExamEvaluation>(`/workspaces/${workspaceId}/exam-prep/evaluate`, {
        method: "POST",
        body: JSON.stringify({
          exam_question_id: activeRecommendation?.id ?? null,
          question_text: question.trim(),
          student_answer: studentAnswer.trim(),
        }),
      })
      setEvaluation(result)
      setProfile((current) =>
        current
          ? {
              ...current,
              readiness_score: result.readiness_score,
              avg_attempt_score:
                current.avg_attempt_score === null
                  ? result.score
                  : Number(((current.avg_attempt_score * Math.max(current.recent_attempt_count, 1) + result.score) / (current.recent_attempt_count + 1)).toFixed(3)),
              recent_attempt_count: current.recent_attempt_count + 1,
              focus_topics: result.focus_topics,
              recent_attempts: current.recent_attempts,
            }
          : current
      )
      toast.success("Exam answer evaluated.")
      void loadProfile()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to evaluate your exam answer."
      setError(message)
      toast.error(message)
    } finally {
      setIsEvaluating(false)
    }
  }

  const handleCopy = async () => {
    if (!response) return

    try {
      await navigator.clipboard.writeText(response.exampleExplanation)
      toast.success("Copied exam guidance.")
    } catch {
      toast.error("Copy failed in this browser session.")
    }
  }

  const openCitation = (citation: OrionCitation) => {
    setSelectedCitation(citation)
    setIsResourceViewerOpen(true)
  }

  const selectedCitationUrl = useMemo(() => {
    if (!workspaceId || !selectedCitation) return null
    const base = `${backendBase}/workspaces/${workspaceId}/assets/${selectedCitation.asset_id}/content`
    const page = parseLocatorPage(selectedCitation.locator)
    if (selectedCitation.asset_type === "pdf" && page) {
      return `${base}#page=${page}`
    }
    return base
  }, [backendBase, workspaceId, selectedCitation])

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Exam Preparation</h1>
        <p className="mt-1 text-muted-foreground">
          Practice targeted exam questions from uploaded papers, then get grounded evaluation against your module materials.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      {!workspaceId ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active workspace is selected. Open Admin to create or select one first.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recommended Question</CardTitle>
                <CardDescription>
                  Orion picks this using your recent weak areas, previous attempts, lecturer guidance, and uploaded exam materials.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingProfile ? (
                  <p className="text-sm text-muted-foreground">Loading personalized practice...</p>
                ) : activeRecommendation ? (
                  <>
                    <ExamRecommendationCard recommendation={activeRecommendation} />

                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setQuestion(activeRecommendation.question_text)
                          setResponse(null)
                          setEvaluation(null)
                        }}
                      >
                        Use Uploaded Question
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void handleRecommendationRefresh(true)}
                        disabled={isRefreshingRecommendation}
                      >
                        {isRefreshingRecommendation ? "Refreshing..." : "Get Inspired Variant"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Upload exam papers and complete a few queries to help Orion build a stronger recommendation.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Question You Want to Practice</CardTitle>
                <CardDescription>
                  Use the recommendation or paste a specific past-paper prompt. Orion will place the generated guide in the output panel on the right.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Paste the exam question you want to practise..."
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  className="min-h-[110px] resize-none rounded-2xl border-white/50 bg-background/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] focus-visible:ring-accent/20"
                />
                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleSubmit} disabled={!question.trim() || isGeneratingGuide} className="gap-2">
                    <Sparkles className={`h-4 w-4 ${isGeneratingGuide ? "animate-pulse" : ""}`} />
                    {isGeneratingGuide ? "Generating..." : "Generate Answer Guide"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleRecommendationRefresh(false)}
                    disabled={isRefreshingRecommendation}
                  >
                    Refresh Recommendation
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Write Your Answer</CardTitle>
                <CardDescription>
                  Draft your answer here, then Orion will evaluate it in the coaching panel on the right using the grounded module corpus and your exam-practice profile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Write your exam answer here..."
                  value={studentAnswer}
                  onChange={(event) => setStudentAnswer(event.target.value)}
                  className="min-h-[220px] rounded-2xl border-white/50 bg-background/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] focus-visible:ring-accent/20"
                />
                <Button onClick={handleEvaluate} disabled={!question.trim() || !studentAnswer.trim() || isEvaluating} className="gap-2">
                  <ClipboardCheck className={`h-4 w-4 ${isEvaluating ? "animate-pulse" : ""}`} />
                  {isEvaluating ? "Evaluating..." : "Evaluate My Answer"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
            <Card className={isGeneratingGuide ? "border-accent/40" : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Generated Guide Output</CardTitle>
                    <CardDescription>
                      This is where Orion places your grounded answer guide and cited exam support.
                    </CardDescription>
                  </div>
                  <Badge variant={response ? "default" : "secondary"}>
                    {response ? "Ready" : isGeneratingGuide ? "Generating" : "Waiting"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {!response ? (
                  <div className="orion-section-frame rounded-2xl border border-dashed border-border/70 p-5">
                    <p className="text-sm font-medium">Generate a guide from the question panel.</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Orion will populate this area with an answer structure, key evidence, a professionally formatted guide, and the source materials it used.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="orion-section-frame rounded-2xl border border-border/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Guide Question</p>
                      <p className="mt-2 text-sm font-medium leading-7">{question}</p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/20">
                          <Target className="h-4 w-4 text-chart-2" />
                        </div>
                        <h3 className="text-sm font-semibold">Suggested Answer Structure</h3>
                      </div>
                      <ol className="space-y-2">
                        {response.structure.map((item, index) => (
                          <li key={item} className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                              {index + 1}
                            </span>
                            <span className="pt-0.5 text-sm leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/20">
                          <CheckCircle2 className="h-4 w-4 text-chart-1" />
                        </div>
                        <h3 className="text-sm font-semibold">Key Evidence to Include</h3>
                      </div>
                      <ul className="grid gap-2">
                        {response.keyConcepts.map((concept) => (
                          <li key={concept} className="orion-hover-item flex items-start gap-2 rounded-xl border border-border/60 px-3 py-2 text-sm">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-2" />
                            <span>{concept}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="orion-section-frame space-y-3 rounded-2xl border border-border/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                            <Lightbulb className="h-4 w-4 text-accent" />
                          </div>
                          <h3 className="text-sm font-semibold">Model Answer Guide</h3>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void handleCopy()}>
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </div>
                      <FormattedRichText text={response.exampleExplanation} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/20">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        </div>
                        <h3 className="text-sm font-semibold">Common Mistakes to Avoid</h3>
                      </div>
                      <ul className="space-y-2">
                        {response.commonMistakes.map((mistake) => (
                          <li key={mistake} className="flex items-start gap-2 text-sm">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                            <span>{mistake}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                        <BookOpen className="h-4 w-4" />
                        Referenced Materials
                      </h3>
                      <div className="grid gap-2">
                        {response.citations.map((citation, index) => (
                          <button
                            key={`${citation.asset_id}-${citation.chunk_id}-${index}`}
                            type="button"
                            onClick={() => openCitation(citation)}
                            className="orion-hover-item flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2 text-left"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{citation.asset_title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {citation.locator ?? citation.asset_type}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-accent">
                              <FileText className="h-3.5 w-3.5" />
                              Open resource
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Evaluation and Coaching</CardTitle>
                    <CardDescription>
                      Orion places the marked feedback for your written answer here.
                    </CardDescription>
                  </div>
                  {evaluation && <Badge variant="secondary">{evaluation.band}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {!evaluation ? (
                  <div className="orion-section-frame rounded-2xl border border-dashed border-border/70 p-5">
                    <p className="text-sm font-medium">Submit your answer for evaluation.</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Orion will score the answer, identify strengths and gaps, and provide targeted coaching plus a model response.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-3xl font-semibold">{evaluation.score_percent}%</p>
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Marked score</p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>Support score {Math.round(evaluation.support_score * 100)}%</p>
                          <p>Readiness now {evaluation.readiness_score}%</p>
                        </div>
                      </div>
                      <Progress value={evaluation.score_percent} className="h-2" />
                      <FormattedRichText text={evaluation.evaluation_text} />
                    </div>

                    <div className="grid gap-4">
                      <div className="orion-hover-item rounded-2xl border border-border/70 p-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <CheckCircle2 className="h-4 w-4 text-chart-2" />
                          Strengths
                        </h3>
                        <ul className="mt-3 space-y-2">
                          {evaluation.strengths.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="orion-hover-item rounded-2xl border border-border/70 p-4">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                          Improve Next
                        </h3>
                        <ul className="mt-3 space-y-2">
                          {evaluation.improvements.map((item) => (
                            <li key={item} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {evaluation.focus_topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {evaluation.focus_topics.map((topic) => (
                          <Badge key={topic} variant="secondary">{topic}</Badge>
                        ))}
                      </div>
                    )}

                    <div className="orion-section-frame space-y-3 rounded-2xl border border-border/70 p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                          <Lightbulb className="h-4 w-4 text-accent" />
                        </div>
                        <h3 className="text-sm font-semibold">Targeted Coaching</h3>
                      </div>
                      <FormattedRichText text={evaluation.guidance} />
                    </div>

                    <div className="orion-section-frame space-y-3 rounded-2xl border border-border/70 p-4">
                      <h3 className="text-sm font-semibold">Model Answer Reference</h3>
                      <FormattedRichText text={evaluation.model_answer} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-1">
              <Card>
              <CardHeader>
                <CardTitle className="text-base">Exam Readiness</CardTitle>
                <CardDescription>Strict readiness estimate anchored to marked practice quality.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile ? (
                  <>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-semibold">{profile.readiness_score}%</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{profile.proficiency_band}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{profile.exam_paper_count} papers</p>
                        <p>{profile.mark_scheme_count} mark schemes</p>
                      </div>
                    </div>
                    <Progress value={profile.readiness_score} className="h-2" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="orion-hover-item rounded-2xl border border-border/55 border-t-transparent p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Exam Prep</p>
                        <p className="mt-1 text-lg font-semibold">{profile.exam_attempt_readiness_score}%</p>
                        <p className="text-xs text-muted-foreground">Dominant signal from answer quality, consistency, and evidence use.</p>
                      </div>
                      <div className="orion-hover-item rounded-2xl border border-border/55 border-t-transparent p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Ask Orion</p>
                        <p className="mt-1 text-lg font-semibold">{profile.chat_readiness_score}%</p>
                        <p className="text-xs text-muted-foreground">
                          Secondary signal from {profile.chat_activity_count} exam-style interaction{profile.chat_activity_count === 1 ? "" : "s"}.
                        </p>
                      </div>
                    </div>
                    <p className="orion-section-frame rounded-2xl border border-dashed border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                      This score is intentionally harsh. Repeated strong answers in Exam Prep move it far more than conversational fluency in chat.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.focus_topics.length > 0 ? (
                        profile.focus_topics.map((topic) => (
                          <Badge key={topic} variant="secondary">{topic}</Badge>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No focus topics yet.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No exam-prep profile available yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lecturer Exam Guidance</CardTitle>
                <CardDescription>Active exam-specific coaching for this workspace.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile?.lecturer_exam_guidance?.length ? (
                  profile.lecturer_exam_guidance.slice(0, 3).map((item) => (
                    <div key={item} className="orion-hover-item rounded-lg border border-border p-3 text-sm text-muted-foreground">
                      {item}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No active exam guidance has been published yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Attempts</CardTitle>
                <CardDescription>Your latest evaluated exam-practice sessions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentAttempts.length > 0 ? (
                  recentAttempts.map((attempt) => (
                    <div key={attempt.id} className="orion-hover-item rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="line-clamp-2 text-sm font-medium">{attempt.prompt_text}</p>
                        <Badge variant="secondary">{Math.round(attempt.score * 100)}%</Badge>
                      </div>
                      {attempt.focus_topics.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {attempt.focus_topics.slice(0, 3).map((topic) => (
                            <Badge key={topic} variant="outline">{topic}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No evaluated attempts yet.</p>
                )}
              </CardContent>
            </Card>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isResourceViewerOpen} onOpenChange={setIsResourceViewerOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{selectedCitation?.asset_title ?? "Resource material"}</DialogTitle>
            <DialogDescription>
              Opens the cited source material in Orion so you can read it while writing your exam answer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-muted-foreground">
              {selectedCitation?.locator ?? selectedCitation?.asset_type ?? "workspace material"}
            </p>
            {selectedCitationUrl && (
              <a href={selectedCitationUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm" className="gap-1.5">
                  Open in new tab
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            )}
          </div>
          <div className="h-[70vh] overflow-hidden rounded-lg border bg-muted">
            {selectedCitationUrl ? (
              <iframe title="Exam citation resource" src={selectedCitationUrl} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Unable to load this resource.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
