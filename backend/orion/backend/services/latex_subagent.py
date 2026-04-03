from __future__ import annotations

import re

from dataclasses import dataclass


COMMON_LATEX_COMMANDS = (
    "alpha",
    "beta",
    "gamma",
    "delta",
    "Delta",
    "theta",
    "lambda",
    "mu",
    "sigma",
    "pi",
    "times",
    "cdot",
    "leq",
    "geq",
    "neq",
    "approx",
    "sum",
    "int",
    "frac",
    "sqrt",
)


@dataclass(slots=True)
class LatexRefinement:
    answer: str
    checks: list[str]


class LatexFormattingSubagent:
    """
    Deterministic LaTeX clean-up pass.
    Keeps latency low while making mathematical notation consistently readable.
    """

    def refine(self, answer: str) -> LatexRefinement:
        refined = answer or ""
        checks: list[str] = []

        normalized = re.sub(r"\\\((.+?)\\\)", r"$\1$", refined, flags=re.DOTALL)
        normalized = re.sub(r"\\\[(.+?)\\\]", r"$$\1$$", normalized, flags=re.DOTALL)
        if normalized != refined:
            checks.append("normalize_latex_delimiters")
            refined = normalized

        collapsed = self._apply_outside_fenced_blocks(
            refined,
            lambda part: re.sub(r"\\\\(?=(?:%s)\b)" % "|".join(COMMON_LATEX_COMMANDS), r"\\", part),
        )
        if collapsed != refined:
            checks.append("collapse_double_backslash_math")
            refined = collapsed

        wrapped = self._wrap_standalone_latex_commands(refined)
        if wrapped != refined:
            checks.append("wrap_standalone_latex_commands")
            refined = wrapped

        if "−" in refined:
            refined = refined.replace("−", "-")
            checks.append("normalize_minus_sign")

        return LatexRefinement(answer=refined, checks=checks or ["latex_noop"])

    def _wrap_standalone_latex_commands(self, text: str) -> str:
        return self._apply_outside_fenced_blocks(text, self._wrap_in_plain_text_segment)

    @staticmethod
    def _apply_outside_fenced_blocks(text: str, transform) -> str:
        segments = text.split("```")
        for index in range(0, len(segments), 2):
            segments[index] = transform(segments[index])
        return "```".join(segments)

    @staticmethod
    def _wrap_in_plain_text_segment(segment: str) -> str:
        # Skip inline-code spans while wrapping math commands.
        parts = re.split(r"(`[^`]*`)", segment)
        for index, part in enumerate(parts):
            if part.startswith("`") and part.endswith("`"):
                continue
            parts[index] = re.sub(
                r"(?<![$\\])\\(%s)\b" % "|".join(COMMON_LATEX_COMMANDS),
                r"$\\\1$",
                part,
            )
        return "".join(parts)
