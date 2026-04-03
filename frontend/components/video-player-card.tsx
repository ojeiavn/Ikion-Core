"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { ExternalLink, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"

interface VideoPlayerCardProps {
  title: string
  timestamp: string
  videoUrl?: string | null
  externalUrl?: string | null
  startAtSeconds?: number
  summary?: string
  className?: string
  autoPlayOnSeek?: boolean
}

function looksLikeDirectVideo(urlValue?: string | null) {
  if (!urlValue) return false
  return /\.(mp4|m4v|webm|mov|ogg)(\?.*)?$/i.test(urlValue)
}

function getYoutubeEmbedUrl(urlValue?: string | null, startAtSeconds = 0) {
  if (!urlValue) return null

  try {
    const url = new URL(urlValue)
    let videoId: string | null = null

    if (url.hostname.includes("youtu.be")) {
      videoId = url.pathname.replace("/", "") || null
    } else if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        videoId = url.searchParams.get("v")
      } else if (url.pathname.startsWith("/embed/")) {
        videoId = url.pathname.split("/embed/")[1] || null
      } else if (url.pathname.startsWith("/shorts/")) {
        videoId = url.pathname.split("/shorts/")[1] || null
      }
    }

    if (!videoId) return null

    const params = new URLSearchParams({
      rel: "0",
      modestbranding: "1",
      autoplay: "0",
    })
    if (startAtSeconds > 0) {
      params.set("start", String(Math.floor(startAtSeconds)))
    }
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
  } catch {
    return null
  }
}

export function VideoPlayerCard({
  title,
  timestamp,
  videoUrl,
  externalUrl,
  startAtSeconds = 0,
  summary,
  className,
  autoPlayOnSeek = false,
}: VideoPlayerCardProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const youtubeEmbedUrl = getYoutubeEmbedUrl(externalUrl, startAtSeconds)
  const directExternalVideoUrl = !videoUrl && looksLikeDirectVideo(externalUrl) ? externalUrl : null
  const playableVideoUrl = videoUrl ?? directExternalVideoUrl

  useEffect(() => {
    const player = videoRef.current
    if (!player || !playableVideoUrl || startAtSeconds === undefined || startAtSeconds === null) return

    const seekToTimestamp = () => {
      if (!videoRef.current) return
      videoRef.current.currentTime = startAtSeconds
      if (autoPlayOnSeek) {
        setIsPlaying(true)
      }
    }

    if (player.readyState >= 1) {
      seekToTimestamp()
      return
    }

    player.addEventListener("loadedmetadata", seekToTimestamp)
    return () => player.removeEventListener("loadedmetadata", seekToTimestamp)
  }, [startAtSeconds, autoPlayOnSeek, playableVideoUrl])

  useEffect(() => {
    if (!videoRef.current || !playableVideoUrl) return
    if (isPlaying) {
      void videoRef.current.play()
    } else {
      videoRef.current.pause()
    }
  }, [isPlaying, playableVideoUrl])

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card", className)}>
      {/* Video Area */}
      <div className="relative aspect-video bg-muted">
        {playableVideoUrl ? (
          <video
            ref={videoRef}
            src={playableVideoUrl}
            controls
            className="h-full w-full object-cover"
          />
        ) : youtubeEmbedUrl ? (
          <iframe
            src={youtubeEmbedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Play className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">Lecture Recording</p>
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-2 text-xs text-accent underline-offset-4 hover:underline"
                >
                  Open video
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Timestamp Badge */}
        <div className="absolute left-3 top-3 rounded-md bg-background/90 px-2 py-1 backdrop-blur">
          <span className="font-mono text-xs font-medium">{timestamp}</span>
        </div>
      </div>

      {playableVideoUrl && (
        <div className="border-t border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="gap-2" onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? "Pause" : "Play"}
            </Button>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="border-t border-border p-4">
        <div className="flex items-start justify-between">
          <div>
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
