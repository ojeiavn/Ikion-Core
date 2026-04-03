from __future__ import annotations

from pathlib import Path

from ..models import ParsedSection
from ..utils.text import clean_text


def parse_notice(path: str | Path) -> list[ParsedSection]:
    text = clean_text(Path(path).read_text(encoding="utf-8"))
    if not text:
        return []
    return [ParsedSection(text=text, metadata={"locator": "notice"})]

