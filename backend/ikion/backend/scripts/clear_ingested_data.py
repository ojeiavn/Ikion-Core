from __future__ import annotations

import shutil
import sys
from pathlib import Path


if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[3]))

from ikion.backend.runtime import create_runtime


def _safe_remove(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def main() -> None:
    runtime = create_runtime()
    config = runtime.config
    db = runtime.db

    for directory in (config.uploads_root, config.corpora_root):
        _safe_remove(directory)

    tables = [
        "assets",
        "corpus_versions",
        "query_events",
        "insights_snapshots",
    ]
    with db.transaction() as conn:
        for table in tables:
            conn.execute(f"DELETE FROM {table}")

    print("Cleared ingested documents, corpora, and related metadata.")


if __name__ == "__main__":
    main()
