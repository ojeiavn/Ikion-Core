"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import {
  OrionAsset,
  OrionCorpusInspection,
  OrionWorkspace,
  formatUtcTimestamp,
  getBackendBaseUrl,
  orionFetch,
} from "@/lib/orion-api"
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FileQuestion,
  FileText,
  RefreshCw,
  Search,
  Upload,
  Video,
} from "lucide-react"
import { toast } from "sonner"

const typeIcons = {
  pdf: FileText,
  video: Video,
  transcript: BookOpen,
  notice: FileQuestion,
}

const typeColors = {
  pdf: "text-chart-1 bg-chart-1/10",
  video: "text-chart-4 bg-chart-4/10",
  transcript: "text-chart-2 bg-chart-2/10",
  notice: "text-accent bg-accent/10",
}

export default function ModulesPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const backendBase = getBackendBaseUrl()
  const [workspaces, setWorkspaces] = useState<OrionWorkspace[]>([])
  const [assets, setAssets] = useState<OrionAsset[]>([])
  const [corpusInspection, setCorpusInspection] = useState<OrionCorpusInspection | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState("all")
  const [isLoading, setIsLoading] = useState(true)
  const [isBuilding, setIsBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? null,
    [workspaceId, workspaces]
  )

  const load = async () => {
    setError(null)
    setIsLoading(true)

    try {
      const workspaceList = await orionFetch<OrionWorkspace[]>("/workspaces")
      setWorkspaces(workspaceList)

      if (!workspaceId) {
        setAssets([])
        setCorpusInspection(null)
        return
      }

      const assetList = await orionFetch<OrionAsset[]>(`/workspaces/${workspaceId}/assets`)
      setAssets(assetList)

      try {
        const corpus = await orionFetch<OrionCorpusInspection>(`/workspaces/${workspaceId}/corpus/active`)
        setCorpusInspection(corpus)
      } catch {
        setCorpusInspection(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load module management data.")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [workspaceId])

  const filteredMaterials = useMemo(
    () =>
      assets.filter((asset) => {
        const matchesSearch = asset.title.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesType = selectedType === "all" || asset.asset_type === selectedType
        return matchesSearch && matchesType
      }),
    [assets, searchQuery, selectedType]
  )

  const stats = useMemo(() => {
    const processed = assets.filter((asset) => asset.status === "processed" || asset.status === "ready").length
    const processing = assets.filter((asset) => asset.status !== "processed" && asset.status !== "ready").length
    return { processed, processing }
  }, [assets])

  const buildCorpus = async () => {
    if (!workspaceId) return

    setIsBuilding(true)
    setError(null)
    try {
      await orionFetch(`/workspaces/${workspaceId}/corpus/build`, { method: "POST" })
      await load()
      toast.success("Corpus rebuilt and activated.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to rebuild corpus."
      setError(message)
      toast.error(message)
    } finally {
      setIsBuilding(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="break-words text-2xl font-bold tracking-tight">Module Management</h1>
          <p className="mt-1 text-muted-foreground">
            Inspect workspace assets and rebuild the active corpus.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={() => void buildCorpus()} disabled={!workspaceId || isBuilding}>
            <RefreshCw className="h-4 w-4" />
            {isBuilding ? "Rebuilding..." : "Rebuild Corpus"}
          </Button>
          <Link href="/admin">
            <Button className="gap-2">
              <Upload className="h-4 w-4" />
              Upload Materials
            </Button>
          </Link>
        </div>
      </div>

      {!workspaceId ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          No active workspace is selected. Open Admin and choose a workspace first.
        </div>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <Select value={activeWorkspace?.id ?? workspaceId} disabled>
                    <SelectTrigger className="w-[320px]">
                      <SelectValue placeholder={activeWorkspace?.name ?? "Active workspace"} />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((workspace) => (
                        <SelectItem key={workspace.id} value={workspace.id}>
                          {workspace.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="hidden sm:block">
                    <Badge variant="secondary">
                      {corpusInspection?.database_record?.chunk_count ?? 0} chunks
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-chart-2" />
                    {stats.processed} processed
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-accent" />
                    {stats.processing} pending
                  </span>
                </div>
              </div>

              {corpusInspection?.database_record && (
                <div className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
                  Active corpus version <strong>{corpusInspection.database_record.id}</strong> was activated{" "}
                  {corpusInspection.database_record.activated_at
                    ? formatUtcTimestamp(corpusInspection.database_record.activated_at)
                    : "recently"}.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base">Workspace Assets</CardTitle>
                  <CardDescription>PDFs, transcripts, notices, and videos registered to the active workspace.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search materials..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="w-64 pl-9"
                    />
                  </div>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="pdf">PDFs</SelectItem>
                      <SelectItem value="video">Videos</SelectItem>
                      <SelectItem value="transcript">Transcripts</SelectItem>
                      <SelectItem value="notice">Notices</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {isLoading ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Loading workspace assets...
                  </div>
                ) : filteredMaterials.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No matching materials found.
                  </div>
                ) : (
                  filteredMaterials.map((material) => {
                    const Icon = typeIcons[material.asset_type]
                    const colorClass = typeColors[material.asset_type]
                    const isProcessing = material.status !== "processed" && material.status !== "ready"
                    return (
                      <div key={material.id} className="flex items-center gap-4 rounded-lg border border-border p-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass}`}>
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="orion-wrap line-clamp-2 font-medium">{material.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="capitalize">{material.asset_type}</span>
                            <span className="text-border">|</span>
                            <span>{material.mime_type ?? "unknown mime"}</span>
                            <span className="text-border">|</span>
                            <span>{formatUtcTimestamp(material.created_at)}</span>
                            {(material.external_ref || material.content_path) && (
                              <>
                                <span className="text-border">|</span>
                                <span className="orion-wrap">{material.external_ref ?? material.content_path}</span>
                              </>
                            )}
                          </div>
                          {isProcessing && (
                            <div className="mt-2 flex items-center gap-2">
                              <Progress value={45} className="h-1.5 flex-1" />
                              <span className="text-xs text-muted-foreground">pending</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant={material.status === "processed" || material.status === "ready" ? "secondary" : "outline"}>
                            {material.status}
                          </Badge>
                          {material.asset_type === "video" && material.status === "ready" && workspaceId && (
                            <a
                              href={`${backendBase}/workspaces/${workspaceId}/assets/${material.id}/content`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-accent underline-offset-4 hover:underline"
                            >
                              Play
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
