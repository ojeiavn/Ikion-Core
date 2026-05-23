from __future__ import annotations

import json

from ..db import Database
from ..models import Workspace
from ..storage.file_store import FileStore
from ..utils.ids import make_id
from ..utils.text import slugify
from ..utils.time import utc_now_iso


class WorkspaceService:
    def __init__(self, db: Database, file_store: FileStore):
        self.db = db
        self.file_store = file_store

    def create_workspace(self, name: str, description: str | None = None, metadata: dict | None = None) -> Workspace:
        now = utc_now_iso()
        base_slug = slugify(name)
        slug = base_slug
        suffix = 2
        while self.db.fetchone("SELECT 1 FROM workspaces WHERE slug = ?", (slug,)):
            slug = f"{base_slug}-{suffix}"
            suffix += 1

        workspace = Workspace(
            id=make_id("ws"),
            slug=slug,
            name=name,
            description=description,
            metadata=metadata or {},
            created_at=now,
            updated_at=now,
        )
        self.db.execute(
            """
            INSERT INTO workspaces (id, slug, name, description, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                workspace.id,
                workspace.slug,
                workspace.name,
                workspace.description,
                json.dumps(workspace.metadata),
                workspace.created_at,
                workspace.updated_at,
            ),
        )
        self.file_store.workspace_uploads_dir(workspace.id)
        self.file_store.workspace_corpora_dir(workspace.id)
        return workspace

    def list_workspaces(self) -> list[Workspace]:
        rows = self.db.fetchall("SELECT * FROM workspaces ORDER BY created_at DESC")
        return [self._row_to_workspace(row) for row in rows]

    def get_workspace(self, workspace_id: str) -> Workspace:
        row = self.db.fetchone("SELECT * FROM workspaces WHERE id = ?", (workspace_id,))
        if not row:
            raise ValueError(f"Workspace '{workspace_id}' does not exist.")
        return self._row_to_workspace(row)

    @staticmethod
    def _row_to_workspace(row) -> Workspace:
        return Workspace(
            id=row["id"],
            slug=row["slug"],
            name=row["name"],
            description=row["description"],
            metadata=json.loads(row["metadata_json"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

