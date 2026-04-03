"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertCircle, BookOpen, Database, FileText, Link2, MessageSquare, Play, RefreshCw, Sparkles } from "lucide-react"

import {
  OrionAsset,
  OrionCorpusInspection,
  OrionGuidancePack,
  OrionWorkspace,
  fileToBase64,
  formatUtcTimestamp,
  orionFetch,
} from "@/lib/orion-api"
import { getActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/workspace-store"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

function parseTimecode(value: string) {
  const parts = value.trim().split(":").map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid timecode: ${value}`)
  }
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  throw new Error(`Invalid timecode: ${value}`)
}

function parseTranscriptSegments(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [startRaw, endRaw, ...rest] = line.split("|")
      const text = rest.join("|").trim()
      if (!startRaw || !endRaw || !text) {
        throw new Error("Each transcript line must be start|end|text")
      }
      return {
        start: parseTimecode(startRaw),
        end: parseTimecode(endRaw),
        text,
      }
    })
}

export default function AdminDashboard() {
  const [workspaces, setWorkspaces] = useState<OrionWorkspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(null)
  const [assets, setAssets] = useState<OrionAsset[]>([])
  const [guidancePacks, setGuidancePacks] = useState<OrionGuidancePack[]>([])
  const [corpusInspection, setCorpusInspection] = useState<OrionCorpusInspection | null>(null)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [workspaceName, setWorkspaceName] = useState("Orion Core Workspace")
  const [workspaceDescription, setWorkspaceDescription] = useState("Primary managed knowledge workspace.")
  const [guidanceName, setGuidanceName] = useState("Default Guidance")
  const [guidanceText, setGuidanceText] = useState("Answer concisely, cite evidence, and refuse unsupported claims.")
  const [noticeTitle, setNoticeTitle] = useState("Latest Notice")
  const [noticeText, setNoticeText] = useState("")
  const [fileAssetType, setFileAssetType] = useState<"pdf">("pdf")
  const [fileAssetTitle, setFileAssetTitle] = useState("")
  const [fileAsset, setFileAsset] = useState<File | null>(null)
  const [pdfCategory, setPdfCategory] = useState("lecture_material")
  const [examSession, setExamSession] = useState("")
  const [linkedExamAssetId, setLinkedExamAssetId] = useState("")
  const [defaultQuestionGuidance, setDefaultQuestionGuidance] = useState("")
  const [videoTitle, setVideoTitle] = useState("Lecture Recording")
  const [videoExternalRef, setVideoExternalRef] = useState("")
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [transcriptTitle, setTranscriptTitle] = useState("Structured Transcript")
  const [transcriptSegments, setTranscriptSegments] = useState("00:00:12|00:00:24|Before the workshop, review the security handbook.\n00:00:24|00:00:38|The first session covers incident escalation and reporting.")
  const [linkedVideoAssetId, setLinkedVideoAssetId] = useState("")

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces]
  )

  const videoAssets = useMemo(
    () => assets.filter((asset) => asset.asset_type === "video"),
    [assets]
  )

  const examPaperAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.asset_type === "pdf" &&
          typeof asset.metadata?.document_category === "string" &&
          asset.metadata.document_category === "exam_paper"
      ),
    [assets]
  )

  const chunkableAssetCount = useMemo(
    () => assets.filter((asset) => ["pdf", "transcript", "notice"].includes(asset.asset_type)).length,
    [assets]
  )

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const workspaceList = await orionFetch<OrionWorkspace[]>("/workspaces")
        setWorkspaces(workspaceList)

        const storedWorkspaceId = getActiveWorkspaceId()
        const initialWorkspaceId =
          (storedWorkspaceId && workspaceList.some((workspace) => workspace.id === storedWorkspaceId) ? storedWorkspaceId : null) ??
          workspaceList[0]?.id ??
          null

        if (initialWorkspaceId) {
          setActiveWorkspaceId(initialWorkspaceId)
          setActiveWorkspaceIdState(initialWorkspaceId)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load workspaces.")
      } finally {
        setIsBootstrapping(false)
      }
    }

    void bootstrap()
  }, [])

  useEffect(() => {
    if (!activeWorkspaceId) {
      setAssets([])
      setGuidancePacks([])
      setCorpusInspection(null)
      return
    }

    const hydrateWorkspace = async () => {
      try {
        const [assetList, guidanceList] = await Promise.all([
          orionFetch<OrionAsset[]>(`/workspaces/${activeWorkspaceId}/assets`),
          orionFetch<OrionGuidancePack[]>(`/workspaces/${activeWorkspaceId}/guidance`),
        ])

        setAssets(assetList)
        setGuidancePacks(guidanceList)

        try {
          const corpus = await orionFetch<OrionCorpusInspection>(`/workspaces/${activeWorkspaceId}/corpus/active`)
          setCorpusInspection(corpus)
        } catch {
          setCorpusInspection(null)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load workspace data.")
      }
    }

    void hydrateWorkspace()
  }, [activeWorkspaceId])

  const refreshWorkspaces = async () => {
    const workspaceList = await orionFetch<OrionWorkspace[]>("/workspaces")
    setWorkspaces(workspaceList)
    return workspaceList
  }

  const refreshWorkspaceState = async (workspaceId: string) => {
    const [assetList, guidanceList] = await Promise.all([
      orionFetch<OrionAsset[]>(`/workspaces/${workspaceId}/assets`),
      orionFetch<OrionGuidancePack[]>(`/workspaces/${workspaceId}/guidance`),
    ])

    setAssets(assetList)
    setGuidancePacks(guidanceList)

    try {
      const corpus = await orionFetch<OrionCorpusInspection>(`/workspaces/${workspaceId}/corpus/active`)
      setCorpusInspection(corpus)
    } catch {
      setCorpusInspection(null)
    }
  }

  const runAction = async (task: () => Promise<void>, successMessage: string) => {
    setError(null)
    setSuccess(null)
    setIsBusy(true)
    try {
      await task()
      setSuccess(successMessage)
      toast.success(successMessage)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong."
      setError(message)
      toast.error(message)
    } finally {
      setIsBusy(false)
    }
  }

  const handleCreateWorkspace = async () => {
    await runAction(async () => {
      const workspace = await orionFetch<OrionWorkspace>("/workspaces", {
        method: "POST",
        body: JSON.stringify({
          name: workspaceName,
          description: workspaceDescription,
          metadata: { vertical: "core" },
        }),
      })

      const workspaceList = await refreshWorkspaces()
      setActiveWorkspaceId(workspace.id)
      setActiveWorkspaceIdState(workspace.id)
      setWorkspaces(workspaceList)
      await refreshWorkspaceState(workspace.id)
    }, "Workspace created.")
  }

  const handleCreateGuidance = async () => {
    if (!activeWorkspaceId) return
    await runAction(async () => {
      await orionFetch(`/workspaces/${activeWorkspaceId}/guidance`, {
        method: "POST",
        body: JSON.stringify({
          name: guidanceName,
          instructions: guidanceText,
          metadata: {},
          activate: true,
        }),
      })
      await refreshWorkspaceState(activeWorkspaceId)
    }, "Guidance pack saved.")
  }

  const handleCreateNotice = async () => {
    if (!activeWorkspaceId) return
    await runAction(async () => {
      await orionFetch(`/workspaces/${activeWorkspaceId}/assets/text`, {
        method: "POST",
        body: JSON.stringify({
          asset_type: "notice",
          title: noticeTitle,
          text: noticeText,
          filename: "notice.txt",
          metadata: {},
        }),
      })
      setNoticeText("")
      await refreshWorkspaceState(activeWorkspaceId)
    }, "Notice ingested.")
  }

  const handleFileAssetUpload = async () => {
    if (!activeWorkspaceId || !fileAsset) return
    await runAction(async () => {
      const contentBase64 = await fileToBase64(fileAsset)
      await orionFetch(`/workspaces/${activeWorkspaceId}/assets/file`, {
        method: "POST",
        body: JSON.stringify({
          asset_type: fileAssetType,
          title: fileAssetTitle || fileAsset.name,
          filename: fileAsset.name,
          content_base64: contentBase64,
          mime_type: fileAsset.type || null,
          metadata:
            fileAssetType === "pdf"
              ? {
                  document_category: pdfCategory,
                  exam_session: examSession || null,
                  linked_exam_asset_id: pdfCategory === "mark_scheme" ? linkedExamAssetId || null : null,
                  default_question_guidance:
                    pdfCategory === "exam_paper" && defaultQuestionGuidance.trim() ? defaultQuestionGuidance.trim() : null,
                }
              : {},
        }),
      })
      setFileAsset(null)
      setFileAssetTitle("")
      setExamSession("")
      setLinkedExamAssetId("")
      setDefaultQuestionGuidance("")
      await refreshWorkspaceState(activeWorkspaceId)
    }, "PDF uploaded.")
  }

  const handleVideoUpload = async () => {
    if (!activeWorkspaceId) return
    await runAction(async () => {
      if (videoFile) {
        const contentBase64 = await fileToBase64(videoFile)
        await orionFetch(`/workspaces/${activeWorkspaceId}/assets/video`, {
          method: "POST",
          body: JSON.stringify({
            title: videoTitle || videoFile.name,
            filename: videoFile.name,
            content_base64: contentBase64,
            mime_type: videoFile.type || null,
            metadata: {},
          }),
        })
      } else {
        await orionFetch(`/workspaces/${activeWorkspaceId}/assets/video`, {
          method: "POST",
          body: JSON.stringify({
            title: videoTitle,
            external_ref: videoExternalRef || null,
            metadata: {},
          }),
        })
      }

      setVideoFile(null)
      setVideoExternalRef("")
      await refreshWorkspaceState(activeWorkspaceId)
    }, "Video registered.")
  }

  const handleTranscriptSegmentsUpload = async () => {
    if (!activeWorkspaceId) return
    await runAction(async () => {
      await orionFetch(`/workspaces/${activeWorkspaceId}/assets/transcript`, {
        method: "POST",
        body: JSON.stringify({
          title: transcriptTitle,
          linked_video_asset_id: linkedVideoAssetId,
          segments: parseTranscriptSegments(transcriptSegments),
          metadata: {},
        }),
      })
      await refreshWorkspaceState(activeWorkspaceId)
    }, "Timestamped transcript ingested.")
  }

  const handleBackfillTranscripts = async () => {
    if (!activeWorkspaceId) return
    await runAction(async () => {
      const result = await orionFetch<{ status: string; scheduled_count: number }>(
        `/workspaces/${activeWorkspaceId}/transcripts/backfill`,
        {
          method: "POST",
          timeoutMs: 20000,
        }
      )
      await refreshWorkspaceState(activeWorkspaceId)
      setSuccess(
        result.scheduled_count > 0
          ? `Queued transcript generation for ${result.scheduled_count} lecture video${result.scheduled_count === 1 ? "" : "s"}.`
          : "No missing lecture transcripts needed to be queued."
      )
    }, "Transcript backfill request completed.")
  }

  const handleBuildCorpus = async () => {
    if (!activeWorkspaceId) return
    await runAction(async () => {
      await orionFetch(`/workspaces/${activeWorkspaceId}/corpus/build`, {
        method: "POST",
      })
      await refreshWorkspaceState(activeWorkspaceId)
    }, "Corpus built and activated.")
  }

  if (isBootstrapping) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading Orion admin controls...</div>
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Orion Core Control Panel</h1>
          <p className="mt-1 text-muted-foreground">
            Create workspaces, ingest managed content, activate corpora, and publish guidance.
          </p>
        </div>
        {activeWorkspace && (
          <Badge variant="secondary" className="w-fit gap-2 px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Active workspace: {activeWorkspace.name}
          </Badge>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Create or Select Workspace</CardTitle>
            <CardDescription>Every corpus build, query, and insight report is scoped to one active workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Workspace name" />
              <Input value={workspaceDescription} onChange={(event) => setWorkspaceDescription(event.target.value)} placeholder="Workspace description" />
            </div>
            <Button onClick={handleCreateWorkspace} disabled={isBusy || !workspaceName.trim()}>
              Create Workspace
            </Button>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {workspaces.map((workspace) => {
                const isActive = workspace.id === activeWorkspaceId
                return (
                  <button
                    key={workspace.id}
                    type="button"
                    onClick={() => {
                      setActiveWorkspaceId(workspace.id)
                      setActiveWorkspaceIdState(workspace.id)
                    }}
                    className={`rounded-xl border p-4 text-left transition-colors ${isActive ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{workspace.name}</p>
                        <p className="text-xs text-muted-foreground">{workspace.slug}</p>
                      </div>
                      {isActive && <Badge>Active</Badge>}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {workspace.description || "No description set."}
                    </p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workspace Snapshot</CardTitle>
            <CardDescription>Live backend state for the current workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Assets</p>
                <p className="mt-2 text-2xl font-semibold">{assets.length}</p>
                <p className="text-sm text-muted-foreground">{chunkableAssetCount} chunkable sources</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Guidance Packs</p>
                <p className="mt-2 text-2xl font-semibold">{guidancePacks.length}</p>
                <p className="text-sm text-muted-foreground">Latest guidance is active workspace policy.</p>
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium">Corpus status</p>
                <Badge variant={corpusInspection?.database_record ? "secondary" : "outline"}>
                  {corpusInspection?.database_record?.status ?? "Not built"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {corpusInspection?.database_record
                  ? `${corpusInspection.database_record.chunk_count} chunks in active corpus`
                  : "Build the corpus after uploading content."}
              </p>
              {corpusInspection?.database_record?.activated_at && (
                <p className="text-xs text-muted-foreground">
                  Activated {formatUtcTimestamp(corpusInspection.database_record.activated_at)}
                </p>
              )}
              <Button onClick={handleBuildCorpus} disabled={isBusy || !activeWorkspaceId || chunkableAssetCount === 0} className="w-full gap-2">
                <RefreshCw className="h-4 w-4" />
                Build Active Corpus
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Guidance Pack</CardTitle>
            <CardDescription>Management-authored instructions that shape answer style without replacing evidence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={guidanceName} onChange={(event) => setGuidanceName(event.target.value)} placeholder="Guidance pack name" />
            <Textarea value={guidanceText} onChange={(event) => setGuidanceText(event.target.value)} rows={6} placeholder="Enter workspace guidance..." />
            <Button onClick={handleCreateGuidance} disabled={isBusy || !activeWorkspaceId || !guidanceText.trim()}>
              Save Guidance
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notice / Announcement</CardTitle>
            <CardDescription>Quick text content that becomes retrievable evidence for the workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={noticeTitle} onChange={(event) => setNoticeTitle(event.target.value)} placeholder="Notice title" />
            <Textarea value={noticeText} onChange={(event) => setNoticeText(event.target.value)} rows={6} placeholder="Paste the notice text..." />
            <Button onClick={handleCreateNotice} disabled={isBusy || !activeWorkspaceId || !noticeText.trim()}>
              Publish Notice
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload PDF</CardTitle>
            <CardDescription>Browser-selected PDF files are base64-posted to the backend and stored in the active workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={fileAssetTitle} onChange={(event) => setFileAssetTitle(event.target.value)} placeholder="Optional asset title" />
            <select
              value={pdfCategory}
              onChange={(event) => setPdfCategory(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="lecture_material">Lecture material</option>
              <option value="exam_paper">Exam paper</option>
              <option value="mark_scheme">Mark scheme</option>
            </select>
            {(pdfCategory === "exam_paper" || pdfCategory === "mark_scheme") && (
              <Input
                value={examSession}
                onChange={(event) => setExamSession(event.target.value)}
                placeholder="Exam session (optional)"
              />
            )}
            {pdfCategory === "mark_scheme" && (
              <select
                value={linkedExamAssetId}
                onChange={(event) => setLinkedExamAssetId(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Link to exam paper (optional)</option>
                {examPaperAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title}
                  </option>
                ))}
              </select>
            )}
            {pdfCategory === "exam_paper" && (
              <Textarea
                value={defaultQuestionGuidance}
                onChange={(event) => setDefaultQuestionGuidance(event.target.value)}
                rows={4}
                placeholder="Optional guidance to apply to each extracted exam question from this paper."
              />
            )}
            <Input type="file" accept=".pdf,application/pdf" onChange={(event) => setFileAsset(event.target.files?.[0] ?? null)} />
            <Button onClick={handleFileAssetUpload} disabled={isBusy || !activeWorkspaceId || !fileAsset}>
              Upload PDF
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Register Video</CardTitle>
            <CardDescription>Upload a lecture video and Orion will automatically generate and store a linked timed transcript for transcript search. External-only links can still be registered, but auto-transcription requires uploaded media.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} placeholder="Video title" />
            <Input value={videoExternalRef} onChange={(event) => setVideoExternalRef(event.target.value)} placeholder="External URL or leave blank to upload a file" />
            <Input type="file" accept="video/*" onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)} />
            <Button onClick={handleVideoUpload} disabled={isBusy || !activeWorkspaceId || (!videoFile && !videoExternalRef.trim())}>
              Register Video
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timestamped Transcript Segments</CardTitle>
          <CardDescription>Optional manual override. Use one line per segment in the format `start|end|text`, and link it to the lecture video so Orion can surface exact playback moments in Ask Orion and Lecture Explorer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <Input value={transcriptTitle} onChange={(event) => setTranscriptTitle(event.target.value)} placeholder="Transcript title" />
            <select
              value={linkedVideoAssetId}
              onChange={(event) => setLinkedVideoAssetId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select linked lecture video</option>
              {videoAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.title}
                </option>
              ))}
            </select>
          </div>
          <Textarea value={transcriptSegments} onChange={(event) => setTranscriptSegments(event.target.value)} rows={8} />
          <p className="text-xs text-muted-foreground">
            This should be timestamped lecture transcript data such as `.vtt`, `.srt`, or structured segment exports. Every transcript must be tied to one lecture video so Orion can jump students to the top 3 most relevant moments inside that lecture.
          </p>
          {videoAssets.length === 0 && (
            <p className="text-xs text-amber-200">
              Register a lecture video first. Transcript ingestion is locked until a lecture video is available to link.
            </p>
          )}
          <Button onClick={handleTranscriptSegmentsUpload} disabled={isBusy || !activeWorkspaceId || !transcriptSegments.trim() || !linkedVideoAssetId}>
            Ingest Transcript Segments
          </Button>
          <Button onClick={handleBackfillTranscripts} variant="outline" disabled={isBusy || !activeWorkspaceId || videoAssets.length === 0}>
            Generate Missing Lecture Transcripts
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Managed Assets</CardTitle>
          <CardDescription>Everything currently registered against the active workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {assets.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              No assets yet. Create a workspace, add guidance, upload content, and build a corpus.
            </div>
          ) : (
            assets.map((asset) => {
              const Icon = asset.asset_type === "video" ? Play : asset.asset_type === "notice" ? MessageSquare : asset.asset_type === "transcript" ? FileText : BookOpen
              return (
                <div key={asset.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{asset.title}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{asset.asset_type}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Created {formatUtcTimestamp(asset.created_at)}</p>
                      </div>
                    </div>
                    <Badge variant="secondary">{asset.status}</Badge>
                  </div>
                  {(asset.external_ref || asset.content_path) && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Link2 className="h-3.5 w-3.5" />
                      <span className="truncate">{asset.external_ref ?? asset.content_path}</span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
