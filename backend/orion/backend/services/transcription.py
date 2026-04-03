from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Lock
from typing import Callable

from ..config import OrionConfig
from ..models import Asset
from ..utils.text import clean_text
from ..utils.time import utc_now_iso
from ..utils.transcription_worker import transcribe_segments_with_worker
from .corpus_builder import CorpusBuilderService
from .ingestion import AssetIngestionService


logger = logging.getLogger(__name__)

TranscriptSegment = dict[str, float | str | int | None]
TranscribeVideoFn = Callable[[Path, Asset], list[TranscriptSegment]]


class TranscriptGenerationService:
    def __init__(
        self,
        config: OrionConfig,
        ingestion: AssetIngestionService,
        corpus_builder: CorpusBuilderService | None = None,
        transcribe_video_fn: TranscribeVideoFn | None = None,
    ):
        self.config = config
        self.ingestion = ingestion
        self.corpus_builder = corpus_builder
        self.transcribe_video_fn = transcribe_video_fn or self._transcribe_with_openai
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="orion-transcripts")
        self._lock = Lock()
        self._scheduled: set[str] = set()

    def schedule_for_video_asset(self, asset_id: str, force: bool = False) -> bool:
        if not self.config.auto_generate_video_transcripts:
            return False

        with self._lock:
            if asset_id in self._scheduled:
                return False
            self._scheduled.add(asset_id)

        asset = self.ingestion.get_asset(asset_id)
        if not force:
            status = str(asset.metadata.get("auto_transcript_status", "")).strip().lower()
            if status in {"ready", "processing", "queued", "unsupported_external_only"}:
                with self._lock:
                    self._scheduled.discard(asset_id)
                return False
        self._mark_video(asset, {"auto_transcript_status": "queued"})
        future = self._executor.submit(self.generate_for_video_asset, asset_id)

        def _finalize(_future) -> None:
            with self._lock:
                self._scheduled.discard(asset_id)
            try:
                _future.result()
            except Exception:
                logger.exception("Transcript generation crashed for video asset %s", asset_id)

        future.add_done_callback(_finalize)
        return True

    def schedule_missing_video_transcripts(self) -> int:
        if not self.config.auto_generate_video_transcripts:
            return 0

        scheduled = 0
        for asset in self.ingestion.list_assets_for_all_workspaces(asset_type="video"):
            if self.schedule_for_video_asset(asset.id):
                scheduled += 1
        return scheduled

    def schedule_workspace_video_transcripts(self, workspace_id: str) -> int:
        if not self.config.auto_generate_video_transcripts:
            return 0

        scheduled = 0
        for asset in self.ingestion.list_assets(workspace_id, asset_type="video"):
            if self.schedule_for_video_asset(asset.id):
                scheduled += 1
        return scheduled

    def generate_for_video_asset(self, asset_id: str) -> Asset | None:
        video_asset = self.ingestion.get_asset(asset_id)
        if video_asset.asset_type != "video":
            raise ValueError("Transcript generation is only supported for video assets.")

        existing = self._find_linked_transcript(video_asset.workspace_id, video_asset.id)
        if existing:
            self._mark_video(
                video_asset,
                {
                    "auto_transcript_status": "ready",
                    "linked_transcript_asset_id": existing.id,
                    "auto_transcript_source": "existing",
                },
            )
            return existing

        self._mark_video(video_asset, {"auto_transcript_status": "processing"})

        local_path = self.ingestion.ensure_local_content(video_asset.id)
        if not local_path:
            self._mark_video(
                video_asset,
                {
                    "auto_transcript_status": "unsupported_external_only",
                    "auto_transcript_error": "This lecture video is externally referenced only. Upload the media file or add a manual transcript to enable timed transcript search.",
                },
            )
            return None

        try:
            raw_segments = self.transcribe_video_fn(local_path, video_asset)
            normalized_segments = self._normalize_segments(raw_segments, video_asset.id)
            if not normalized_segments:
                raise ValueError("The transcription provider returned no usable timed segments.")

            transcript_asset = self.ingestion.register_transcript_segments(
                workspace_id=video_asset.workspace_id,
                title=f"{video_asset.title} Transcript",
                linked_video_asset_id=video_asset.id,
                segments=normalized_segments,
                metadata={
                    "linked_video_title": video_asset.title,
                    "transcript_origin": "orion_auto_generated",
                    "generated_from_video_asset_id": video_asset.id,
                    "transcription_model": self.config.openai_transcription_model,
                    "transcription_generated_at": utc_now_iso(),
                },
            )
            self._mark_video(
                video_asset,
                {
                    "auto_transcript_status": "ready",
                    "linked_transcript_asset_id": transcript_asset.id,
                    "auto_transcript_error": None,
                    "auto_transcript_generated_at": utc_now_iso(),
                    "auto_transcript_source": "generated",
                },
            )

            if self.config.auto_rebuild_corpus_on_transcript and self.corpus_builder is not None:
                try:
                    self.corpus_builder.build_workspace_corpus(video_asset.workspace_id)
                    self._mark_video(video_asset, {"auto_transcript_corpus_status": "ready"})
                except Exception as exc:
                    logger.exception("Corpus rebuild failed after transcript generation for %s", video_asset.id)
                    self._mark_video(
                        video_asset,
                        {
                            "auto_transcript_corpus_status": "failed",
                            "auto_transcript_corpus_error": str(exc),
                        },
                    )

            return transcript_asset
        except Exception as exc:
            self._mark_video(
                video_asset,
                {
                    "auto_transcript_status": "failed",
                    "auto_transcript_error": str(exc),
                },
            )
            raise

    def _mark_video(self, video_asset: Asset, updates: dict[str, object]) -> Asset:
        current = self.ingestion.get_asset(video_asset.id)
        merged = dict(current.metadata or {})
        for key, value in updates.items():
            if value is None:
                merged.pop(key, None)
            else:
                merged[key] = value
        merged["auto_transcript_updated_at"] = utc_now_iso()
        updated = self.ingestion.update_asset_metadata(video_asset.id, merged)
        video_asset.metadata = dict(updated.metadata)
        video_asset.updated_at = updated.updated_at
        return updated

    def _find_linked_transcript(self, workspace_id: str, video_asset_id: str) -> Asset | None:
        for asset in self.ingestion.list_assets(workspace_id, asset_type="transcript"):
            if asset.metadata.get("linked_video_asset_id") == video_asset_id:
                return asset
        return None

    @staticmethod
    def _normalize_segments(segments: list[TranscriptSegment], video_asset_id: str) -> list[dict[str, float | str]]:
        normalized: list[dict[str, float | str]] = []
        for segment in segments:
            text = clean_text(str(segment.get("text", "")))
            if not text:
                continue
            start = segment.get("start")
            end = segment.get("end")
            if start is None or end is None:
                continue
            start_value = max(0.0, float(start))
            end_value = max(start_value, float(end))
            if normalized:
                previous = normalized[-1]
                previous_end = float(previous["end"])
                if start_value - previous_end <= 0.35 and len(text) < 100:
                    previous["end"] = end_value
                    previous["text"] = f"{previous['text']} {text}".strip()
                    continue
            normalized.append(
                {
                    "start": round(start_value, 3),
                    "end": round(end_value, 3),
                    "text": text,
                    "video_asset_id": video_asset_id,
                }
            )
        return normalized

    def _transcribe_with_openai(self, media_path: Path, video_asset: Asset) -> list[TranscriptSegment]:
        if not self.config.openai_api_key:
            raise ValueError("Automatic transcript generation requires ORION_OPENAI_API_KEY or OPENAI_API_KEY.")
        prompt = (
            f"Generate an accurate lecture transcript for the university lecture titled '{video_asset.title}'. "
            "Preserve technical terminology, equations, and code vocabulary where spoken."
        )
        segments = transcribe_segments_with_worker(
            media_path=media_path,
            api_key=self.config.openai_api_key,
            model=self.config.openai_transcription_model,
            prompt=prompt,
        )
        if not segments:
            raise ValueError("The transcription provider did not return timestamped segments.")
        return segments
