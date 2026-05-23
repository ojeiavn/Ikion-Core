from __future__ import annotations

from typing import Any

from ..db import Database
from ..models import Workspace, WorkspaceMembership
from ..utils.ids import make_id
from ..utils.time import utc_now_iso


class WorkspaceMembershipService:
    def __init__(self, db: Database):
        self.db = db

    def add_member(self, workspace_id: str, user_id: str, role: str) -> WorkspaceMembership:
        now = utc_now_iso()
        existing = self.db.fetchone(
            "SELECT * FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?",
            (workspace_id, user_id),
        )
        if existing:
            self.db.execute(
                "UPDATE workspace_memberships SET role = ? WHERE id = ?",
                (role, existing["id"]),
            )
            return WorkspaceMembership(
                id=existing["id"],
                workspace_id=existing["workspace_id"],
                user_id=existing["user_id"],
                role=role,
                created_at=existing["created_at"],
            )

        membership = WorkspaceMembership(
            id=make_id("wm"),
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
            created_at=now,
        )
        self.db.execute(
            """
            INSERT INTO workspace_memberships (id, workspace_id, user_id, role, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                membership.id,
                membership.workspace_id,
                membership.user_id,
                membership.role,
                membership.created_at,
            ),
        )
        return membership

    def remove_member(self, workspace_id: str, user_id: str) -> None:
        self.db.execute(
            "DELETE FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?",
            (workspace_id, user_id),
        )

    def is_member(self, workspace_id: str, user_id: str) -> bool:
        row = self.db.fetchone(
            "SELECT 1 FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?",
            (workspace_id, user_id),
        )
        return bool(row)

    def get_member_role(self, workspace_id: str, user_id: str) -> str | None:
        row = self.db.fetchone(
            "SELECT role FROM workspace_memberships WHERE workspace_id = ? AND user_id = ?",
            (workspace_id, user_id),
        )
        return row["role"] if row else None

    def list_members(self, workspace_id: str) -> list[dict[str, Any]]:
        rows = self.db.fetchall(
            """
            SELECT workspace_memberships.*, users.email, users.full_name, users.role AS user_role
            FROM workspace_memberships
            JOIN users ON users.id = workspace_memberships.user_id
            WHERE workspace_memberships.workspace_id = ?
            ORDER BY users.full_name ASC
            """,
            (workspace_id,),
        )
        return [
            {
                **WorkspaceMembership(
                    id=row["id"],
                    workspace_id=row["workspace_id"],
                    user_id=row["user_id"],
                    role=row["role"],
                    created_at=row["created_at"],
                ).to_dict(),
                "user_email": row["email"],
                "user_full_name": row["full_name"],
                "user_role": row["user_role"],
            }
            for row in rows
        ]

    def list_workspaces_for_user(self, user_id: str) -> list[dict[str, Any]]:
        rows = self.db.fetchall(
            """
            SELECT workspaces.*, workspace_memberships.role AS membership_role
            FROM workspace_memberships
            JOIN workspaces ON workspaces.id = workspace_memberships.workspace_id
            WHERE workspace_memberships.user_id = ?
            ORDER BY workspaces.created_at DESC
            """,
            (user_id,),
        )
        return [
            {
                **Workspace(
                    id=row["id"],
                    slug=row["slug"],
                    name=row["name"],
                    description=row["description"],
                    metadata=self._metadata_from_row(row),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                ).to_dict(),
                "membership_role": row["membership_role"],
            }
            for row in rows
        ]

    @staticmethod
    def _metadata_from_row(row: Any) -> dict[str, Any]:
        raw = row["metadata_json"]
        try:
            import json

            return json.loads(raw) if raw else {}
        except Exception:
            return {}
