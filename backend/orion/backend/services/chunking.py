from __future__ import annotations

from ..config import OrionConfig
from ..models import Asset, Chunk, ParsedSection
from ..utils.ids import make_id
from ..utils.text import clean_text, split_text


class ChunkingService:
    def __init__(self, config: OrionConfig):
        self.config = config

    def chunk_asset(
        self,
        workspace_id: str,
        corpus_version_id: str,
        asset: Asset,
        sections: list[ParsedSection],
    ) -> list[Chunk]:
        if asset.asset_type == "transcript" and any("timestamp_start" in section.metadata for section in sections):
            return self._chunk_timestamped_sections(workspace_id, corpus_version_id, asset, sections)

        chunks: list[Chunk] = []
        position = 0
        for section in sections:
            if section.metadata.get("pre_split"):
                metadata = self._merged_metadata(asset, section.metadata)
                chunks.append(
                    Chunk(
                        id=make_id("chunk"),
                        workspace_id=workspace_id,
                        corpus_version_id=corpus_version_id,
                        asset_id=asset.id,
                        asset_title=asset.title,
                        asset_type=asset.asset_type,
                        text=clean_text(section.text),
                        metadata=metadata,
                        position=position,
                    )
                )
                position += 1
                continue
            for part in split_text(section.text, self.config.max_chunk_chars, self.config.chunk_overlap_chars):
                metadata = self._merged_metadata(asset, section.metadata)
                chunks.append(
                    Chunk(
                        id=make_id("chunk"),
                        workspace_id=workspace_id,
                        corpus_version_id=corpus_version_id,
                        asset_id=asset.id,
                        asset_title=asset.title,
                        asset_type=asset.asset_type,
                        text=clean_text(part),
                        metadata=metadata,
                        position=position,
                    )
                )
                position += 1
        return chunks

    @staticmethod
    def _merged_metadata(asset: Asset, section_metadata: dict) -> dict:
        metadata = dict(section_metadata)
        for key in ("document_category", "exam_session", "default_question_guidance", "linked_exam_asset_id"):
            value = asset.metadata.get(key)
            if value is not None and key not in metadata:
                metadata[key] = value
        return metadata

    def _chunk_timestamped_sections(
        self,
        workspace_id: str,
        corpus_version_id: str,
        asset: Asset,
        sections: list[ParsedSection],
    ) -> list[Chunk]:
        chunks: list[Chunk] = []
        position = 0
        buffer: list[ParsedSection] = []
        current_size = 0

        def flush() -> None:
            nonlocal buffer, current_size, position
            if not buffer:
                return
            start = buffer[0].metadata.get("timestamp_start")
            end = buffer[-1].metadata.get("timestamp_end")
            metadata = {
                "timestamp_start": start,
                "timestamp_end": end,
                "video_asset_id": buffer[0].metadata.get("video_asset_id"),
                "locator": f"{int(start)}s-{int(end or start)}s" if start is not None else "transcript",
            }
            chunks.append(
                Chunk(
                    id=make_id("chunk"),
                    workspace_id=workspace_id,
                    corpus_version_id=corpus_version_id,
                    asset_id=asset.id,
                    asset_title=asset.title,
                    asset_type=asset.asset_type,
                    text=clean_text(" ".join(section.text for section in buffer)),
                    metadata=metadata,
                    position=position,
                )
            )
            position += 1
            buffer = []
            current_size = 0

        for section in sections:
            section_length = len(section.text)
            if buffer and current_size + section_length > self.config.max_chunk_chars:
                flush()
            buffer.append(section)
            current_size += section_length
        flush()
        return chunks
