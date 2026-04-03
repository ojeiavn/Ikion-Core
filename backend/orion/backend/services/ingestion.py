from __future__ import annotations

import json
import logging
import mimetypes
import tempfile

from base64 import b64decode
from pathlib import Path

from ..db import Database
from ..models import Asset
from ..storage.drive_client import GoogleDriveClient
from ..storage.file_store import FileStore
from ..utils.ids import make_id
from ..utils.time import utc_now_iso


SUPPORTED_ASSET_TYPES = {"pdf", "transcript", "video", "notice"}
logger = logging.getLogger(__name__)


class AssetIngestionService:
    def __init__(
        self,
        db: Database,
        file_store: FileStore,
        drive_client: GoogleDriveClient | None = None,
        drive_only: bool = False,
    ):
        self.db = db
        self.file_store = file_store
        self.drive_client = drive_client
        self.drive_only = drive_only

    def register_file_asset(
        self,
        workspace_id: str,
        asset_type: str,
        title: str,
        file_path: str | Path,
        metadata: dict | None = None,
        mime_type: str | None = None,
        external_ref: str | None = None,
    ) -> Asset:
        self._validate_asset_type(asset_type)
        asset_id = make_id("asset")
        stored_path = self.file_store.store_uploaded_file(workspace_id, asset_id, file_path)
        file_mime = mime_type or mimetypes.guess_type(str(file_path))[0]
        merged_metadata = dict(metadata or {})
        merged_metadata.setdefault("original_filename", Path(file_path).name)
        merged_metadata.setdefault("sha256", self.file_store.sha256_for_path(stored_path))
        asset = self._insert_asset(
            workspace_id=workspace_id,
            asset_type=asset_type,
            title=title,
            source_path=str(Path(file_path).expanduser().resolve()),
            content_path=str(stored_path),
            mime_type=file_mime,
            external_ref=external_ref,
            metadata=merged_metadata,
            asset_id=asset_id,
        )
        return self._finalize_asset_registration(asset)

    def register_text_asset(
        self,
        workspace_id: str,
        asset_type: str,
        title: str,
        text: str,
        filename: str | None = None,
        metadata: dict | None = None,
    ) -> Asset:
        self._validate_asset_type(asset_type)
        asset_id = make_id("asset")
        target_name = filename or f"{asset_type}.txt"
        stored_path = self.file_store.store_inline_text(workspace_id, asset_id, target_name, text)
        merged_metadata = dict(metadata or {})
        merged_metadata.setdefault("sha256", self.file_store.sha256_for_path(stored_path))
        asset = self._insert_asset(
            workspace_id=workspace_id,
            asset_type=asset_type,
            title=title,
            source_path=None,
            content_path=str(stored_path),
            mime_type="text/plain",
            external_ref=None,
            metadata=merged_metadata,
            asset_id=asset_id,
        )
        return self._finalize_asset_registration(asset)

    def register_browser_file_asset(
        self,
        workspace_id: str,
        asset_type: str,
        title: str,
        filename: str,
        content_base64: str,
        metadata: dict | None = None,
        mime_type: str | None = None,
        external_ref: str | None = None,
    ) -> Asset:
        self._validate_asset_type(asset_type)
        asset_id = make_id("asset")
        stored_path = self.file_store.store_uploaded_bytes(
            workspace_id=workspace_id,
            asset_id=asset_id,
            filename=filename,
            content=b64decode(content_base64),
        )
        file_mime = mime_type or mimetypes.guess_type(filename)[0]
        merged_metadata = dict(metadata or {})
        merged_metadata.setdefault("original_filename", filename)
        merged_metadata.setdefault("sha256", self.file_store.sha256_for_path(stored_path))
        asset = self._insert_asset(
            workspace_id=workspace_id,
            asset_type=asset_type,
            title=title,
            source_path=None,
            content_path=str(stored_path),
            mime_type=file_mime,
            external_ref=external_ref,
            metadata=merged_metadata,
            asset_id=asset_id,
        )
        return self._finalize_asset_registration(asset)

    def register_transcript_segments(
        self,
        workspace_id: str,
        title: str,
        segments: list[dict],
        linked_video_asset_id: str | None = None,
        metadata: dict | None = None,
    ) -> Asset:
        linked_video_asset_id = self._validate_linked_video_asset(workspace_id, linked_video_asset_id)
        normalized_segments = self._validate_transcript_segments(segments)
        asset_id = make_id("asset")
        payload = {
            "segments": normalized_segments,
            "linked_video_asset_id": linked_video_asset_id,
        }
        stored_path = self.file_store.store_json_asset(workspace_id, asset_id, "transcript.json", payload)
        merged_metadata = dict(metadata or {})
        if linked_video_asset_id:
            merged_metadata["linked_video_asset_id"] = linked_video_asset_id
        merged_metadata["is_timestamped_transcript"] = True
        merged_metadata.setdefault("sha256", self.file_store.sha256_for_path(stored_path))
        asset = self._insert_asset(
            workspace_id=workspace_id,
            asset_type="transcript",
            title=title,
            source_path=None,
            content_path=str(stored_path),
            mime_type="application/json",
            external_ref=None,
            metadata=merged_metadata,
            asset_id=asset_id,
        )
        return self._finalize_asset_registration(asset)

    def _validate_linked_video_asset(self, workspace_id: str, linked_video_asset_id: str | None) -> str:
        if not linked_video_asset_id:
            raise ValueError("Timestamped transcripts must be linked to a lecture video.")

        asset = self.get_asset(linked_video_asset_id)
        if asset.workspace_id != workspace_id:
            raise ValueError("The linked lecture video must belong to the active workspace.")
        if asset.asset_type != "video":
            raise ValueError("Timestamped transcripts can only be linked to video assets.")

        return linked_video_asset_id

    @staticmethod
    def _validate_transcript_segments(segments: list[dict]) -> list[dict]:
        normalized: list[dict] = []
        if not segments:
            raise ValueError("Timestamped transcripts require at least one segment.")
        for index, segment in enumerate(segments, start=1):
            text = str(segment.get("text", "")).strip()
            start = segment.get("start")
            end = segment.get("end")
            if not text:
                raise ValueError(f"Transcript segment {index} is missing text.")
            if start is None or end is None:
                raise ValueError(f"Transcript segment {index} must include both start and end timestamps.")
            try:
                start_value = float(start)
                end_value = float(end)
            except Exception as exc:
                raise ValueError(f"Transcript segment {index} has invalid timestamps.") from exc
            if start_value < 0 or end_value < 0 or end_value < start_value:
                raise ValueError(f"Transcript segment {index} has an invalid timestamp range.")
            normalized.append(
                {
                    "start": start_value,
                    "end": end_value,
                    "text": text,
                    "video_asset_id": segment.get("video_asset_id"),
                }
            )
        return normalized

    def register_video_asset(
        self,
        workspace_id: str,
        title: str,
        file_path: str | Path | None = None,
        external_ref: str | None = None,
        metadata: dict | None = None,
    ) -> Asset:
        asset_id = make_id("asset")
        stored_path = None
        source_path = None
        merged_metadata = dict(metadata or {})
        if file_path:
            stored_path = str(self.file_store.store_uploaded_file(workspace_id, asset_id, file_path))
            source_path = str(Path(file_path).expanduser().resolve())
            merged_metadata.setdefault("original_filename", Path(file_path).name)
            merged_metadata.setdefault("sha256", self.file_store.sha256_for_path(stored_path))
        asset = self._insert_asset(
            workspace_id=workspace_id,
            asset_type="video",
            title=title,
            source_path=source_path,
            content_path=stored_path,
            mime_type=mimetypes.guess_type(str(file_path))[0] if file_path else None,
            external_ref=external_ref,
            metadata=merged_metadata,
            asset_id=asset_id,
        )
        return self._finalize_asset_registration(asset)

    def register_browser_video_asset(
        self,
        workspace_id: str,
        title: str,
        filename: str,
        content_base64: str,
        mime_type: str | None = None,
        external_ref: str | None = None,
        metadata: dict | None = None,
    ) -> Asset:
        asset_id = make_id("asset")
        stored_path = self.file_store.store_uploaded_bytes(
            workspace_id=workspace_id,
            asset_id=asset_id,
            filename=filename,
            content=b64decode(content_base64),
        )
        merged_metadata = dict(metadata or {})
        merged_metadata.setdefault("original_filename", filename)
        merged_metadata.setdefault("sha256", self.file_store.sha256_for_path(stored_path))
        asset = self._insert_asset(
            workspace_id=workspace_id,
            asset_type="video",
            title=title,
            source_path=None,
            content_path=str(stored_path),
            mime_type=mime_type or mimetypes.guess_type(filename)[0],
            external_ref=external_ref,
            metadata=merged_metadata,
            asset_id=asset_id,
        )
        return self._finalize_asset_registration(asset)

    def list_assets(self, workspace_id: str, asset_type: str | None = None) -> list[Asset]:
        if asset_type:
            rows = self.db.fetchall(
                "SELECT * FROM assets WHERE workspace_id = ? AND asset_type = ? ORDER BY created_at ASC",
                (workspace_id, asset_type),
            )
        else:
            rows = self.db.fetchall(
                "SELECT * FROM assets WHERE workspace_id = ? ORDER BY created_at ASC",
                (workspace_id,),
            )
        return [self._row_to_asset(row) for row in rows]

    def list_assets_for_all_workspaces(self, asset_type: str | None = None) -> list[Asset]:
        if asset_type:
            rows = self.db.fetchall("SELECT * FROM assets WHERE asset_type = ? ORDER BY created_at ASC", (asset_type,))
        else:
            rows = self.db.fetchall("SELECT * FROM assets ORDER BY created_at ASC")
        return [self._row_to_asset(row) for row in rows]

    def sync_workspace_assets_to_drive(self, workspace_id: str, missing_only: bool = True) -> int:
        if not self.drive_client or not self.drive_client.enabled:
            return 0
        synced = 0
        for asset in self.list_assets(workspace_id):
            if missing_only and asset.metadata.get("drive_file_id"):
                continue
            if not asset.content_path:
                continue
            path = Path(asset.content_path)
            if not path.exists():
                continue
            had_drive_copy = bool(asset.metadata.get("drive_file_id"))
            updated = self._mirror_asset_to_drive(asset, category=asset.asset_type)
            has_drive_copy = bool(updated.metadata.get("drive_file_id"))
            if has_drive_copy and not had_drive_copy:
                synced += 1
        return synced

    def get_asset(self, asset_id: str) -> Asset:
        row = self.db.fetchone("SELECT * FROM assets WHERE id = ?", (asset_id,))
        if not row:
            raise ValueError(f"Asset '{asset_id}' does not exist.")
        return self._row_to_asset(row)

    def ensure_local_content(self, asset_id: str) -> Path | None:
        asset = self.get_asset(asset_id)
        if asset.content_path:
            path = Path(asset.content_path)
            if path.exists():
                return path

        if not self.drive_client or not self.drive_client.enabled:
            return None
        drive_file_id = asset.metadata.get("drive_file_id")
        if not drive_file_id:
            return None

        filename = asset.metadata.get("original_filename") or f"{asset.id}.bin"
        if self.drive_only:
            suffix = Path(filename).suffix or ".bin"
            with tempfile.NamedTemporaryFile(prefix=f"{asset.id}_", suffix=suffix, delete=False) as handle:
                destination = Path(handle.name)
            return self.drive_client.download_file(file_id=drive_file_id, destination=destination)
        destination = self.file_store.workspace_uploads_dir(asset.workspace_id) / f"{asset.id}_{filename}"
        local_path = self.drive_client.download_file(file_id=drive_file_id, destination=destination)
        now = utc_now_iso()
        self.db.execute(
            "UPDATE assets SET content_path = ?, updated_at = ? WHERE id = ?",
            (str(local_path), now, asset.id),
        )
        return local_path

    def get_drive_bytes(self, asset_id: str) -> bytes | None:
        asset = self.get_asset(asset_id)
        if not self.drive_client or not self.drive_client.enabled:
            return None
        drive_file_id = asset.metadata.get("drive_file_id")
        if not drive_file_id:
            return None
        return self.drive_client.download_bytes(file_id=drive_file_id)

    def _insert_asset(
        self,
        workspace_id: str,
        asset_type: str,
        title: str,
        source_path: str | None,
        content_path: str | None,
        mime_type: str | None,
        external_ref: str | None,
        metadata: dict,
        asset_id: str | None = None,
    ) -> Asset:
        now = utc_now_iso()
        asset = Asset(
            id=asset_id or make_id("asset"),
            workspace_id=workspace_id,
            asset_type=asset_type,
            title=title,
            status="ready",
            source_path=source_path,
            content_path=content_path,
            mime_type=mime_type,
            external_ref=external_ref,
            metadata=metadata,
            created_at=now,
            updated_at=now,
        )
        self.db.execute(
            """
            INSERT INTO assets (
                id, workspace_id, asset_type, title, status, source_path, content_path, mime_type, external_ref, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                asset.id,
                asset.workspace_id,
                asset.asset_type,
                asset.title,
                asset.status,
                asset.source_path,
                asset.content_path,
                asset.mime_type,
                asset.external_ref,
                json.dumps(asset.metadata),
                asset.created_at,
                asset.updated_at,
            ),
        )
        return asset

    def _finalize_asset_registration(self, asset: Asset) -> Asset:
        if not self.drive_client or not self.drive_client.enabled:
            return asset
        metadata = dict(asset.metadata)
        metadata["drive_sync_status"] = "pending"
        metadata["drive_sync_updated_at"] = utc_now_iso()
        metadata.pop("drive_sync_error", None)
        return self._update_asset_metadata(asset, metadata)

    def _mirror_asset_to_drive(self, asset: Asset, category: str) -> Asset:
        if not self.drive_client or not self.drive_client.enabled:
            return asset
        if not asset.content_path:
            return asset

        try:
            upload = self.drive_client.upload_file(
                local_path=asset.content_path,
                workspace_id=asset.workspace_id,
                category=category,
                remote_name=self._drive_remote_name(asset),
                mime_type=asset.mime_type,
            )
        except Exception as exc:
            logger.exception("Drive sync failed for asset %s", asset.id)
            metadata = dict(asset.metadata)
            metadata["drive_sync_status"] = "failed"
            metadata["drive_sync_updated_at"] = utc_now_iso()
            metadata["drive_sync_error"] = str(exc)
            return self._update_asset_metadata(asset, metadata)

        if not upload:
            return asset

        merged_metadata = dict(asset.metadata)
        merged_metadata.update(upload.to_metadata())
        now = utc_now_iso()
        merged_metadata["drive_sync_status"] = "ready"
        merged_metadata["drive_sync_updated_at"] = now
        merged_metadata.pop("drive_sync_error", None)
        external_ref = asset.external_ref or upload.web_content_link or upload.web_view_link
        asset = self._update_asset_metadata(asset, merged_metadata, external_ref=external_ref)

        if self.drive_only and asset.content_path:
            path = Path(asset.content_path)
            if path.exists():
                path.unlink()
            self.db.execute("UPDATE assets SET content_path = ?, updated_at = ? WHERE id = ?", (None, now, asset.id))
            asset.content_path = None

        return asset

    def _update_asset_metadata(self, asset: Asset, metadata: dict, external_ref: str | None | object = ...):
        now = utc_now_iso()
        next_external_ref = asset.external_ref if external_ref is ... else external_ref
        self.db.execute(
            "UPDATE assets SET metadata_json = ?, external_ref = ?, updated_at = ? WHERE id = ?",
            (json.dumps(metadata), next_external_ref, now, asset.id),
        )
        asset.metadata = metadata
        asset.external_ref = next_external_ref
        asset.updated_at = now
        return asset

    def update_asset_metadata(self, asset_id: str, metadata: dict, external_ref: str | None | object = ...) -> Asset:
        asset = self.get_asset(asset_id)
        return self._update_asset_metadata(asset, metadata, external_ref=external_ref)

    @staticmethod
    def _drive_remote_name(asset: Asset) -> str:
        original = asset.metadata.get("original_filename")
        if original:
            return f"{asset.id}_{original}"
        extension = {
            "pdf": "pdf",
            "transcript": "json",
            "video": "mp4",
            "notice": "txt",
        }.get(asset.asset_type, "bin")
        return f"{asset.id}_{asset.asset_type}.{extension}"

    @staticmethod
    def _validate_asset_type(asset_type: str) -> None:
        if asset_type not in SUPPORTED_ASSET_TYPES:
            raise ValueError(f"Unsupported asset type '{asset_type}'.")

    @staticmethod
    def _row_to_asset(row) -> Asset:
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except Exception:
            metadata = {}
        external_ref = row["external_ref"]
        if external_ref and metadata.get("drive_file_id") and AssetIngestionService._looks_like_google_drive_link(external_ref):
            # Preserve external_ref for true third-party sources, but suppress legacy
            # drive redirect links so clients use Orion's authenticated stream endpoint.
            external_ref = None
        return Asset(
            id=row["id"],
            workspace_id=row["workspace_id"],
            asset_type=row["asset_type"],
            title=row["title"],
            status=row["status"],
            source_path=row["source_path"],
            content_path=row["content_path"],
            mime_type=row["mime_type"],
            external_ref=external_ref,
            metadata=metadata,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _looks_like_google_drive_link(url: str) -> bool:
        lowered = url.lower()
        return "drive.google.com" in lowered or "googleusercontent.com" in lowered
