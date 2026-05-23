from __future__ import annotations

import json

from ..db import Database
from ..models import Conversation, ConversationMessage, QueryResponse
from ..utils.ids import make_id
from ..utils.text import clean_text
from ..utils.time import utc_now_iso


class ConversationService:
    def __init__(self, db: Database):
        self.db = db

    def list_conversations(self, workspace_id: str, user_id: str | None = None, limit: int = 50) -> list[Conversation]:
        params: list[object] = [workspace_id]
        sql = """
            SELECT
                conversations.*,
                COUNT(conversation_messages.id) AS message_count,
                MAX(conversation_messages.created_at) AS last_message_at,
                (
                    SELECT content
                    FROM conversation_messages
                    WHERE conversation_id = conversations.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) AS last_message_preview
            FROM conversations
            LEFT JOIN conversation_messages ON conversation_messages.conversation_id = conversations.id
            WHERE conversations.workspace_id = ?
        """
        if user_id:
            sql += " AND (conversations.user_id = ? OR conversations.user_id IS NULL)"
            params.append(user_id)
        sql += """
            GROUP BY conversations.id
            ORDER BY COALESCE(last_message_at, conversations.updated_at) DESC
            LIMIT ?
        """
        params.append(limit)
        rows = self.db.fetchall(sql, tuple(params))
        return [self._row_to_conversation(row) for row in rows]

    def create_conversation(self, workspace_id: str, user_id: str | None, title: str) -> Conversation:
        conversation = Conversation(
            id=make_id("conv"),
            workspace_id=workspace_id,
            user_id=user_id,
            title=self._normalize_title(title),
            created_at=utc_now_iso(),
            updated_at=utc_now_iso(),
        )
        self.db.execute(
            """
            INSERT INTO conversations (id, workspace_id, user_id, title, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                conversation.id,
                conversation.workspace_id,
                conversation.user_id,
                conversation.title,
                conversation.created_at,
                conversation.updated_at,
            ),
        )
        return conversation

    def rename_conversation(
        self,
        workspace_id: str,
        conversation_id: str,
        title: str,
        user_id: str | None = None,
    ) -> Conversation:
        conversation = self.get_conversation(workspace_id, conversation_id, user_id=user_id)
        if not conversation:
            raise ValueError("Conversation does not exist in this workspace.")
        normalized = self._normalize_title(title)
        now = utc_now_iso()
        self.db.execute(
            "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
            (normalized, now, conversation_id),
        )
        conversation.title = normalized
        conversation.updated_at = now
        return conversation

    def delete_conversation(self, workspace_id: str, conversation_id: str, user_id: str | None = None) -> None:
        conversation = self.get_conversation(workspace_id, conversation_id, user_id=user_id)
        if not conversation:
            raise ValueError("Conversation does not exist in this workspace.")
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM conversation_messages WHERE conversation_id = ?", (conversation_id,))
            conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))

    def ensure_conversation(
        self,
        workspace_id: str,
        user_id: str | None,
        conversation_id: str | None,
        seed_title: str,
    ) -> Conversation:
        if conversation_id:
            conversation = self.get_conversation(workspace_id, conversation_id, user_id=user_id)
            if conversation:
                return conversation
            raise ValueError("Conversation does not exist in this workspace.")
        return self.create_conversation(workspace_id, user_id, seed_title)

    def get_conversation(
        self,
        workspace_id: str,
        conversation_id: str,
        user_id: str | None = None,
    ) -> Conversation | None:
        params: list[object] = [workspace_id, conversation_id]
        sql = """
            SELECT
                conversations.*,
                COUNT(conversation_messages.id) AS message_count,
                (
                    SELECT content
                    FROM conversation_messages
                    WHERE conversation_id = conversations.id
                    ORDER BY created_at DESC
                    LIMIT 1
                ) AS last_message_preview
            FROM conversations
            LEFT JOIN conversation_messages ON conversation_messages.conversation_id = conversations.id
            WHERE conversations.workspace_id = ? AND conversations.id = ?
        """
        if user_id:
            sql += " AND (conversations.user_id = ? OR conversations.user_id IS NULL)"
            params.append(user_id)
        sql += " GROUP BY conversations.id"
        row = self.db.fetchone(sql, tuple(params))
        return self._row_to_conversation(row) if row else None

    def list_messages(
        self,
        workspace_id: str,
        conversation_id: str,
        user_id: str | None = None,
        limit: int = 100,
    ) -> list[ConversationMessage]:
        conversation = self.get_conversation(workspace_id, conversation_id, user_id=user_id)
        if not conversation:
            raise ValueError("Conversation does not exist in this workspace.")
        rows = self.db.fetchall(
            """
            SELECT * FROM (
                SELECT * FROM conversation_messages
                WHERE workspace_id = ? AND conversation_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            )
            ORDER BY created_at ASC
            """,
            (workspace_id, conversation_id, limit),
        )
        return [self._row_to_message(row) for row in rows]

    def append_user_message(
        self,
        workspace_id: str,
        conversation_id: str,
        user_id: str | None,
        content: str,
    ) -> ConversationMessage:
        return self._insert_message(
            conversation_id=conversation_id,
            workspace_id=workspace_id,
            user_id=user_id,
            role="user",
            content=content,
            status=None,
            citations=[],
            playback=None,
            metadata={},
        )

    def append_assistant_message(self, response: QueryResponse, user_id: str | None = None) -> ConversationMessage:
        if not response.conversation_id:
            raise ValueError("Assistant messages require a conversation_id.")
        return self._insert_message(
            conversation_id=response.conversation_id,
            workspace_id=response.workspace_id,
            user_id=user_id,
            role="assistant",
            content=response.answer,
            status=response.status,
            citations=[citation.to_dict() for citation in response.citations],
            playback=response.playback.to_dict() if response.playback else None,
            metadata={
                "cited_chunk_ids": response.cited_chunk_ids,
                "cited_asset_ids": response.cited_asset_ids,
                "support_score": response.support_score,
                "guidance_applied": response.guidance_applied,
                "latency_ms": response.latency_ms,
                "answer_mode": response.answer_mode,
                "complexity_score": response.complexity_score,
                "playback_segments": [segment.to_dict() for segment in response.playback_segments],
            },
        )

    def _insert_message(
        self,
        conversation_id: str,
        workspace_id: str,
        user_id: str | None,
        role: str,
        content: str,
        status: str | None,
        citations: list[dict],
        playback: dict | None,
        metadata: dict,
    ) -> ConversationMessage:
        message = ConversationMessage(
            id=make_id("msg"),
            conversation_id=conversation_id,
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            content=content,
            status=status,
            citations=citations,
            playback=playback,
            metadata=metadata,
            created_at=utc_now_iso(),
        )
        with self.db.transaction() as conn:
            conn.execute(
                """
                INSERT INTO conversation_messages (
                    id, conversation_id, workspace_id, user_id, role, content, status, citations_json,
                    playback_json, metadata_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message.id,
                    message.conversation_id,
                    message.workspace_id,
                    message.user_id,
                    message.role,
                    message.content,
                    message.status,
                    json.dumps(message.citations),
                    json.dumps(message.playback) if message.playback else None,
                    json.dumps(message.metadata),
                    message.created_at,
                ),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (message.created_at, message.conversation_id),
            )
        return message

    @staticmethod
    def _normalize_title(title: str) -> str:
        cleaned = clean_text(title)
        if not cleaned:
            return "New conversation"
        return cleaned[:96]

    @staticmethod
    def _row_to_conversation(row) -> Conversation:
        preview = ConversationService._compact_preview(row["last_message_preview"])
        return Conversation(
            id=row["id"],
            workspace_id=row["workspace_id"],
            user_id=row["user_id"],
            title=row["title"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            message_count=int(row["message_count"]) if row["message_count"] is not None else 0,
            last_message_preview=preview,
        )

    @staticmethod
    def _compact_preview(text: str | None, max_chars: int = 180) -> str | None:
        if not text:
            return text
        compact = " ".join(text.replace("\u00a0", " ").split())
        compact = compact.replace("*", "").replace("`", "").replace("#", "")
        if len(compact) <= max_chars:
            return compact
        return f"{compact[: max_chars - 1].rstrip()}…"

    @staticmethod
    def _row_to_message(row) -> ConversationMessage:
        return ConversationMessage(
            id=row["id"],
            conversation_id=row["conversation_id"],
            workspace_id=row["workspace_id"],
            user_id=row["user_id"],
            role=row["role"],
            content=row["content"],
            status=row["status"],
            citations=json.loads(row["citations_json"]),
            playback=json.loads(row["playback_json"]) if row["playback_json"] else None,
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
        )
