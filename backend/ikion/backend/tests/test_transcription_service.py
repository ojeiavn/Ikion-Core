from __future__ import annotations

import base64
import tempfile
import unittest

from pathlib import Path

from ikion.backend.config import IkionConfig
from ikion.backend.db import Database
from ikion.backend.storage.file_store import FileStore
from ikion.backend.services.ingestion import AssetIngestionService
from ikion.backend.services.transcription import TranscriptGenerationService
from ikion.backend.utils.time import utc_now_iso


class FakeCorpusBuilder:
    def __init__(self):
        self.calls: list[str] = []

    def build_workspace_corpus(self, workspace_id: str):
        self.calls.append(workspace_id)


class TranscriptGenerationServiceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.config = IkionConfig(
            data_root=root,
            uploads_root=root / "uploads",
            corpora_root=root / "corpora",
            database_path=root / "orion.db",
            openai_api_key="test-key",
            auto_generate_video_transcripts=True,
            auto_rebuild_corpus_on_transcript=True,
        )
        self.db = Database(self.config.database_path)
        self.file_store = FileStore(self.config)
        self.ingestion = AssetIngestionService(self.db, self.file_store)
        self.workspace_id = "ws_test"
        with self.db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO workspaces (id, slug, name, description, metadata_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.workspace_id,
                    "ws-test",
                    "Workspace Test",
                    None,
                    "{}",
                    utc_now_iso(),
                    utc_now_iso(),
                ),
            )

    def tearDown(self):
        self.tempdir.cleanup()

    def _register_video(self, title: str = "Lecture 1"):
        content = base64.b64encode(b"fake video bytes").decode("utf-8")
        return self.ingestion.register_browser_video_asset(
            workspace_id=self.workspace_id,
            title=title,
            filename="lecture.mp4",
            content_base64=content,
            mime_type="video/mp4",
        )

    def test_generates_transcript_asset_and_marks_video_ready(self):
        video_asset = self._register_video()
        corpus_builder = FakeCorpusBuilder()

        service = TranscriptGenerationService(
            self.config,
            self.ingestion,
            corpus_builder=corpus_builder,
            transcribe_video_fn=lambda _path, _asset: [
                {"start": 0.0, "end": 4.2, "text": "Welcome to the lecture."},
                {"start": 4.3, "end": 9.0, "text": "Today we cover parallel speedup."},
            ],
        )

        transcript_asset = service.generate_for_video_asset(video_asset.id)

        self.assertIsNotNone(transcript_asset)
        assert transcript_asset is not None
        self.assertEqual(transcript_asset.asset_type, "transcript")
        self.assertEqual(transcript_asset.metadata["linked_video_asset_id"], video_asset.id)
        self.assertEqual(transcript_asset.metadata["transcript_origin"], "ikion_auto_generated")

        refreshed_video = self.ingestion.get_asset(video_asset.id)
        self.assertEqual(refreshed_video.metadata["auto_transcript_status"], "ready")
        self.assertEqual(refreshed_video.metadata["linked_transcript_asset_id"], transcript_asset.id)
        self.assertEqual(corpus_builder.calls, [self.workspace_id])

    def test_reuses_existing_linked_transcript_instead_of_generating_again(self):
        video_asset = self._register_video()
        existing_transcript = self.ingestion.register_transcript_segments(
            workspace_id=self.workspace_id,
            title="Manual Transcript",
            linked_video_asset_id=video_asset.id,
            segments=[{"start": 0, "end": 5, "text": "Manual transcript"}],
            metadata={"transcript_origin": "manual"},
        )

        service = TranscriptGenerationService(
            self.config,
            self.ingestion,
            transcribe_video_fn=lambda _path, _asset: self.fail("transcribe_video_fn should not be called"),
        )

        result = service.generate_for_video_asset(video_asset.id)

        self.assertEqual(result.id, existing_transcript.id)
        refreshed_video = self.ingestion.get_asset(video_asset.id)
        self.assertEqual(refreshed_video.metadata["auto_transcript_status"], "ready")
        self.assertEqual(refreshed_video.metadata["auto_transcript_source"], "existing")

    def test_marks_external_only_video_as_unsupported(self):
        video_asset = self.ingestion.register_video_asset(
            workspace_id=self.workspace_id,
            title="External Lecture",
            external_ref="https://example.com/lecture",
        )
        service = TranscriptGenerationService(
            self.config,
            self.ingestion,
            transcribe_video_fn=lambda _path, _asset: [],
        )

        result = service.generate_for_video_asset(video_asset.id)

        self.assertIsNone(result)
        refreshed_video = self.ingestion.get_asset(video_asset.id)
        self.assertEqual(refreshed_video.metadata["auto_transcript_status"], "unsupported_external_only")
        self.assertIn("externally referenced", refreshed_video.metadata["auto_transcript_error"])


if __name__ == "__main__":
    unittest.main()
