"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { OrionCitation, getBackendBaseUrl } from "@/lib/orion-api"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, FileText, ExternalLink } from "lucide-react"

type SlideRef = {
  citationIndex: number
  assetId: string
  assetTitle: string
  page: number
  locator: string | null
}

function parsePage(locator: string | null | undefined): number | null {
  if (!locator) return null
  const match = locator.match(/page\s+(\d+)/i) || locator.match(/p\.?\s*(\d+)/i)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

export function SlideDeck({
  workspaceId,
  citations,
  showHeader = true,
  className,
}: {
  workspaceId: string
  citations: OrionCitation[]
  showHeader?: boolean
  className?: string
}) {
  const backendBase = useMemo(() => getBackendBaseUrl(), [])
  const slides = useMemo<SlideRef[]>(() => {
    const refs: SlideRef[] = []
    for (const citation of citations) {
      if (citation.asset_type !== "pdf") continue
      const page = parsePage(citation.locator)
      if (!page) continue
      refs.push({
        citationIndex: citation.index,
        assetId: citation.asset_id,
        assetTitle: citation.asset_title,
        page,
        locator: citation.locator,
      })
    }
    // Deduplicate by (assetId,page) while preserving order.
    const seen = new Set<string>()
    return refs.filter((ref) => {
      const key = `${ref.assetId}:${ref.page}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [citations])

  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const active = slides[activeIndex] ?? null
  const pdfUrl =
    active && workspaceId
      ? `${backendBase}/workspaces/${workspaceId}/assets/${active.assetId}/content#page=${active.page}`
      : null
  const rawPdfUrl =
    active && workspaceId
      ? `${backendBase}/workspaces/${workspaceId}/assets/${active.assetId}/content`
      : null

  if (slides.length === 0) return null

  return (
    <div className={cn("space-y-2", className)}>
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Slides
          </p>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
            Open viewer
          </Button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {slides.map((slide, index) => (
          <button
            key={`${slide.assetId}:${slide.page}`}
            type="button"
            onClick={() => {
              setActiveIndex(index)
              setOpen(true)
            }}
            className={cn(
              "w-64 shrink-0 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/40",
              index === activeIndex ? "border-accent/60" : ""
            )}
          >
            <p className="text-xs text-muted-foreground">p. {slide.page} • citation [{slide.citationIndex}]</p>
            <p className="mt-1 line-clamp-2 text-sm font-medium">
              {slide.assetTitle?.trim() ? slide.assetTitle : slide.assetId.slice(0, 10)}
            </p>
          </button>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Relevant slides</DialogTitle>
            <DialogDescription>
              Scroll through the slide pages cited in this answer.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{active?.assetTitle ?? "Slide deck"}</p>
              <p className="text-xs text-muted-foreground">
                Page {active?.page ?? "-"} {active?.locator ? `• ${active.locator}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
                disabled={activeIndex <= 0}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveIndex((prev) => Math.min(slides.length - 1, prev + 1))}
                disabled={activeIndex >= slides.length - 1}
                className="gap-2"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
              {rawPdfUrl && (
                <a href={rawPdfUrl} target="_blank" rel="noreferrer">
                  <Button variant="ghost" size="sm" className="gap-2">
                    Open PDF
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </a>
              )}
            </div>
          </div>

          <div className="h-[70vh] overflow-hidden rounded-lg border bg-muted">
            {pdfUrl ? (
              <iframe title="Slide preview" src={pdfUrl} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Unable to load slide preview.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
