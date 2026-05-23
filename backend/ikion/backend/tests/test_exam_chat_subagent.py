from __future__ import annotations

import tempfile
import unittest

from pathlib import Path

from ikion.backend.config import IkionConfig
from ikion.backend.services.conversation_graph import TurnPlan
from ikion.backend.services.exam_chat_subagent import ExamChatSubagentService


class FakeExamPractice:
    def is_exam_related_query(self, query: str) -> bool:
        lowered = query.lower()
        return "exam" in lowered or "past paper" in lowered or "question" in lowered

    def recommend_question(
        self,
        workspace_id: str,
        user_id: str | None,
        prefer_inspired: bool = False,
        requested_topics: list[str] | None = None,
    ) -> dict:
        base = {
            "id": "examq_uploaded",
            "origin_type": "uploaded",
            "paper_label": "midterm.pdf · Q2",
            "question_text": "Describe how MPI_Bcast differs from MPI_Scatter in data movement.",
            "topic_label": "mpi communication",
            "marks": 10,
            "guidance": "Define each primitive, then compare communication cost.",
            "answer_framework": [
                "Define the primitives precisely.",
                "Compare data movement patterns.",
            ],
            "why_this_now": ["Targets your weak communication-pattern topic."],
        }
        if prefer_inspired:
            base["inspired_variant"] = {
                "id": None,
                "origin_type": "inspired",
                "question_text": "Design a short exam-style response comparing MPI_Gather and MPI_Allgather trade-offs.",
                "topic_label": "mpi communication",
            }
        return base

    def resolve_question_for_query(
        self,
        workspace_id: str,
        user_id: str | None,
        query: str,
        *,
        requested_topics: list[str] | None = None,
        prefer_inspired: bool = False,
    ) -> dict:
        payload = self.recommend_question(
            workspace_id=workspace_id,
            user_id=user_id,
            prefer_inspired=prefer_inspired,
            requested_topics=requested_topics,
        )
        lowered = query.lower()
        if "q2" in lowered:
            payload["question_number"] = "2"
            payload["matched_specific_question"] = True
            payload["specific_match_reason"] = "explicit_question_number"
        return payload


class ExamChatSubagentTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.config = IkionConfig(
            data_root=root,
            uploads_root=root / "uploads",
            corpora_root=root / "corpora",
            database_path=root / "orion.db",
            openai_api_key=None,
        )
        self.subagent = ExamChatSubagentService(self.config, FakeExamPractice())
        self.turn_plan = TurnPlan(
            turn_type="new_query",
            standalone_query="",
            uses_history=False,
            referenced_points=[],
            response_strategy=[],
            history_summary=None,
            confidence=0.7,
            reason="test",
        )

    def tearDown(self):
        self.tempdir.cleanup()

    def test_selects_uploaded_question_when_user_requests_past_paper_source(self):
        result = self.subagent.analyze(
            workspace_id="ws_test",
            user_id="user_test",
            query="Give me an exam-style question on MPI directly from uploaded past papers.",
            turn_plan=self.turn_plan,
        )

        self.assertTrue(result.exam_related)
        self.assertEqual(result.intent, "question_generation")
        self.assertEqual(result.source_preference, "uploaded")
        self.assertEqual(result.selected_question["origin_type"], "uploaded")
        self.assertIn("MPI_Bcast", result.selected_question["question_text"])
        self.assertIsNotNone(result.retrieval_query_hint)

    def test_selects_inspired_variant_when_user_requests_inspired_question(self):
        result = self.subagent.analyze(
            workspace_id="ws_test",
            user_id="user_test",
            query="Generate an inspired exam-style question similar to past paper MPI communication questions.",
            turn_plan=self.turn_plan,
        )

        self.assertTrue(result.exam_related)
        self.assertEqual(result.source_preference, "inspired")
        self.assertEqual(result.selected_question["origin_type"], "inspired")
        self.assertIn("MPI_Gather", result.selected_question["question_text"])

    def test_ignores_non_exam_query(self):
        result = self.subagent.analyze(
            workspace_id="ws_test",
            user_id="user_test",
            query="Summarize lecture 3 in three bullets.",
            turn_plan=self.turn_plan,
        )

        self.assertFalse(result.exam_related)
        self.assertEqual(result.intent, "none")
        self.assertIsNone(result.selected_question)

    def test_walkthrough_query_uses_specific_question_intent(self):
        result = self.subagent.analyze(
            workspace_id="ws_test",
            user_id="user_test",
            query="Walk me through Q2 step by step with mark scheme guidance.",
            turn_plan=self.turn_plan,
        )

        self.assertTrue(result.exam_related)
        self.assertEqual(result.intent, "question_walkthrough")
        assert result.selected_question is not None
        self.assertEqual(result.selected_question.get("question_number"), "2")
        self.assertTrue(any("exact question as the anchor" in line for line in result.instructions))


if __name__ == "__main__":
    unittest.main()
