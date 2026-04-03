from __future__ import annotations

import tempfile
import unittest

from pathlib import Path

from orion.backend.config import OrionConfig
from orion.backend.db import Database
from orion.backend.models import ConversationMessage
from orion.backend.services.conversation_graph import ConversationGraphService
from orion.backend.services.conversations import ConversationService
from orion.backend.utils.ids import make_id
from orion.backend.utils.time import utc_now_iso


class ConversationContextTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        root = Path(self.tempdir.name)
        self.config = OrionConfig(
            data_root=root,
            uploads_root=root / "uploads",
            corpora_root=root / "corpora",
            database_path=root / "orion.db",
            openai_api_key=None,
        )
        self.db = Database(self.config.database_path)
        self.workspace_id = "ws_test"
        self.user_id = "user_test"
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
        self.conversations = ConversationService(self.db)
        self.planner = ConversationGraphService(self.config)

    def tearDown(self):
        self.tempdir.cleanup()

    def test_list_messages_returns_most_recent_messages_in_chronological_order(self):
        conversation = self.conversations.create_conversation(self.workspace_id, self.user_id, "Chat")
        timestamps = [
            "2026-04-02T09:00:00Z",
            "2026-04-02T09:01:00Z",
            "2026-04-02T09:02:00Z",
            "2026-04-02T09:03:00Z",
        ]
        contents = ["first", "second", "third", "fourth"]
        with self.db.transaction() as conn:
            for timestamp, content in zip(timestamps, contents):
                conn.execute(
                    """
                    INSERT INTO conversation_messages (
                        id, conversation_id, workspace_id, user_id, role, content, status, citations_json,
                        playback_json, metadata_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        make_id("msg"),
                        conversation.id,
                        self.workspace_id,
                        self.user_id,
                        "user",
                        content,
                        None,
                        "[]",
                        "null",
                        "{}",
                        timestamp,
                    ),
                )

        messages = self.conversations.list_messages(self.workspace_id, conversation.id, user_id=self.user_id, limit=2)

        self.assertEqual([message.content for message in messages], ["third", "fourth"])

    def test_turn_planner_rewrites_follow_up_with_referenced_points(self):
        history = [
            self._message(
                "assistant",
                "\n".join(
                    [
                        "If you want, I can also explain:",
                        "1. Shared vs. distributed memory parallel computers",
                        "2. MPI_Gather",
                        "3. The computation-to-communication ratio",
                    ]
                ),
            )
        ]

        plan = self.planner.plan_turn("All three in more detail please", history)

        self.assertTrue(plan.uses_history)
        self.assertEqual(plan.turn_type, "follow_up")
        self.assertGreaterEqual(len(plan.referenced_points), 3)
        self.assertIn("Shared vs. distributed memory parallel computers", plan.standalone_query)
        self.assertIn("MPI_Gather", plan.standalone_query)

    def test_turn_planner_keeps_self_contained_query_as_new_query(self):
        history = [
            self._message("user", "What is MPI_Bcast?"),
            self._message("assistant", "MPI_Bcast broadcasts data from one process to all others."),
        ]

        plan = self.planner.plan_turn(
            "Compare shared and distributed memory using examples from this module.",
            history,
        )

        self.assertEqual(plan.turn_type, "new_query")
        self.assertFalse(plan.uses_history)
        self.assertEqual(plan.standalone_query, "Compare shared and distributed memory using examples from this module.")

    def _message(self, role: str, content: str) -> ConversationMessage:
        return ConversationMessage(
            id=make_id("msg"),
            conversation_id="conv_test",
            workspace_id=self.workspace_id,
            user_id=self.user_id,
            role=role,
            content=content,
            status=None,
            citations=[],
            playback=None,
            metadata={},
            created_at=utc_now_iso(),
        )


if __name__ == "__main__":
    unittest.main()
