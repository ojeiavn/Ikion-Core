"use client"

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

interface FormattedRichTextProps {
  text: string
  className?: string
}

type RichBlock =
  | { type: "heading"; content: string }
  | { type: "paragraph"; content: string }
  | { type: "bullet-list"; items: string[] }
  | { type: "number-list"; items: string[] }
  | { type: "quote"; content: string }

const HEADING_PATTERN = /^[A-Z][A-Za-z0-9 /,&()'-]{2,60}:?$/

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim()
}

function isHeadingCandidate(value: string) {
  if (!HEADING_PATTERN.test(value)) return false
  const trimmed = value.replace(/:$/, "")
  const words = trimmed.split(/\s+/)
  return words.length <= 8
}

function parseBlocks(text: string): RichBlock[] {
  const chunks = text
    .trim()
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return chunks.flatMap<RichBlock>((chunk) => {
      const lines = chunk
        .split("\n")
        .map(normalizeLine)
        .filter(Boolean)

      if (lines.length === 0) return []

      if (lines.length === 1 && isHeadingCandidate(lines[0])) {
        return [{ type: "heading", content: lines[0].replace(/:$/, "") }]
      }

      const bulletItems = lines
        .map((line) => line.match(/^[-*]\s+(.+)$/)?.[1] ?? null)
        .filter((item): item is string => Boolean(item))
      if (bulletItems.length === lines.length) {
        return [{ type: "bullet-list", items: bulletItems }]
      }

      const numberItems = lines
        .map((line) => line.match(/^\d+[.)]\s+(.+)$/)?.[1] ?? null)
        .filter((item): item is string => Boolean(item))
      if (numberItems.length === lines.length) {
        return [{ type: "number-list", items: numberItems }]
      }

      const quoteItems = lines
        .map((line) => line.match(/^>\s?(.+)$/)?.[1] ?? null)
        .filter((item): item is string => Boolean(item))
      if (quoteItems.length === lines.length) {
        return [{ type: "quote", content: quoteItems.join(" ") }]
      }

      if (isHeadingCandidate(lines[0]) && lines.length > 1) {
        return [
          { type: "heading", content: lines[0].replace(/:$/, "") },
          { type: "paragraph", content: lines.slice(1).join(" ") },
        ]
      }

      return [{ type: "paragraph", content: lines.join(" ") }]
    })
}

function renderInlineRich(text: string): ReactNode[] {
  const normalized = text
    .replace(/\\\((.+?)\\\)/g, "$$$1$")
    .replace(/\\\[(.+?)\\\]/g, "$$$$1$$$$")
  const parts = normalized.split(/(`[^`]+`|\*\*[^*]+\*\*|\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={`code-${index}`} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={`strong-${index}`} className="font-semibold">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("$$") && part.endsWith("$$") && part.length >= 4) {
      const mathPreview = renderLatexPreview(part.slice(2, -2))
      return (
        <span key={`math-block-${index}`} className="my-1 inline-block rounded bg-muted/60 px-2 py-1 font-mono text-[0.92em]">
          {mathPreview}
        </span>
      )
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length >= 2) {
      const mathPreview = renderLatexPreview(part.slice(1, -1))
      return (
        <span key={`math-inline-${index}`} className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[0.92em]">
          {mathPreview}
        </span>
      )
    }
    return <span key={`text-${index}`}>{part}</span>
  })
}

function renderLatexPreview(value: string) {
  const symbols: Record<string, string> = {
    alpha: "alpha",
    beta: "beta",
    gamma: "gamma",
    delta: "delta",
    Delta: "Delta",
    theta: "theta",
    lambda: "lambda",
    mu: "mu",
    sigma: "sigma",
    pi: "pi",
    times: "×",
    cdot: "·",
    leq: "<=",
    geq: ">=",
    neq: "!=",
    approx: "~",
  }
  let normalized = value.replace(/\\\\/g, "\\").trim()
  normalized = normalized.replace(/\\([A-Za-z]+)/g, (_, command: string) => symbols[command] ?? `\\${command}`)
  normalized = normalized.replace(/\s+/g, " ")
  return normalized
}

export function FormattedRichText({ text, className }: FormattedRichTextProps) {
  const blocks = parseBlocks(text)

  if (blocks.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>No content yet.</p>
  }

  return (
    <div className={cn("space-y-4", className)}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h3
              key={`${block.type}-${index}`}
              className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              {block.content}
            </h3>
          )
        }

        if (block.type === "bullet-list") {
          return (
            <ul key={`${block.type}-${index}`} className="space-y-2">
              {block.items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-7 text-foreground/90">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{renderInlineRich(item)}</span>
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === "number-list") {
          return (
            <ol key={`${block.type}-${index}`} className="space-y-3">
              {block.items.map((item, itemIndex) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-7 text-foreground/90">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {itemIndex + 1}
                  </span>
                  <span>{renderInlineRich(item)}</span>
                </li>
              ))}
            </ol>
          )
        }

        if (block.type === "quote") {
          return (
            <blockquote
              key={`${block.type}-${index}`}
              className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm leading-7 text-muted-foreground"
            >
              {renderInlineRich(block.content)}
            </blockquote>
          )
        }

        return (
          <p key={`${block.type}-${index}`} className="text-sm leading-7 text-foreground/90">
            {renderInlineRich(block.content)}
          </p>
        )
      })}
    </div>
  )
}
