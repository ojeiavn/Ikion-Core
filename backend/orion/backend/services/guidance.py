from __future__ import annotations

import json

from ..db import Database
from ..models import GuidancePack
from ..storage.drive_client import GoogleDriveClient
from ..utils.ids import make_id
from ..utils.time import utc_now_iso


class GuidanceService:
    def __init__(self, db: Database, drive_client: GoogleDriveClient | None = None):
        self.db = db
        self.drive_client = drive_client

    def create_guidance_pack(
        self,
        workspace_id: str,
        name: str,
        instructions: str,
        metadata: dict | None = None,
        activate: bool = True,
    ) -> GuidancePack:
        now = utc_now_iso()
        pack_id = make_id("guide")
        merged_metadata = dict(metadata or {})
        if self.drive_client and self.drive_client.enabled:
            upload = self.drive_client.upload_text(
                text=instructions.strip(),
                workspace_id=workspace_id,
                category="guidance",
                remote_name=f"{pack_id}_guidance.md",
                mime_type="text/markdown",
            )
            if upload:
                merged_metadata.update(upload.to_metadata())

        pack = GuidancePack(
            id=pack_id,
            workspace_id=workspace_id,
            name=name,
            instructions=instructions.strip(),
            metadata=merged_metadata,
            is_active=activate,
            created_at=now,
            updated_at=now,
        )
        with self.db.transaction() as conn:
            if activate:
                conn.execute("UPDATE guidance_packs SET is_active = 0 WHERE workspace_id = ?", (workspace_id,))
            conn.execute(
                """
                INSERT INTO guidance_packs (id, workspace_id, name, instructions, metadata_json, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pack.id,
                    pack.workspace_id,
                    pack.name,
                    pack.instructions,
                    json.dumps(pack.metadata),
                    int(pack.is_active),
                    pack.created_at,
                    pack.updated_at,
                ),
            )
        return pack

    def list_guidance_packs(self, workspace_id: str) -> list[GuidancePack]:
        rows = self.db.fetchall(
            "SELECT * FROM guidance_packs WHERE workspace_id = ? ORDER BY updated_at DESC",
            (workspace_id,),
        )
        return [self._row_to_pack(row) for row in rows]

    def get_active_guidance_packs(self, workspace_id: str) -> list[GuidancePack]:
        rows = self.db.fetchall(
            "SELECT * FROM guidance_packs WHERE workspace_id = ? AND is_active = 1 ORDER BY updated_at DESC",
            (workspace_id,),
        )
        return [self._row_to_pack(row) for row in rows]

    def get_active_guidance_texts(self, workspace_id: str) -> list[str]:
        return [pack.instructions for pack in self.get_active_guidance_packs(workspace_id)]

    def sync_workspace_guidance_to_drive(self, workspace_id: str, missing_only: bool = True) -> int:
        if not self.drive_client or not self.drive_client.enabled:
            return 0
        packs = self.list_guidance_packs(workspace_id)
        synced = 0
        for pack in packs:
            if missing_only and pack.metadata.get("drive_file_id"):
                continue
            upload = self.drive_client.upload_text(
                text=pack.instructions.strip(),
                workspace_id=workspace_id,
                category="guidance",
                remote_name=f"{pack.id}_guidance.md",
                mime_type="text/markdown",
            )
            if not upload:
                continue
            merged = dict(pack.metadata)
            merged.update(upload.to_metadata())
            now = utc_now_iso()
            self.db.execute(
                "UPDATE guidance_packs SET metadata_json = ?, updated_at = ? WHERE id = ?",
                (json.dumps(merged), now, pack.id),
            )
            synced += 1
        return synced

    @staticmethod
    def _row_to_pack(row) -> GuidancePack:
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except Exception:
            metadata = {}
        return GuidancePack(
            id=row["id"],
            workspace_id=row["workspace_id"],
            name=row["name"],
            instructions=row["instructions"],
            metadata=metadata,
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
