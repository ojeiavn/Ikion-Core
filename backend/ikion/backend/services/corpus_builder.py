from __future__ import annotations

import json
import os
import shutil
import tempfile

from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from ..config import IkionConfig
from ..db import Database
from ..models import Asset, Chunk, CorpusVersion
from ..parsers.notice_parser import parse_notice
from ..parsers.pdf_parser import parse_pdf
from ..parsers.transcript_parser import parse_transcript
from ..storage.faiss_store import FaissStore
from ..storage.drive_client import GoogleDriveClient
from ..storage.file_store import FileStore
from ..storage.manifest import read_json, read_jsonl, write_json, write_jsonl
from ..utils.ids import make_version_id
from ..utils.text import generate_question_bank, salient_phrases, salient_terms
from ..utils.time import utc_now_iso
from .chunking import ChunkingService
from .embeddings import EmbeddingProvider
from .ingestion import AssetIngestionService
from .knowledge_graph import KnowledgeGraphService


class CorpusBuilderService:
    def __init__(
        self,
        config: IkionConfig,
        db: Database,
        file_store: FileStore,
        ingestion: AssetIngestionService,
        embeddings: EmbeddingProvider,
        chunking: ChunkingService,
        drive_client: GoogleDriveClient | None = None,
    ):
        self.config = config
        self.db = db
        self.file_store = file_store
        self.ingestion = ingestion
        self.embeddings = embeddings
        self.chunking = chunking
        self.graph = KnowledgeGraphService()
        self.drive_client = drive_client

    def build_workspace_corpus(self, workspace_id: str) -> CorpusVersion:
        if self.config.google_drive_only and not (self.drive_client and self.drive_client.enabled):
            raise ValueError("Drive-only mode requires Google Drive to be enabled and configured.")
        assets = self.ingestion.list_assets(workspace_id)
        chunkable_assets = [asset for asset in assets if asset.asset_type in {"pdf", "transcript", "notice"}]
        if not chunkable_assets:
            raise ValueError("No chunkable assets are registered for this workspace.")

        version_id = make_version_id()
        paths = self.file_store.create_version_structure(workspace_id, version_id)
        now = utc_now_iso()

        self.db.execute(
            """
            INSERT INTO corpus_versions (
                id, workspace_id, status, storage_path, manifest_path, build_metadata_json, asset_ids_json, chunk_count, created_at, activated_at, is_active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                version_id,
                workspace_id,
                "building",
                str(paths["version_dir"]),
                str(paths["manifest_path"]),
                json.dumps({}),
                json.dumps([asset.id for asset in assets]),
                0,
                now,
                None,
                0,
            ),
        )

        previous_manifest = self.file_store.read_workspace_manifest(workspace_id)

        try:
            chunks = self._build_chunks(workspace_id, version_id, assets, paths["assets_dir"])
            vectors = self.embeddings.embed_texts([chunk.text for chunk in chunks])
            FaissStore.build(paths["faiss_index_path"], vectors)
            write_jsonl(paths["chunks_path"], [chunk.to_dict() for chunk in chunks])
            exam_questions = self._load_exam_questions_for_graph(workspace_id)
            graph = self.graph.build_graph(chunks, exam_questions=exam_questions)
            write_json(paths["graph_path"], graph)

            asset_type_counts = Counter(asset.asset_type for asset in assets)
            build_metadata = {
                "asset_count": len(assets),
                "chunkable_asset_count": len(chunkable_assets),
                "chunk_count": len(chunks),
                "embedding_provider": type(self.embeddings).__name__,
                "exam_question_count": len(exam_questions),
                "source_type_counts": dict(asset_type_counts),
                "built_at": utc_now_iso(),
            }
            version_manifest = {
                "workspace_id": workspace_id,
                "corpus_version_id": version_id,
                "status": "ready",
                "storage": {
                    "chunks_path": str(paths["chunks_path"]),
                    "faiss_index_path": str(paths["faiss_index_path"]),
                    "assets_dir": str(paths["assets_dir"]),
                    "graph_path": str(paths["graph_path"]),
                },
                "asset_ids": [asset.id for asset in assets],
                "chunk_count": len(chunks),
                "build_metadata": build_metadata,
            }

            # Persist manifest before any Drive sync step so the file exists
            # when upload_file(...) reads it.
            write_json(paths["manifest_path"], version_manifest)

            if self.drive_client and self.drive_client.enabled:
                drive_storage = self._sync_corpus_artifacts_to_drive(workspace_id, version_id, paths)
                version_manifest["storage"]["drive"] = drive_storage
                version_manifest["build_metadata"]["drive"] = drive_storage

            write_json(paths["manifest_path"], version_manifest)
            self._activate_corpus_version(workspace_id, version_id, version_manifest, len(chunks), str(paths["manifest_path"]))

            if self.config.google_drive_only:
                shutil.rmtree(paths["version_dir"], ignore_errors=True)

            return self.get_active_corpus(workspace_id)
        except Exception as exc:
            failure_manifest = {
                "workspace_id": workspace_id,
                "corpus_version_id": version_id,
                "status": "failed",
                "error": str(exc),
            }
            write_json(paths["manifest_path"], failure_manifest)
            self.db.execute(
                "UPDATE corpus_versions SET status = ?, build_metadata_json = ? WHERE id = ?",
                ("failed", json.dumps({"error": str(exc)}), version_id),
            )
            self.file_store.write_workspace_manifest(workspace_id, previous_manifest)
            raise

    def get_active_corpus(self, workspace_id: str) -> CorpusVersion:
        row = self.db.fetchone(
            """
            SELECT * FROM corpus_versions
            WHERE workspace_id = ? AND is_active = 1
            ORDER BY activated_at DESC
            LIMIT 1
            """,
            (workspace_id,),
        )
        if not row:
            raise ValueError(f"Workspace '{workspace_id}' has no active corpus.")
        return CorpusVersion(
            id=row["id"],
            workspace_id=row["workspace_id"],
            status=row["status"],
            storage_path=row["storage_path"],
            manifest_path=row["manifest_path"],
            build_metadata=json.loads(row["build_metadata_json"]),
            asset_ids=json.loads(row["asset_ids_json"]),
            chunk_count=row["chunk_count"],
            created_at=row["created_at"],
            activated_at=row["activated_at"],
            is_active=bool(row["is_active"]),
        )

    def inspect_active_corpus(self, workspace_id: str) -> dict:
        corpus = self.get_active_corpus(workspace_id)
        manifest_path = Path(corpus.manifest_path)
        manifest = read_json(manifest_path, default=None) if manifest_path.exists() else None
        return {
            "database_record": corpus.to_dict(),
            "workspace_manifest": self.file_store.read_workspace_manifest(workspace_id),
            "version_manifest": manifest,
        }

    def load_corpus_payload(self, corpus: CorpusVersion) -> dict:
        manifest_path = Path(corpus.manifest_path)
        if manifest_path.exists():
            manifest = read_json(manifest_path)
            chunks = [Chunk.from_dict(row) for row in read_jsonl(Path(manifest["storage"]["chunks_path"]))]
            index = FaissStore.load(Path(manifest["storage"]["faiss_index_path"]))
            graph_path = manifest.get("storage", {}).get("graph_path")
            graph = read_json(Path(graph_path), default={}) if graph_path else {}
            return {"manifest": manifest, "chunks": chunks, "index": index, "graph": graph}

        drive = (corpus.build_metadata or {}).get("drive") or {}
        if not (self.drive_client and self.drive_client.enabled and drive):
            raise ValueError("Active corpus artifacts are missing locally and no Drive copy is available.")

        manifest_file_id = self._drive_file_id(drive, "manifest")
        chunks_file_id = self._drive_file_id(drive, "chunks")
        faiss_file_id = self._drive_file_id(drive, "faiss_index")

        manifest_bytes = self.drive_client.download_bytes(file_id=manifest_file_id)
        manifest = json.loads(manifest_bytes.decode("utf-8"))
        chunks_bytes = self.drive_client.download_bytes(file_id=chunks_file_id)
        lines = [line for line in chunks_bytes.decode("utf-8").splitlines() if line.strip()]
        chunks = [Chunk.from_dict(json.loads(line)) for line in lines]
        faiss_bytes = self.drive_client.download_bytes(file_id=faiss_file_id)
        index = FaissStore.load_from_bytes(faiss_bytes)
        graph = {}
        graph_file_id = self._drive_file_id(drive, "graph", required=False)
        if graph_file_id:
            graph_bytes = self.drive_client.download_bytes(file_id=graph_file_id)
            graph = json.loads(graph_bytes.decode("utf-8"))
        return {"manifest": manifest, "chunks": chunks, "index": index, "graph": graph}

    @staticmethod
    def _drive_file_id(drive_payload: dict, key: str, required: bool = True) -> str | None:
        node = drive_payload.get(key) or {}
        if not isinstance(node, dict):
            if required:
                raise ValueError(f"Active corpus Drive metadata is invalid for '{key}'. Rebuild the corpus.")
            return None
        file_id = node.get("file_id") or node.get("drive_file_id") or node.get("id")
        if file_id:
            return str(file_id)
        if required:
            raise ValueError(f"Active corpus is missing Drive file id for '{key}'. Rebuild the corpus.")
        return None

    def _build_chunks(self, workspace_id: str, version_id: str, assets: list[Asset], assets_dir: Path) -> list[Chunk]:
        chunks: list[Chunk] = []

        def process_asset(target: Asset) -> tuple[Asset, list[Chunk], list, str | None]:
            try:
                parsed_sections = self._parse_asset(target)
                if not parsed_sections:
                    return target, [], parsed_sections, None
                asset_chunks = self.chunking.chunk_asset(workspace_id, version_id, target, parsed_sections)
                for chunk in asset_chunks:
                    metadata = dict(chunk.metadata)
                    metadata["question_bank"] = generate_question_bank(chunk.text, target.title, target.asset_type)
                    metadata["salient_terms"] = salient_terms(chunk.text, top_k=6)
                    metadata["salient_phrases"] = salient_phrases(chunk.text, top_k=4)
                    chunk.metadata = metadata
                return target, asset_chunks, parsed_sections, None
            except Exception as exc:
                return target, [], [], str(exc)

        max_workers = min(4, max(len(assets), 1))
        parse_failures: list[dict[str, str]] = []
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(process_asset, asset): asset for asset in assets}
            for future in as_completed(futures):
                asset, asset_chunks, parsed_sections, parse_error = future.result()
                self.file_store.snapshot_asset_descriptor(
                    assets_dir,
                    asset.id,
                    {
                        "asset": asset.to_dict(),
                        "parsed_section_count": len(parsed_sections),
                        "preview": parsed_sections[0].text[:240] if parsed_sections else None,
                        "parse_error": parse_error,
                    },
                )
                if parse_error:
                    parse_failures.append({"asset_id": asset.id, "title": asset.title, "error": parse_error})
                chunks.extend(asset_chunks)
        if not chunks:
            if parse_failures:
                detail = "; ".join(f"{item['asset_id']} ({item['title']}): {item['error']}" for item in parse_failures[:3])
                raise ValueError(f"Corpus build produced no retrieval chunks. Parse failures: {detail}")
            raise ValueError("Corpus build produced no retrieval chunks.")
        return chunks

    def _load_exam_questions_for_graph(self, workspace_id: str) -> list[dict]:
        rows = self.db.fetchall(
            """
            SELECT
                q.id,
                q.question_number,
                q.question_text,
                q.topic_label,
                q.marks,
                q.origin_type,
                a.title AS source_asset_title
            FROM exam_questions q
            LEFT JOIN assets a ON a.id = q.source_asset_id
            WHERE q.workspace_id = ?
            ORDER BY q.updated_at DESC, q.created_at DESC
            LIMIT 300
            """,
            (workspace_id,),
        )
        return [
            {
                "id": row["id"],
                "question_number": row["question_number"],
                "question_text": row["question_text"],
                "topic_label": row["topic_label"],
                "marks": row["marks"],
                "origin_type": row["origin_type"],
                "source_asset_title": row["source_asset_title"],
            }
            for row in rows
        ]

    def _parse_asset(self, asset: Asset):
        content_path = asset.content_path or asset.source_path
        if not content_path:
            maybe_bytes = self.ingestion.get_drive_bytes(asset.id)
            if not maybe_bytes:
                return []
            suffix = {
                "pdf": ".pdf",
                "transcript": ".json",
                "notice": ".txt",
            }.get(asset.asset_type, ".bin")
            with tempfile.NamedTemporaryFile(prefix=f"{asset.id}_", suffix=suffix, delete=False) as handle:
                handle.write(maybe_bytes)
                content_path = handle.name
            try:
                return self._parse_asset_from_path(asset, content_path)
            finally:
                try:
                    os.remove(content_path)
                except Exception:
                    pass
        return self._parse_asset_from_path(asset, content_path)

    def _parse_asset_from_path(self, asset: Asset, content_path: str):
        if asset.asset_type == "pdf":
            return parse_pdf(
                content_path,
                max_chunk_chars=self.config.max_chunk_chars,
                chunk_overlap_chars=self.config.chunk_overlap_chars,
                use_semantic_chunking=self.config.semantic_chunking_enabled,
                openai_api_key=self.config.openai_api_key,
                embedding_model=self.config.openai_embedding_model,
            )
        if asset.asset_type == "notice":
            return parse_notice(content_path)
        if asset.asset_type == "transcript":
            linked_video_asset_id = asset.metadata.get("linked_video_asset_id")
            return parse_transcript(content_path, linked_video_asset_id=linked_video_asset_id)
        return []

    def _sync_corpus_artifacts_to_drive(self, workspace_id: str, version_id: str, paths: dict[str, Path]) -> dict:
        if not self.drive_client or not self.drive_client.enabled:
            return {}

        category = f"corpus_{version_id}"
        manifest_upload = self.drive_client.upload_file(
            local_path=paths["manifest_path"],
            workspace_id=workspace_id,
            category=category,
            remote_name=f"{version_id}_manifest.json",
            mime_type="application/json",
        )
        chunks_upload = self.drive_client.upload_file(
            local_path=paths["chunks_path"],
            workspace_id=workspace_id,
            category=category,
            remote_name=f"{version_id}_chunks.jsonl",
            mime_type="application/json",
        )
        faiss_upload = self.drive_client.upload_file(
            local_path=paths["faiss_index_path"],
            workspace_id=workspace_id,
            category=category,
            remote_name=f"{version_id}_index.faiss",
            mime_type="application/octet-stream",
        )
        graph_upload = self.drive_client.upload_file(
            local_path=paths["graph_path"],
            workspace_id=workspace_id,
            category=category,
            remote_name=f"{version_id}_graph.json",
            mime_type="application/json",
        )
        return {
            "manifest": manifest_upload.to_metadata() if manifest_upload else {},
            "chunks": chunks_upload.to_metadata() if chunks_upload else {},
            "faiss_index": faiss_upload.to_metadata() if faiss_upload else {},
            "graph": graph_upload.to_metadata() if graph_upload else {},
        }

    def _activate_corpus_version(
        self,
        workspace_id: str,
        version_id: str,
        manifest: dict,
        chunk_count: int,
        manifest_path: str,
    ) -> None:
        activated_at = utc_now_iso()
        with self.db.transaction() as conn:
            conn.execute("UPDATE corpus_versions SET is_active = 0 WHERE workspace_id = ?", (workspace_id,))
            conn.execute(
                """
                UPDATE corpus_versions
                SET status = ?, build_metadata_json = ?, chunk_count = ?, activated_at = ?, is_active = 1
                WHERE id = ?
                """,
                ("ready", json.dumps(manifest["build_metadata"]), chunk_count, activated_at, version_id),
            )
        workspace_manifest = self.file_store.read_workspace_manifest(workspace_id)
        versions = workspace_manifest.get("versions", [])
        versions = [version for version in versions if version.get("id") != version_id]
        versions.append(
            {
                "id": version_id,
                "status": "ready",
                "activated_at": activated_at,
                "manifest_path": manifest_path,
            }
        )
        self.file_store.write_workspace_manifest(
            workspace_id,
            {
                "workspace_id": workspace_id,
                "active_corpus_version_id": version_id,
                "updated_at": activated_at,
                "versions": versions,
            },
        )
