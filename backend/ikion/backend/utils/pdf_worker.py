from __future__ import annotations

import json
import subprocess
import sys

from pathlib import Path
from typing import Any

from .text import clean_text


PDF_WORKER_TIMEOUT_SECONDS = 45


def load_pdf_pages(path: str | Path, timeout_seconds: int = PDF_WORKER_TIMEOUT_SECONDS) -> list[dict[str, Any]]:
    pdf_path = Path(path).expanduser().resolve()
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "read_pdf_pages.py"
    try:
        completed = subprocess.run(
            [sys.executable, str(script_path), str(pdf_path)],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"PDF parser helper timed out after {timeout_seconds} seconds.") from exc

    if completed.returncode != 0:
        raise RuntimeError(_worker_failure_message(completed.returncode, completed.stderr))

    try:
        payload = json.loads(completed.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError("PDF parser helper returned invalid JSON output.") from exc

    if not isinstance(payload, list):
        raise RuntimeError("PDF parser helper returned an unexpected payload shape.")

    pages: list[dict[str, Any]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        page_number = item.get("page_number")
        text = str(item.get("text") or "")
        if not isinstance(page_number, int):
            continue
        pages.append(
            {
                "page_number": page_number,
                "text": text,
            }
        )
    return pages


def _worker_failure_message(returncode: int, stderr: str) -> str:
    details = clean_text(stderr or "")
    if returncode < 0:
        base = f"PDF parser helper crashed with signal {-returncode}."
    else:
        base = f"PDF parser helper exited with code {returncode}."
    if details:
        return f"{base} {details}"
    return base
