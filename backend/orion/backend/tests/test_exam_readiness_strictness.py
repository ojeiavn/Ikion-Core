from __future__ import annotations

import tempfile
import unittest

from pathlib import Path

from orion.backend.config import OrionConfig
from orion.backend.db import Database
from orion.backend.models import ExamAttempt
from orion.backend.services.exam_practice import ExamPracticeService
from orion.backend.services.ingestion import AssetIngestionService
from orion.backend.storage.file_store import FileStore
from orion.backend.utils.time import utc_now_iso


class ExamReadinessStrictnessTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.config = OrionConfig(
            data_root=root,
            uploads_root=root / "uploads",
            corpora_root=root / "corpora",
            database_path=root / "orion.db",
        )
        self.db = Database(self.config.database_path)
        self.file_store = FileStore(self.config)
        self.ingestion = AssetIngestionService(self.db, self.file_store)
        # retrieval/guidance are not needed for readiness unit tests.
        self.service = ExamPracticeService(self.config, self.db, self.ingestion, retrieval=None, guidance=None)  # type: ignore[arg-type]

    def tearDown(self):
        self.tempdir.cleanup()

    def _attempt(self, *, score: float, support: float = 0.0) -> ExamAttempt:
        now = utc_now_iso()
        return ExamAttempt(
            id="attempt",
            workspace_id="ws",
            user_id="user",
            exam_question_id=None,
            prompt_text="Question",
            student_answer="Answer",
            evaluation_text="Evaluation",
            score=score,
            rubric={"support_score": support},
            strengths=[],
            improvements=[],
            focus_topics=[],
            metadata={},
            created_at=now,
            updated_at=now,
        )

    def test_readiness_stays_near_zero_with_chat_only(self):
        query_rows = [
            {
                "query_text": "Give me an exam question",
                "response_status": "answered",
                "metrics_json": '{"exam_related": true, "chat_readiness_score": 1.0}',
                "created_at": utc_now_iso(),
            }
            for _ in range(8)
        ]
        readiness = self.service._readiness_components([], query_rows)
        self.assertLessEqual(readiness["chat_readiness_score"], 10)
        self.assertLessEqual(readiness["readiness_score"], 5)

    def test_single_strong_attempt_is_hard_capped(self):
        attempts = [self._attempt(score=0.96, support=0.95)]
        score = self.service._attempt_readiness_score(attempts)
        self.assertLessEqual(score, 8)

    def test_three_strong_attempts_still_strict(self):
        attempts = [
            self._attempt(score=0.94, support=0.9),
            self._attempt(score=0.91, support=0.88),
            self._attempt(score=0.93, support=0.9),
        ]
        score = self.service._attempt_readiness_score(attempts)
        self.assertLessEqual(score, 22)

    def test_poor_evidence_usage_crushes_readiness(self):
        attempts = [
            self._attempt(score=0.9, support=0.15),
            self._attempt(score=0.88, support=0.2),
            self._attempt(score=0.87, support=0.12),
            self._attempt(score=0.89, support=0.1),
            self._attempt(score=0.9, support=0.2),
            self._attempt(score=0.92, support=0.18),
        ]
        score = self.service._attempt_readiness_score(attempts)
        self.assertLessEqual(score, 36)


if __name__ == "__main__":
    unittest.main()
