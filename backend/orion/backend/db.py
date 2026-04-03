from __future__ import annotations

import sqlite3

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS workspace_memberships (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(workspace_id, user_id),
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        source_path TEXT,
        content_path TEXT,
        mime_type TEXT,
        external_ref TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS guidance_packs (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        instructions TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS corpus_versions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        status TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        build_metadata_json TEXT NOT NULL DEFAULT '{}',
        asset_ids_json TEXT NOT NULL DEFAULT '[]',
        chunk_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        activated_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS query_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT,
        conversation_id TEXT,
        query_text TEXT NOT NULL,
        response_text TEXT,
        response_status TEXT NOT NULL,
        cited_chunk_ids_json TEXT NOT NULL DEFAULT '[]',
        cited_asset_ids_json TEXT NOT NULL DEFAULT '[]',
        retrieval_json TEXT NOT NULL DEFAULT '[]',
        playback_json TEXT,
        metrics_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        user_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT,
        citations_json TEXT NOT NULL DEFAULT '[]',
        playback_json TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id),
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS insights_snapshots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS exam_questions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_asset_id TEXT,
        mark_scheme_asset_id TEXT,
        question_number TEXT,
        question_text TEXT NOT NULL,
        normalized_question TEXT NOT NULL,
        topic_label TEXT,
        difficulty REAL NOT NULL DEFAULT 0.5,
        marks INTEGER,
        origin_type TEXT NOT NULL DEFAULT 'uploaded',
        source_question_id TEXT,
        guidance TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(source_asset_id) REFERENCES assets(id),
        FOREIGN KEY(mark_scheme_asset_id) REFERENCES assets(id),
        FOREIGN KEY(source_question_id) REFERENCES exam_questions(id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS exam_attempts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        exam_question_id TEXT,
        prompt_text TEXT NOT NULL,
        student_answer TEXT NOT NULL,
        evaluation_text TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        rubric_json TEXT NOT NULL DEFAULT '{}',
        strengths_json TEXT NOT NULL DEFAULT '[]',
        improvements_json TEXT NOT NULL DEFAULT '[]',
        focus_topics_json TEXT NOT NULL DEFAULT '[]',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(exam_question_id) REFERENCES exam_questions(id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_assets_workspace ON assets(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace ON workspace_memberships(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at)",
    "CREATE INDEX IF NOT EXISTS idx_guidance_workspace ON guidance_packs(workspace_id)",
    "CREATE INDEX IF NOT EXISTS idx_corpus_versions_workspace ON corpus_versions(workspace_id, is_active)",
    "CREATE INDEX IF NOT EXISTS idx_query_events_workspace ON query_events(workspace_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, updated_at)",
    "CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_exam_questions_workspace ON exam_questions(workspace_id, origin_type, updated_at)",
    "CREATE INDEX IF NOT EXISTS idx_exam_attempts_workspace_user ON exam_attempts(workspace_id, user_id, created_at)",
]


class Database:
    def __init__(self, database_path: Path):
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def initialize(self) -> None:
        with self.transaction() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            for statement in SCHEMA_STATEMENTS:
                conn.execute(statement)
            self._apply_compat_migrations(conn)

    def _apply_compat_migrations(self, conn: sqlite3.Connection) -> None:
        self._ensure_column(conn, "query_events", "conversation_id", "TEXT")
        self._ensure_column(conn, "exam_questions", "source_question_id", "TEXT")
        self._ensure_column(conn, "exam_questions", "guidance", "TEXT")

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def execute(self, sql: str, params: tuple | list = ()) -> None:
        with self.transaction() as conn:
            conn.execute(sql, params)

    def fetchone(self, sql: str, params: tuple | list = ()) -> sqlite3.Row | None:
        with self.transaction() as conn:
            return conn.execute(sql, params).fetchone()

    def fetchall(self, sql: str, params: tuple | list = ()) -> list[sqlite3.Row]:
        with self.transaction() as conn:
            return conn.execute(sql, params).fetchall()
