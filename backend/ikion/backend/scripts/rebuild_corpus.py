from __future__ import annotations

import argparse
import json
import sys

from pathlib import Path


if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[3]))

from ikion.backend.runtime import create_runtime


def main() -> None:
    parser = argparse.ArgumentParser(description="Rebuild the active corpus for a workspace.")
    parser.add_argument("workspace_id", help="Workspace identifier")
    args = parser.parse_args()

    runtime = create_runtime()
    corpus = runtime.corpus_builder.build_workspace_corpus(args.workspace_id)
    print(json.dumps(corpus.to_dict(), indent=2))


if __name__ == "__main__":
    main()

