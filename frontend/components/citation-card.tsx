"use client"

import { cn } from "@/lib/utils"
import { FileText, Video, BookOpen, ExternalLink } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export type CitationType = "slide" | "reading" | "transcript" | "video"

interface CitationCardProps {
  type: CitationType
  title: string
  source: string
  excerpt?: string
  timestamp?: string
  page?: number
  onClick?: () => void
  className?: string
}

const typeConfig = {
  slide: {
    icon: FileText,
    label: "Lecture Slide",
    color: "text-chart-1",
    bg: "bg-chart-1/10",
  },
  reading: {
    icon: BookOpen,
    label: "Reading",
    color: "text-chart-2",
    bg: "bg-chart-2/10",
  },
  transcript: {
    icon: FileText,
    label: "Transcript",
    color: "text-chart-3",
    bg: "bg-chart-3/10",
  },
  video: {
    icon: Video,
    label: "Lecture Video",
    color: "text-chart-4",
    bg: "bg-chart-4/10",
  },
}

export function CitationCard({
  type,
  title,
  source,
  excerpt,
  timestamp,
  page,
  onClick,
  className,
}: CitationCardProps) {
  const config = typeConfig[type]
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              "orion-hover-item group flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-all",
              className
            )}
          >
            <div className={cn("rounded-md p-2", config.bg)}>
              <Icon className={cn("h-4 w-4", config.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-xs font-medium", config.color)}>
                  {config.label}
                </span>
                {timestamp && (
                  <span className="text-xs text-muted-foreground">
                    {timestamp}
                  </span>
                )}
                {page && (
                  <span className="text-xs text-muted-foreground">
                    p. {page}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm font-medium truncate">{title}</p>
              <p className="text-xs text-muted-foreground truncate">{source}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </TooltipTrigger>
        {excerpt && (
          <TooltipContent side="top" className="max-w-sm">
            <p className="text-sm">{excerpt}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
