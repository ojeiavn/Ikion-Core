from __future__ import annotations

import json

from ..db import Database
from ..models import PlaybackSegment, RetrievalHit
from ..utils.text import best_sentences_for_query


class PlaybackService:
    def __init__(self, db: Database):
        self.db = db

    def resolve_from_hits(self, query: str, hits: list[RetrievalHit]) -> PlaybackSegment | None:
        segments = self.resolve_top_segments_from_hits(query, hits, limit=1)
        return segments[0] if segments else None

    def resolve_top_segments_from_hits(
        self,
        query: str,
        hits: list[RetrievalHit],
        limit: int = 3,
        video_asset_id: str | None = None,
    ) -> list[PlaybackSegment]:
        segments: list[PlaybackSegment] = []
        seen_chunks: set[str] = set()

        for hit in hits:
            metadata = hit.chunk.metadata
            hit_video_asset_id = metadata.get("video_asset_id")
            timestamp_start = metadata.get("timestamp_start")
            if not hit_video_asset_id or timestamp_start is None:
                continue
            if video_asset_id and hit_video_asset_id != video_asset_id:
                continue
            if hit.chunk.id in seen_chunks:
                continue

            segment = self._segment_from_hit(query, hit, video_asset_id=hit_video_asset_id)
            if not segment:
                continue

            if any(self._is_near_duplicate(existing, segment) for existing in segments):
                continue

            seen_chunks.add(hit.chunk.id)
            segments.append(segment)
            if len(segments) >= limit:
                break
        return segments

    def resolve_from_chunk_ids(self, workspace_id: str, query: str, hits: list[RetrievalHit]) -> PlaybackSegment | None:
        return self.resolve_from_hits(query, hits)

    def _segment_from_hit(
        self,
        query: str,
        hit: RetrievalHit,
        *,
        video_asset_id: str,
    ) -> PlaybackSegment | None:
        metadata = hit.chunk.metadata
        timestamp_start = metadata.get("timestamp_start")
        if timestamp_start is None:
            return None

        row = self.db.fetchone("SELECT * FROM assets WHERE id = ?", (video_asset_id,))
        asset_title = row["title"] if row else None
        content_path = row["content_path"] if row else None
        external_ref = row["external_ref"] if row else None
        snippet_candidates = best_sentences_for_query(hit.chunk.text, query, limit=1)
        return PlaybackSegment(
            video_asset_id=video_asset_id,
            timestamp_start=float(timestamp_start),
            timestamp_end=float(metadata["timestamp_end"]) if metadata.get("timestamp_end") is not None else None,
            transcript_excerpt=hit.chunk.text[:420],
            snippet=snippet_candidates[0] if snippet_candidates else hit.chunk.text[:220],
            source_chunk_id=hit.chunk.id,
            video_title=asset_title,
            video_source_path=content_path,
            video_external_ref=external_ref,
        )

    @staticmethod
    def _is_near_duplicate(left: PlaybackSegment, right: PlaybackSegment) -> bool:
        if left.video_asset_id != right.video_asset_id:
            return False
        left_end = left.timestamp_end if left.timestamp_end is not None else left.timestamp_start
        right_end = right.timestamp_end if right.timestamp_end is not None else right.timestamp_start
        overlaps = not (right.timestamp_start > left_end + 12 or left.timestamp_start > right_end + 12)
        close_start = abs(left.timestamp_start - right.timestamp_start) <= 18
        return overlaps or close_start
