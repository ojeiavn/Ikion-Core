"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Play, Pause, Volume2, Maximize2, SkipBack, SkipForward } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

interface VideoPlayerCardProps {
  title: string
  lectureNumber?: number
  timestamp: string
  thumbnailUrl?: string
  summary?: string
  className?: string
}

export function VideoPlayerCard({
  title,
  lectureNumber,
  timestamp,
  thumbnailUrl,
  summary,
  className,
}: VideoPlayerCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(35)

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {/* Video Area */}
      <div className="relative aspect-video bg-muted">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Play className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Lecture Recording</p>
            </div>
          </div>
        )}
        
        {/* Timestamp Badge */}
        <div className="absolute left-3 top-3 rounded-md bg-background/90 px-2 py-1 backdrop-blur">
          <span className="font-mono text-xs font-medium">{timestamp}</span>
        </div>

        {/* Play Overlay */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="absolute inset-0 flex items-center justify-center bg-background/20 opacity-0 transition-opacity hover:opacity-100"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            {isPlaying ? (
              <Pause className="h-6 w-6" />
            ) : (
              <Play className="h-6 w-6 ml-1" />
            )}
          </div>
        </button>
      </div>

      {/* Controls */}
      <div className="border-t border-border bg-card p-3">
        <div className="mb-3">
          <Slider
            value={[progress]}
            onValueChange={([value]) => setProgress(value)}
            max={100}
            step={1}
            className="cursor-pointer"
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Volume2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="border-t border-border p-4">
        <div className="flex items-start justify-between">
          <div>
            {lectureNumber && (
              <span className="text-xs font-medium text-accent">
                Lecture {lectureNumber}
              </span>
            )}
            <h4 className="mt-0.5 font-medium">{title}</h4>
          </div>
        </div>
        {summary && (
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {summary}
          </p>
        )}
      </div>
    </div>
  )
}
