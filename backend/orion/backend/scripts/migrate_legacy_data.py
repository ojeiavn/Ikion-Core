from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path


if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[3]))

from orion.backend.runtime import create_runtime
from orion.backend.utils.ids import make_id
from orion.backend.utils.time import utc_now_iso


LEGACY_PATHS = [
    "backend/v5.py",
    "backend/extra.py",
    "backend/qb.py",
    "backend/other.py",
    "backend/aqir_report.py",
    "backend/content_index",
    "backend/faiss_index",
    "backend/faiss_exam_index",
    "backend/faiss_video_index",
    "backend/question_cache.json",
]


def import_legacy_query_log(runtime, workspace_id: str, log_path: Path) -> int:
    if not log_path.exists():
        return 0
    payload = json.loads(log_path.read_text(encoding="utf-8"))
    imported = 0
    for entry in payload:
        runtime.db.execute(
            """
            INSERT INTO query_events (
                id, workspace_id, user_id, query_text, response_text, response_status, cited_chunk_ids_json, cited_asset_ids_json,
                retrieval_json, playback_json, metrics_json, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                make_id("legacy_query"),
                workspace_id,
                entry.get("session_id"),
                entry.get("question", ""),
                entry.get("answer"),
                entry.get("status", "legacy"),
                json.dumps(entry.get("cited_chunk_ids", [])),
                json.dumps(entry.get("cited_asset_ids", [])),
                json.dumps(entry.get("retrieval", [])),
                json.dumps(entry.get("playback")) if entry.get("playback") else None,
                json.dumps({"legacy_metadata": entry.get("metadata", {})}),
                entry.get("timestamp", utc_now_iso()),
            ),
        )
        imported += 1
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(description="Inventory legacy Orion/NovaCS artifacts and optionally import old query logs.")
    parser.add_argument("--workspace-id", help="Target workspace for importing legacy query logs.")
    parser.add_argument("--log-path", default="backend/queries_log.json", help="Legacy query log JSON path.")
    args = parser.parse_args()

    runtime = create_runtime()
    inventory = {
        "generated_at": utc_now_iso(),
        "legacy_paths": [
            {"path": path, "exists": Path(path).exists(), "is_dir": Path(path).is_dir()}
            for path in LEGACY_PATHS
        ],
        "imported_query_events": 0,
    }

    if args.workspace_id:
        inventory["imported_query_events"] = import_legacy_query_log(runtime, args.workspace_id, Path(args.log_path))

    output_path = runtime.config.data_root / "legacy_inventory.json"
    output_path.write_text(json.dumps(inventory, indent=2), encoding="utf-8")
    print(json.dumps(inventory, indent=2))


if __name__ == "__main__":
    main()

