"use client"

import { cn } from "@/lib/utils"
import { Sparkles, Copy, BookmarkPlus, ThumbsUp, ThumbsDown } from "lucide-react"
import { Button } from "@/components/ui/button"

interface AIAnswerBlockProps {
  content: string
  isLoading?: boolean
  className?: string
}

export function AIAnswerBlock({ content, isLoading, className }: AIAnswerBlockProps) {
  if (isLoading) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-6", className)}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
            <Sparkles className="h-4 w-4 text-accent animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Orion is thinking</span>
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <div>
          <span className="text-sm font-semibold">Orion</span>
          <span className="ml-2 text-xs text-muted-foreground">AI Assistant</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div 
          className="prose prose-sm dark:prose-invert max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <Copy className="h-3.5 w-3.5" />
            Copy
          </Button>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
            <BookmarkPlus className="h-3.5 w-3.5" />
            Save to Notes
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ThumbsUp className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ThumbsDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
