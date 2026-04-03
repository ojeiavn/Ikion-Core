"use client"

import { useEffect, useMemo, useState } from "react"

import { VideoPlayerCard } from "@/components/video-player-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OrionPlayback } from "@/lib/orion-api"
import { cn } from "@/lib/utils"
import { Clock, Play } from "lucide-react"

function formatTimestamp(seconds?: number | null) {
  if (seconds === undefined || seconds === null) return "00:00"
  const total = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

interface PlaybackMomentsPanelProps {
  segments: OrionPlayback[]
  title?: string
  description?: string
  className?: string
  emptyState?: string
}

export function PlaybackMomentsPanel({
  segments,
  title = "Relevant lecture moments",
  description = "Top transcript-matched places to jump straight into the lecture.",
  className,
  emptyState = "No timestamped lecture moments were found for this query.",
}: PlaybackMomentsPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [segments])

  const selectedSegment = useMemo(
    () => segments[selectedIndex] ?? segments[0] ?? null,
    [segments, selectedIndex]
  )

  if (!segments.length || !selectedSegment) {
    return (
      <div className={cn("rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground", className)}>
        {emptyState}
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <VideoPlayerCard
        title={selectedSegment.video_title ?? "Lecture recording"}
        timestamp={formatTimestamp(selectedSegment.timestamp_start)}
        videoUrl={selectedSegment.video_stream_url}
        externalUrl={selectedSegment.video_external_ref}
        startAtSeconds={selectedSegment.timestamp_start}
        summary={selectedSegment.snippet || selectedSegment.transcript_excerpt}
        autoPlayOnSeek
      />

      <div className="grid gap-3 md:grid-cols-3">
        {segments.map((segment, index) => {
          const active = index === selectedIndex
          return (
            <button
              key={`${segment.source_chunk_id}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                active
                  ? "border-accent/35 bg-accent/5"
                  : "border-border/70 bg-card/70 hover:border-accent/25 hover:bg-card"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge variant={active ? "default" : "secondary"}>Top {index + 1}</Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTimestamp(segment.timestamp_start)}
                </span>
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-foreground/95">
                {segment.snippet || segment.transcript_excerpt}
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Play className="h-3.5 w-3.5" />
                <span>Jump to this moment</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
