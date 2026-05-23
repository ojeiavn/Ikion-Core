"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { IkionAsset, IkionWorkspaceSummary, fileToBase64, ikionFetch } from "@/lib/ikion-api"
import { setActiveWorkspaceId } from "@/lib/workspace-store"
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

export default function LecturerCoursesPage() {
  const { workspaceId, refreshWorkspaceId } = useActiveWorkspaceId()
  const [courses, setCourses] = useState<IkionWorkspaceSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [assets, setAssets] = useState<IkionAsset[]>([])
  const [fileAsset, setFileAsset] = useState<File | null>(null)
  const [fileAssetTitle, setFileAssetTitle] = useState("")
  const [pdfCategory, setPdfCategory] = useState("lecture_material")
  const [examSession, setExamSession] = useState("")
  const [linkedExamAssetId, setLinkedExamAssetId] = useState("")
  const [defaultQuestionGuidance, setDefaultQuestionGuidance] = useState("")
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoTitle, setVideoTitle] = useState("")
  const [videoExternalRef, setVideoExternalRef] = useState("")
  const [transcriptTitle, setTranscriptTitle] = useState("Structured Transcript")
  const [transcriptSegments, setTranscriptSegments] = useState(
    "00:00:12|00:00:24|Introduce the core parallel computing idea.\n00:00:24|00:00:38|Explain why this matters for the upcoming exercise."
  )
  const [linkedVideoAssetId, setLinkedVideoAssetId] = useState("")

  useEffect(() => {
    const load = async () => {
      setError(null)
      setIsLoading(true)
      try {
        const workspaceList = await ikionFetch<IkionWorkspaceSummary[]>("/me/workspaces")
        setCourses(workspaceList)
        if (!workspaceId && workspaceList.length > 0) {
          setActiveWorkspaceId(workspaceList[0].id)
          refreshWorkspaceId()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load courses.")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [workspaceId, refreshWorkspaceId])

  useEffect(() => {
    const loadAssets = async () => {
      if (!workspaceId) {
        setAssets([])
        return
      }
      try {
        const assetList = await ikionFetch<IkionAsset[]>(`/workspaces/${workspaceId}/assets`)
        setAssets(assetList)
      } catch {
        setAssets([])
      }
    }
    void loadAssets()
  }, [workspaceId])

  const activeCourse = useMemo(
    () => courses.find((course) => course.id === workspaceId) ?? null,
    [courses, workspaceId]
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

  const videoAssets = useMemo(
    () => assets.filter((asset) => asset.asset_type === "video"),
    [assets]
  )

  const uploadPdf = async () => {
    if (!workspaceId || !fileAsset) return
    setIsSubmitting(true)
    setError(null)
    try {
      const contentBase64 = await fileToBase64(fileAsset)
      await ikionFetch(`/workspaces/${workspaceId}/assets/file`, {
        method: "POST",
        body: JSON.stringify({
          asset_type: "pdf",
          title: fileAssetTitle || fileAsset.name,
          filename: fileAsset.name,
          content_base64: contentBase64,
          mime_type: fileAsset.type || null,
          metadata: {
            document_category: pdfCategory,
            exam_session: examSession || null,
            linked_exam_asset_id: pdfCategory === "mark_scheme" ? linkedExamAssetId || null : null,
            default_question_guidance:
              pdfCategory === "exam_paper" && defaultQuestionGuidance.trim() ? defaultQuestionGuidance.trim() : null,
          },
        }),
      })
      setFileAsset(null)
      setFileAssetTitle("")
      setExamSession("")
      setLinkedExamAssetId("")
      setDefaultQuestionGuidance("")
      toast.success("PDF uploaded.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload PDF."
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const registerVideo = async () => {
    if (!workspaceId) return
    setIsSubmitting(true)
    setError(null)
    try {
      if (videoFile) {
        const contentBase64 = await fileToBase64(videoFile)
        await ikionFetch(`/workspaces/${workspaceId}/assets/video`, {
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
        await ikionFetch(`/workspaces/${workspaceId}/assets/video`, {
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
      setVideoTitle("")
      toast.success("Video registered.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to register video."
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const uploadTranscriptSegments = async () => {
    if (!workspaceId || !linkedVideoAssetId || !transcriptSegments.trim()) return
    setIsSubmitting(true)
    setError(null)
    try {
      await ikionFetch(`/workspaces/${workspaceId}/assets/transcript`, {
        method: "POST",
        body: JSON.stringify({
          title: transcriptTitle,
          linked_video_asset_id: linkedVideoAssetId,
          segments: parseTranscriptSegments(transcriptSegments),
          metadata: {},
        }),
      })
      setTranscriptTitle("Structured Transcript")
      setTranscriptSegments("")
      setLinkedVideoAssetId("")
      toast.success("Timestamped transcript uploaded.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to upload transcript."
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="p-6 lg:p-8 text-sm text-muted-foreground">Loading courses...</div>
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="mt-1 text-muted-foreground">
          Select the active course and upload new materials for your students.
        </p>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => {
          const isActive = course.id === activeCourse?.id
          return (
            <Card key={course.id} className={isActive ? "border-primary/50" : ""}>
              <CardHeader>
                <CardTitle className="text-base">{course.name}</CardTitle>
                <CardDescription>{course.description || "No description provided."}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant={isActive ? "secondary" : "default"}
                  onClick={() => {
                    setActiveWorkspaceId(course.id)
                    refreshWorkspaceId()
                  }}
                  className="w-full"
                >
                  {isActive ? "Active Course" : "Set Active"}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {!activeCourse ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a course to upload materials.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload PDF</CardTitle>
              <CardDescription>Upload lecture slides, exam papers, or mark schemes to the active course.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={fileAssetTitle} onChange={(event) => setFileAssetTitle(event.target.value)} placeholder="Optional title" />
              <select
                value={pdfCategory}
                onChange={(event) => setPdfCategory(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
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
                  placeholder="Optional guidance to apply to each extracted exam question."
                  className="min-h-[100px]"
                />
              )}
              <Input type="file" accept=".pdf,application/pdf" onChange={(event) => setFileAsset(event.target.files?.[0] ?? null)} />
              <Button onClick={uploadPdf} disabled={!fileAsset || isSubmitting}>
                Upload PDF
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Register Video</CardTitle>
              <CardDescription>Upload a lecture recording and Ikion will automatically generate a linked timed transcript. External-only streams can still be registered, but auto-transcription needs uploaded media.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} placeholder="Video title" />
              <Input value={videoExternalRef} onChange={(event) => setVideoExternalRef(event.target.value)} placeholder="External URL (optional)" />
              <Input type="file" accept="video/*" onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)} />
              <Button
                onClick={registerVideo}
                disabled={isSubmitting || (!videoFile && !videoExternalRef.trim())}
              >
                Register Video
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Timestamped Transcript</CardTitle>
              <CardDescription>Optional manual override. Every timestamped transcript must be linked to a lecture video so students can jump directly to the right lecture moments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={transcriptTitle} onChange={(event) => setTranscriptTitle(event.target.value)} placeholder="Transcript title" />
              <select
                value={linkedVideoAssetId}
                onChange={(event) => setLinkedVideoAssetId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select linked lecture video</option>
                {videoAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title}
                  </option>
                ))}
              </select>
              <Textarea
                value={transcriptSegments}
                onChange={(event) => setTranscriptSegments(event.target.value)}
                rows={7}
                placeholder="00:00:12|00:00:24|Transcript text..."
              />
              <p className="text-xs text-muted-foreground">
                Use one line per segment: `start|end|text`. This transcript is tied to the selected lecture video, and Ikion uses the timestamps for transcript query search in Ask Ikion and Lecture Explorer.
              </p>
              {videoAssets.length === 0 && (
                <p className="text-xs text-amber-200">
                  Upload or register a lecture video first. Transcripts cannot be added until they are linked to a lecture in this workspace.
                </p>
              )}
              <Button onClick={uploadTranscriptSegments} disabled={isSubmitting || !linkedVideoAssetId || !transcriptSegments.trim()}>
                Upload Transcript
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
