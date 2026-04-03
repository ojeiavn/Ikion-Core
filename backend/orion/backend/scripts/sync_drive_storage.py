from __future__ import annotations

import argparse
import sys

from pathlib import Path


if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[3]))

from orion.backend.runtime import create_runtime


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync existing workspace assets/guidance to Google Drive.")
    parser.add_argument("workspace_id", help="Workspace id to sync")
    parser.add_argument("--all", action="store_true", help="Upload all records, not only missing drive copies.")
    args = parser.parse_args()

    runtime = create_runtime()
    if not runtime.ingestion.drive_client or not runtime.ingestion.drive_client.enabled:
        raise SystemExit("Google Drive is disabled. Set ORION_GOOGLE_DRIVE_ENABLED=true first.")

    missing_only = not args.all
    assets_synced = runtime.ingestion.sync_workspace_assets_to_drive(args.workspace_id, missing_only=missing_only)
    guidance_synced = runtime.guidance.sync_workspace_guidance_to_drive(args.workspace_id, missing_only=missing_only)
    print(
        f"Synced workspace {args.workspace_id}: assets={assets_synced}, guidance={guidance_synced}, missing_only={missing_only}"
    )


if __name__ == "__main__":
    main()
