"use client"

import { Badge } from "@/components/ui/badge"
import { IkionExamRecommendation } from "@/lib/ikion-api"
import { cn } from "@/lib/utils"

interface ExamRecommendationCardProps {
  recommendation: IkionExamRecommendation
  compact?: boolean
  className?: string
}

export function ExamRecommendationCard({
  recommendation,
  compact = false,
  className,
}: ExamRecommendationCardProps) {
  return (
    <div className={cn("ikion-recommendation-card space-y-4 rounded-[1.35rem] border p-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {recommendation.origin_type === "uploaded" ? "Uploaded exam question" : "Inspired exam question"}
        </Badge>
        {recommendation.paper_label && <Badge variant="secondary">{recommendation.paper_label}</Badge>}
        {recommendation.marks !== null && <Badge variant="secondary">{recommendation.marks} marks</Badge>}
        {recommendation.command_word && <Badge variant="secondary">{recommendation.command_word}</Badge>}
        {recommendation.mark_scheme_available && <Badge variant="secondary">Mark scheme linked</Badge>}
      </div>

      <div className="ikion-question-panel space-y-2 rounded-2xl border p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-accent">Recommended Question</p>
        <p className={cn("font-semibold leading-relaxed text-foreground", compact ? "text-sm" : "text-[1.02rem]")}>
          {recommendation.question_text}
        </p>
        <p className="text-xs leading-5 text-muted-foreground">{recommendation.task_summary}</p>
      </div>

      <div className={cn("grid gap-3", compact ? "grid-cols-1" : "md:grid-cols-2")}>
        <div className="rounded-2xl border border-border/70 bg-background/72 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why Ikion Chose This</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{recommendation.rationale}</p>
          {recommendation.why_this_now.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {recommendation.why_this_now.slice(0, compact ? 2 : 3).map((reason) => (
                <li key={reason} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/72 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Answer Framework</p>
          {recommendation.answer_framework.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-foreground/90">
              {recommendation.answer_framework.slice(0, compact ? 3 : 4).map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No answer framework available yet.</p>
          )}
        </div>
      </div>

      {recommendation.focus_topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recommendation.focus_topics.slice(0, compact ? 4 : 6).map((topic) => (
            <Badge key={topic} variant="secondary">
              {topic}
            </Badge>
          ))}
        </div>
      )}

      {!compact && recommendation.guidance && (
        <div className="rounded-2xl border border-border/70 bg-background/72 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Marker Guidance</p>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {recommendation.guidance}
          </div>
        </div>
      )}

      {!compact && recommendation.lecturer_focus.length > 0 && (
        <div className="rounded-2xl border border-border/70 bg-background/72 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Lecturer Focus</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {recommendation.lecturer_focus.slice(0, 3).map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-chart-2" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
