from __future__ import annotations

import unittest

from orion.backend.models import Chunk
from orion.backend.services.knowledge_graph import KnowledgeGraphService


class KnowledgeGraphExamTests(unittest.TestCase):
    def setUp(self):
        self.graph_service = KnowledgeGraphService()

    def test_includes_exam_alias_index_and_entries(self):
        chunks = [
            Chunk(
                id="chunk_1",
                workspace_id="ws_test",
                corpus_version_id="cv_1",
                asset_id="asset_pdf",
                asset_title="Lecture Notes",
                asset_type="pdf",
                text="MPI scatter and gather communication.",
                metadata={"salient_terms": ["mpi", "scatter", "gather"]},
                position=0,
            )
        ]
        exam_questions = [
            {
                "id": "examq_1",
                "question_number": "1",
                "question_text": "Explain MPI scatter/gather trade-offs.",
                "topic_label": "mpi communication",
                "marks": 10,
                "origin_type": "uploaded",
                "source_asset_title": "midterm.pdf",
            }
        ]

        graph = self.graph_service.build_graph(chunks, exam_questions=exam_questions)

        self.assertIn("exam_questions", graph)
        self.assertEqual(graph["exam_questions"][0]["id"], "examq_1")
        self.assertIn("exam_alias_index", graph)
        self.assertIn("q1", graph["exam_alias_index"])
        self.assertIn("examq_1", graph["exam_alias_index"]["q1"])


if __name__ == "__main__":
    unittest.main()
