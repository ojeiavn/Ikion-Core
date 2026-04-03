"use client"

import { useMemo } from "react"

import { OrionAsset, getBackendBaseUrl } from "@/lib/orion-api"
import { cn } from "@/lib/utils"
import { Play } from "lucide-react"

interface VideoThumbnailProps {
  asset: OrionAsset
  workspaceId?: string | null
  className?: string
  overlayLabel?: string | null
}

function extractYoutubeId(urlValue: string | null) {
  if (!urlValue) return null

  try {
    const url = new URL(urlValue)
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "") || null
    }
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v")
      }
      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/embed/")[1] || null
      }
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/shorts/")[1] || null
      }
    }
  } catch {
    return null
  }

  return null
}

function looksLikeDirectVideo(urlValue: string | null) {
  if (!urlValue) return false
  return /\.(mp4|m4v|webm|mov|ogg)(\?.*)?$/i.test(urlValue)
}

function initialsForTitle(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function VideoThumbnail({
  asset,
  workspaceId,
  className,
  overlayLabel,
}: VideoThumbnailProps) {
  const backendBase = useMemo(() => getBackendBaseUrl(), [])
  const youtubeId = extractYoutubeId(asset.external_ref)
  const streamUrl =
    workspaceId && asset.content_path
      ? `${backendBase}/workspaces/${workspaceId}/assets/${asset.id}/content`
      : null
  const directVideoUrl = !streamUrl && looksLikeDirectVideo(asset.external_ref) ? asset.external_ref : null
  const imageUrl = youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : null

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[1rem] border border-border/70 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900",
        className
      )}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={asset.title} className="h-full w-full object-cover" />
      ) : streamUrl || directVideoUrl ? (
        <video
          src={streamUrl ?? directVideoUrl ?? undefined}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.24),transparent_34%),linear-gradient(135deg,#111827,#0f172a_55%,#111827)] p-4">
          <div>
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm font-semibold text-white/85">
              {initialsForTitle(asset.title)}
            </div>
            <p className="mt-3 line-clamp-2 text-sm font-medium text-white/92">{asset.title}</p>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
        {overlayLabel ? (
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/88 backdrop-blur-sm">
            {overlayLabel}
          </span>
        ) : (
          <span />
        )}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/88 text-slate-900 shadow-sm">
          <Play className="ml-0.5 h-4 w-4" />
        </div>
      </div>
    </div>
  )
}
