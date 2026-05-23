from __future__ import annotations

import re

from dataclasses import dataclass

from .latex_subagent import LatexFormattingSubagent


@dataclass(slots=True)
class ReflectionOutcome:
    answer: str
    checks: list[str]


class ResponseReflectionTool:
    """
    Lightweight deterministic reflection pass that runs on every answer.
    Keeps latency low while still enforcing answer quality constraints.
    """

    def __init__(self, latex_subagent: LatexFormattingSubagent | None = None):
        self.latex_subagent = latex_subagent or LatexFormattingSubagent()

    def refine(
        self,
        *,
        query: str,
        answer: str,
        citation_count: int,
        referenced_points: list[str] | None = None,
    ) -> ReflectionOutcome:
        latex_refined = self.latex_subagent.refine(answer)
        refined = latex_refined.answer
        checks: list[str] = [f"latex_subagent:{item}" for item in latex_refined.checks]

        if citation_count > 0 and not re.search(r"\[\d+\]", refined):
            refined = f"{refined.rstrip()}\n\nGrounded references: [1]."
            checks.append("enforce_citation_marker")

        if referenced_points:
            lowered = refined.lower()
            missing = [point for point in referenced_points if point.lower() not in lowered]
            if missing:
                focus_line = "; ".join(missing[:3])
                refined = f"{refined.rstrip()}\n\nFollow-up focus: {focus_line}."
                checks.append("enforce_follow_up_focus")

        refined = re.sub(r"\n{3,}", "\n\n", refined).strip()
        checks.append("normalize_spacing")

        return ReflectionOutcome(answer=refined, checks=checks)
