from __future__ import annotations

import argparse
import json
import shutil
import sys

from pathlib import Path


if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[3]))

from ikion.backend.runtime import create_runtime


def main() -> None:
    parser = argparse.ArgumentParser(description="Delete local upload/corpus files after Drive sync.")
    parser.add_argument("--force", action="store_true", help="Purge even when some assets are not mirrored to Drive.")
    args = parser.parse_args()

    runtime = create_runtime()
    rows = runtime.db.fetchall("SELECT id, metadata_json FROM assets ORDER BY created_at ASC")
    unsynced: list[str] = []
    synced_ids: list[str] = []
    for row in rows:
        metadata = json.loads(row["metadata_json"] or "{}")
        if metadata.get("drive_file_id"):
            synced_ids.append(row["id"])
        else:
            unsynced.append(row["id"])

    if unsynced and not args.force:
        raise SystemExit(
            "Abort: some assets are not mirrored to Drive. Run sync first or use --force.\n"
            f"Unsynced asset ids: {', '.join(unsynced[:20])}"
        )

    with runtime.db.transaction() as conn:
        for asset_id in synced_ids:
            conn.execute("UPDATE assets SET content_path = NULL WHERE id = ?", (asset_id,))

    shutil.rmtree(runtime.config.uploads_root, ignore_errors=True)
    runtime.config.uploads_root.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(runtime.config.corpora_root, ignore_errors=True)
    runtime.config.corpora_root.mkdir(parents=True, exist_ok=True)
    print(
        f"Purged local storage. mirrored_assets={len(synced_ids)} unsynced_assets={len(unsynced)} force={args.force}"
    )


if __name__ == "__main__":
    main()
