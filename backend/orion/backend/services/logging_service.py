from __future__ import annotations

import json

from ..db import Database
from ..models import QueryResponse
from ..utils.ids import make_id
from ..utils.time import utc_now_iso


class QueryLoggingService:
    def __init__(self, db: Database):
        self.db = db

    def log_query_event(
        self,
        response: QueryResponse,
        user_id: str | None = None,
        extra_metrics: dict | None = None,
    ) -> str:
        event_id = make_id("query")
        retrieval_rows = [
            {
                "chunk_id": hit.chunk.id,
                "asset_id": hit.chunk.asset_id,
                "asset_type": hit.chunk.asset_type,
                "score": hit.final_score,
                "semantic_score": hit.semantic_score,
                "lexical_score": hit.lexical_score,
            }
            for hit in response.retrieval_hits
        ]
        metrics = {
            "support_score": response.support_score,
            "latency_ms": response.latency_ms,
            "playback_available": bool(response.playback),
            "playback_segment_count": len(response.playback_segments),
            "guidance_applied": response.guidance_applied,
            "answer_mode": response.answer_mode,
            "complexity_score": response.complexity_score,
        }
        if extra_metrics:
            metrics.update(extra_metrics)
        self.db.execute(
            """
            INSERT INTO query_events (
                id, workspace_id, user_id, conversation_id, query_text, response_text, response_status, cited_chunk_ids_json, cited_asset_ids_json,
                retrieval_json, playback_json, metrics_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                response.workspace_id,
                user_id,
                response.conversation_id,
                response.query,
                response.answer,
                response.status,
                json.dumps(response.cited_chunk_ids),
                json.dumps(response.cited_asset_ids),
                json.dumps(retrieval_rows),
                json.dumps(response.playback.to_dict()) if response.playback else None,
                json.dumps(metrics),
                utc_now_iso(),
            ),
        )
        return event_id

    def list_query_events(self, workspace_id: str, limit: int = 50) -> list[dict]:
        rows = self.db.fetchall(
            """
            SELECT * FROM query_events
            WHERE workspace_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (workspace_id, limit),
        )
        return [self._row_to_dict(row) for row in rows]

    @staticmethod
    def _row_to_dict(row) -> dict:
        return {
            "id": row["id"],
            "workspace_id": row["workspace_id"],
            "user_id": row["user_id"],
            "conversation_id": row["conversation_id"],
            "query_text": row["query_text"],
            "response_text": row["response_text"],
            "response_status": row["response_status"],
            "cited_chunk_ids": json.loads(row["cited_chunk_ids_json"]),
            "cited_asset_ids": json.loads(row["cited_asset_ids_json"]),
            "retrieval": json.loads(row["retrieval_json"]),
            "playback": json.loads(row["playback_json"]) if row["playback_json"] else None,
            "metrics": json.loads(row["metrics_json"]),
            "created_at": row["created_at"],
        }
