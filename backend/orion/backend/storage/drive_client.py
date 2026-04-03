from __future__ import annotations

import json
import time

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any


DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder"


@dataclass(slots=True)
class DriveUploadResult:
    file_id: str
    name: str
    mime_type: str | None
    web_view_link: str | None
    web_content_link: str | None
    parents: list[str]

    def to_metadata(self) -> dict[str, Any]:
        return {
            "file_id": self.file_id,
            "drive_file_id": self.file_id,
            "drive_name": self.name,
            "drive_mime_type": self.mime_type,
            "drive_web_view_link": self.web_view_link,
            "drive_web_content_link": self.web_content_link,
            "drive_parents": self.parents,
        }


class GoogleDriveClient:
    def __init__(
        self,
        *,
        enabled: bool,
        credentials_path: str | None,
        credentials_json: str | None,
        root_folder_id: str | None,
        shared_drive_id: str | None = None,
    ):
        self.enabled = enabled
        self.credentials_path = credentials_path
        self.credentials_json = credentials_json
        self.root_folder_id = root_folder_id
        self.shared_drive_id = shared_drive_id
        self._service = None
        self._credentials = None
        self._authorized_session = None
        self._folder_cache: dict[str, str] = {}

    def upload_file(
        self,
        *,
        local_path: str | Path,
        workspace_id: str,
        category: str,
        remote_name: str | None = None,
        mime_type: str | None = None,
    ) -> DriveUploadResult | None:
        if not self.enabled:
            return None
        path = Path(local_path).expanduser().resolve()
        if not path.exists():
            raise ValueError(f"Drive upload source does not exist: {path}")
        with path.open("rb") as handle:
            content = handle.read()
        return self.upload_bytes(
            content=content,
            workspace_id=workspace_id,
            category=category,
            remote_name=remote_name or path.name,
            mime_type=mime_type,
        )

    def upload_text(
        self,
        *,
        text: str,
        workspace_id: str,
        category: str,
        remote_name: str,
        mime_type: str = "text/plain",
    ) -> DriveUploadResult | None:
        return self.upload_bytes(
            content=text.encode("utf-8"),
            workspace_id=workspace_id,
            category=category,
            remote_name=remote_name,
            mime_type=mime_type,
        )

    def upload_bytes(
        self,
        *,
        content: bytes,
        workspace_id: str,
        category: str,
        remote_name: str,
        mime_type: str | None = None,
    ) -> DriveUploadResult | None:
        if not self.enabled:
            return None
        service = self._service_client()
        parent_id = self._ensure_category_folder(workspace_id, category)
        media = self._media_upload(BytesIO(content), mime_type or "application/octet-stream")
        payload = {"name": remote_name, "parents": [parent_id]}
        file_obj = (
            service.files()
            .create(
                body=payload,
                media_body=media,
                fields="id,name,mimeType,webViewLink,webContentLink,parents",
                supportsAllDrives=True,
            )
            .execute()
        )
        return DriveUploadResult(
            file_id=file_obj["id"],
            name=file_obj.get("name", remote_name),
            mime_type=file_obj.get("mimeType"),
            web_view_link=file_obj.get("webViewLink"),
            web_content_link=file_obj.get("webContentLink"),
            parents=list(file_obj.get("parents", [])),
        )

    def download_file(self, *, file_id: str, destination: str | Path) -> Path:
        if not self.enabled:
            raise ValueError("Google Drive storage is disabled.")
        service = self._service_client()
        destination_path = Path(destination).expanduser().resolve()
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        with destination_path.open("wb") as handle:
            downloader = self._media_downloader(handle, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        return destination_path

    def download_bytes(self, *, file_id: str) -> bytes:
        if not self.enabled:
            raise ValueError("Google Drive storage is disabled.")
        service = self._service_client()
        request = service.files().get_media(fileId=file_id, supportsAllDrives=True)
        buffer = BytesIO()
        downloader = self._media_downloader(buffer, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        return buffer.getvalue()

    def stream_media(self, *, file_id: str, range_header: str | None = None):
        """
        Stream Drive media directly over HTTP without writing to local disk.
        Caller owns closing the returned response object.
        """
        if not self.enabled:
            raise ValueError("Google Drive storage is disabled.")
        session = self._session_client()
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
        params = {"alt": "media", "supportsAllDrives": "true"}
        headers: dict[str, str] = {}
        if range_header:
            headers["Range"] = range_header
        retries = 2
        response = None
        for attempt in range(retries + 1):
            response = session.get(url, params=params, headers=headers, stream=True, timeout=120)
            if response.status_code < 400:
                return response
            if response.status_code not in {429, 500, 502, 503, 504} or attempt == retries:
                break
            response.close()
            time.sleep(0.35 * (attempt + 1))

        detail = response.text[:300] if response is not None and response.text else "Drive media request failed."
        status = response.status_code if response is not None else 500
        if response is not None:
            response.close()
        raise ValueError(f"Drive stream failed ({status}): {detail}")

    def _ensure_category_folder(self, workspace_id: str, category: str) -> str:
        workspace_key = f"workspace:{workspace_id}"
        if workspace_key not in self._folder_cache:
            self._folder_cache[workspace_key] = self._ensure_folder(workspace_id, self.root_folder_id)
        category_key = f"{workspace_key}:{category}"
        if category_key not in self._folder_cache:
            self._folder_cache[category_key] = self._ensure_folder(category, self._folder_cache[workspace_key])
        return self._folder_cache[category_key]

    def _ensure_folder(self, folder_name: str, parent_id: str | None) -> str:
        service = self._service_client()
        escaped = folder_name.replace("'", "\\'")
        query = f"mimeType='{DRIVE_FOLDER_MIME}' and name='{escaped}' and trashed=false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
        response = (
            service.files()
            .list(
                q=query,
                spaces="drive",
                fields="files(id,name)",
                pageSize=1,
                includeItemsFromAllDrives=True,
                supportsAllDrives=True,
            )
            .execute()
        )
        files = response.get("files", [])
        if files:
            return files[0]["id"]

        body: dict[str, Any] = {"name": folder_name, "mimeType": DRIVE_FOLDER_MIME}
        if parent_id:
            body["parents"] = [parent_id]
        created = (
            service.files()
            .create(
                body=body,
                fields="id",
                supportsAllDrives=True,
            )
            .execute()
        )
        return created["id"]

    def _service_client(self):
        if self._service is not None:
            return self._service

        if not self.root_folder_id:
            raise ValueError("Google Drive root folder id is not configured.")

        try:
            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build
        except ImportError as exc:
            raise ValueError(
                "Google Drive dependencies missing. Install `google-api-python-client google-auth google-auth-httplib2`."
            ) from exc

        scopes = ["https://www.googleapis.com/auth/drive"]
        if self.credentials_json:
            info = json.loads(self.credentials_json)
            creds = Credentials.from_service_account_info(info, scopes=scopes)
        elif self.credentials_path:
            creds = Credentials.from_service_account_file(self.credentials_path, scopes=scopes)
        else:
            raise ValueError("Set ORION_GOOGLE_DRIVE_CREDENTIALS_PATH or ORION_GOOGLE_DRIVE_CREDENTIALS_JSON.")

        self._service = build("drive", "v3", credentials=creds, cache_discovery=False)
        self._credentials = creds
        return self._service

    def _session_client(self):
        if self._authorized_session is not None:
            return self._authorized_session
        if self._credentials is None:
            self._service_client()
        from google.auth.transport.requests import AuthorizedSession

        self._authorized_session = AuthorizedSession(self._credentials)
        return self._authorized_session

    @staticmethod
    def _media_upload(stream: BytesIO, mime_type: str):
        from googleapiclient.http import MediaIoBaseUpload

        return MediaIoBaseUpload(stream, mimetype=mime_type, resumable=True)

    @staticmethod
    def _media_downloader(handle, request):
        from googleapiclient.http import MediaIoBaseDownload

        return MediaIoBaseDownload(handle, request)
