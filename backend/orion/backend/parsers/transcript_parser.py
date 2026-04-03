from __future__ import annotations

import json
import re

from pathlib import Path

from ..models import ParsedSection
from ..utils.text import clean_text


TIMESTAMP_LINE = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2}(?:[.,]\d{3})?)\s*-->\s*(?P<end>\d{2}:\d{2}:\d{2}(?:[.,]\d{3})?)"
)


def _timestamp_to_seconds(value: str) -> float:
    hours, minutes, seconds = value.replace(",", ".").split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def _parse_vtt_or_srt(path: Path, payload: str, linked_video_asset_id: str | None) -> list[ParsedSection]:
    blocks = re.split(r"\n\s*\n", payload.strip())
    sections: list[ParsedSection] = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines:
            continue
        match = None
        text_lines: list[str] = []
        for line in lines:
            timestamp_match = TIMESTAMP_LINE.search(line)
            if timestamp_match:
                match = timestamp_match
                continue
            if match:
                text_lines.append(line)
        if not match or not text_lines:
            continue
        start = _timestamp_to_seconds(match.group("start"))
        end = _timestamp_to_seconds(match.group("end"))
        sections.append(
            ParsedSection(
                text=clean_text(" ".join(text_lines)),
                metadata={
                    "timestamp_start": start,
                    "timestamp_end": end,
                    "video_asset_id": linked_video_asset_id,
                    "locator": f"{int(start)}s-{int(end)}s",
                },
            )
        )
    return sections


def parse_transcript(path: str | Path, linked_video_asset_id: str | None = None) -> list[ParsedSection]:
    file_path = Path(path)
    raw = file_path.read_text(encoding="utf-8")
    suffix = file_path.suffix.lower()

    if suffix in {".srt", ".vtt"}:
        return _parse_vtt_or_srt(file_path, raw, linked_video_asset_id)

    if suffix == ".json":
        payload = json.loads(raw)
        segments = payload.get("segments", payload if isinstance(payload, list) else [])
        linked_video_asset_id = payload.get("linked_video_asset_id", linked_video_asset_id) if isinstance(payload, dict) else linked_video_asset_id
        parsed_sections: list[ParsedSection] = []
        for segment in segments:
            text = clean_text(segment.get("text", ""))
            if not text:
                continue
            start = segment.get("start")
            end = segment.get("end")
            metadata = {
                "video_asset_id": segment.get("video_asset_id", linked_video_asset_id),
            }
            if start is not None:
                metadata["timestamp_start"] = float(start)
            if end is not None:
                metadata["timestamp_end"] = float(end)
            if "timestamp_start" in metadata:
                finish = metadata.get("timestamp_end", metadata["timestamp_start"])
                metadata["locator"] = f"{int(metadata['timestamp_start'])}s-{int(finish)}s"
            parsed_sections.append(ParsedSection(text=text, metadata=metadata))
        return parsed_sections

    text = clean_text(raw)
    if not text:
        return []
    return [ParsedSection(text=text, metadata={"locator": "transcript"})]

