from __future__ import annotations

import hashlib
import shutil

from pathlib import Path
from typing import Any

from ..config import IkionConfig
from .manifest import read_json, write_json


class FileStore:
    def __init__(self, config: IkionConfig):
        self.config = config
        self.config.uploads_root.mkdir(parents=True, exist_ok=True)
        self.config.corpora_root.mkdir(parents=True, exist_ok=True)

    def workspace_uploads_dir(self, workspace_id: str) -> Path:
        path = self.config.uploads_root / workspace_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def workspace_corpora_dir(self, workspace_id: str) -> Path:
        path = self.config.corpora_root / workspace_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def workspace_manifest_path(self, workspace_id: str) -> Path:
        return self.workspace_corpora_dir(workspace_id) / "manifest.json"

    def version_dir(self, workspace_id: str, version_id: str) -> Path:
        return self.workspace_corpora_dir(workspace_id) / version_id

    def create_version_structure(self, workspace_id: str, version_id: str) -> dict[str, Path]:
        version_dir = self.version_dir(workspace_id, version_id)
        assets_dir = version_dir / "assets"
        faiss_dir = version_dir / "faiss"
        assets_dir.mkdir(parents=True, exist_ok=True)
        faiss_dir.mkdir(parents=True, exist_ok=True)
        return {
            "version_dir": version_dir,
            "assets_dir": assets_dir,
            "faiss_dir": faiss_dir,
            "chunks_path": version_dir / "chunks.jsonl",
            "manifest_path": version_dir / "manifest.json",
            "faiss_index_path": faiss_dir / "index.faiss",
            "graph_path": version_dir / "graph.json",
        }

    def store_uploaded_file(self, workspace_id: str, asset_id: str, source_path: str | Path) -> Path:
        source = Path(source_path).expanduser().resolve()
        destination = self.workspace_uploads_dir(workspace_id) / f"{asset_id}_{source.name}"
        shutil.copy2(source, destination)
        return destination

    def store_uploaded_bytes(self, workspace_id: str, asset_id: str, filename: str, content: bytes) -> Path:
        destination = self.workspace_uploads_dir(workspace_id) / f"{asset_id}_{filename}"
        destination.write_bytes(content)
        return destination

    def store_inline_text(self, workspace_id: str, asset_id: str, filename: str, content: str) -> Path:
        destination = self.workspace_uploads_dir(workspace_id) / f"{asset_id}_{filename}"
        destination.write_text(content, encoding="utf-8")
        return destination

    def store_json_asset(self, workspace_id: str, asset_id: str, filename: str, payload: dict[str, Any]) -> Path:
        destination = self.workspace_uploads_dir(workspace_id) / f"{asset_id}_{filename}"
        write_json(destination, payload)
        return destination

    def write_workspace_manifest(self, workspace_id: str, payload: dict[str, Any]) -> None:
        write_json(self.workspace_manifest_path(workspace_id), payload)

    def read_workspace_manifest(self, workspace_id: str) -> dict[str, Any]:
        return read_json(self.workspace_manifest_path(workspace_id), default={"versions": []})

    def snapshot_asset_descriptor(self, assets_dir: Path, asset_id: str, payload: dict[str, Any]) -> None:
        write_json(assets_dir / f"{asset_id}.json", payload)

    def sha256_for_path(self, path: str | Path) -> str:
        hasher = hashlib.sha256()
        with Path(path).open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()
