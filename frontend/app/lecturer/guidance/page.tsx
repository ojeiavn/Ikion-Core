"use client"

import { useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { IkionGuidancePack, formatUtcTimestamp, ikionFetch } from "@/lib/ikion-api"
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Save,
  Search,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

export default function GuidanceEditorPage() {
  const { workspaceId } = useActiveWorkspaceId()
  const [guidancePacks, setGuidancePacks] = useState<IkionGuidancePack[]>([])
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: "Default Guidance",
    instructions: "Answer concisely, cite evidence, and refuse unsupported claims.",
    activate: true,
    scope: "workspace",
  })

  const loadGuidance = async () => {
    if (!workspaceId) {
      setGuidancePacks([])
      setSelectedPackId(null)
      return
    }

    const packs = await ikionFetch<IkionGuidancePack[]>(`/workspaces/${workspaceId}/guidance`)
    setGuidancePacks(packs)
    setSelectedPackId((current) => current ?? packs[0]?.id ?? null)
  }

  useEffect(() => {
    const run = async () => {
      setError(null)
      setIsLoading(true)
      try {
        await loadGuidance()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load guidance packs.")
      } finally {
        setIsLoading(false)
      }
    }

    void run()
  }, [workspaceId])

  const filteredGuidance = useMemo(
    () => guidancePacks.filter((pack) => pack.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [guidancePacks, searchQuery]
  )

  const selectedPack = guidancePacks.find((pack) => pack.id === selectedPackId) ?? null

  useEffect(() => {
    if (!selectedPack) return
    setFormData({
      name: selectedPack.name,
      instructions: selectedPack.instructions,
      activate: selectedPack.is_active,
      scope: typeof selectedPack.metadata?.scope === "string" ? selectedPack.metadata.scope : "workspace",
    })
  }, [selectedPack])

  const createBlankPack = () => {
    setSelectedPackId(null)
    setFormData({
      name: "New Guidance Pack",
      instructions: "",
      activate: true,
      scope: "workspace",
    })
  }

  const saveGuidance = async () => {
    if (!workspaceId || !formData.name.trim() || !formData.instructions.trim()) return

    setIsSaving(true)
    setError(null)
    try {
      const created = await ikionFetch<IkionGuidancePack>(`/workspaces/${workspaceId}/guidance`, {
        method: "POST",
        body: JSON.stringify({
          name: formData.name,
          instructions: formData.instructions,
          metadata: {
            ...(selectedPack ? { derived_from_guidance_id: selectedPack.id } : {}),
            scope: formData.scope,
          },
          activate: formData.activate,
        }),
      })

      await loadGuidance()
      setSelectedPackId(created.id)
      toast.success("Guidance pack published.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save guidance pack."
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <aside className="w-80 border-r border-border bg-background">
        <div className="flex h-full flex-col">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Guidance Packs</h2>
              <Button size="sm" className="gap-1.5" onClick={createBlankPack}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search guidance..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-1 p-3">
              {!workspaceId ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Select a workspace in Admin first.
                </div>
              ) : isLoading ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Loading guidance packs...
                </div>
              ) : filteredGuidance.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No guidance packs yet.
                </div>
              ) : (
                filteredGuidance.map((guidance) => (
                  <button
                    key={guidance.id}
                    onClick={() => setSelectedPackId(guidance.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedPackId === guidance.id
                        ? "border-accent bg-accent/5"
                        : "border-transparent hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{guidance.name}</span>
                      {guidance.is_active ? (
                        <CheckCircle2 className="h-4 w-4 text-chart-2" />
                      ) : (
                        <Badge variant="secondary" className="text-xs">inactive</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Updated {formatUtcTimestamp(guidance.updated_at)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl p-6 lg:p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Guidance Pack Publisher</h1>
              <p className="mt-1 text-muted-foreground">
                Create new guidance pack versions that shape Ikion’s response style for the active workspace.
              </p>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" disabled>
                <Sparkles className="h-4 w-4" />
                Preview
              </Button>
              <Button className="gap-2" onClick={() => void saveGuidance()} disabled={isSaving || !workspaceId}>
                <Save className="h-4 w-4" />
                {isSaving ? "Publishing..." : "Publish Guidance"}
              </Button>
            </div>
          </div>

          {!workspaceId ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              No active workspace is selected. Open Admin and choose a workspace first.
            </div>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Guidance Pack Name</CardTitle>
                  <CardDescription>Name the version you want to publish.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                    <Input
                      value={formData.name}
                      onChange={(event) => setFormData((previous) => ({ ...previous, name: event.target.value }))}
                      placeholder="e.g. Exam response guidance v2"
                    />
                    <select
                      value={formData.scope}
                      onChange={(event) => setFormData((previous) => ({ ...previous, scope: event.target.value }))}
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="workspace">Workspace-wide</option>
                      <option value="exam_general">Exam guidance</option>
                    </select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Instructions</CardTitle>
                  <CardDescription>
                    These instructions shape how Ikion responds. They do not replace evidence grounding.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={formData.instructions}
                    onChange={(event) => setFormData((previous) => ({ ...previous, instructions: event.target.value }))}
                    placeholder="Answer concisely, cite evidence, and refuse unsupported claims."
                    className="min-h-[220px]"
                  />
                </CardContent>
              </Card>

              <Card className="border-accent/30 bg-accent/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-accent" />
                    Publishing Model
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Guidance packs are versioned by creation. Saving publishes a new pack instead of mutating history.</p>
                  <p>If you publish with activation enabled, the new pack becomes part of the active guidance used during answering.</p>
                  {selectedPack && (
                    <p>
                      This draft is currently derived from <strong>{selectedPack.name}</strong>.
                    </p>
                  )}
                </CardContent>
              </Card>

              {selectedPack && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Selected Pack Metadata</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>ID: {selectedPack.id}</p>
                    <p>Created: {formatUtcTimestamp(selectedPack.created_at)}</p>
                    <p>Updated: {formatUtcTimestamp(selectedPack.updated_at)}</p>
                    <p>Status: {selectedPack.is_active ? "Active" : "Inactive"}</p>
                  </CardContent>
                </Card>
              )}

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertCircle className="h-4 w-4 text-accent" />
                    API Limitation
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The current Ikion backend supports creating and listing guidance packs, but not deleting or mutating them in place. This screen therefore publishes new versions rather than pretending to edit old ones.
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
