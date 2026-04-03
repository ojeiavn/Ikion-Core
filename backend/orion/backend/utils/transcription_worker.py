from __future__ import annotations

import json
import subprocess
import sys

from pathlib import Path

from .text import clean_text


TRANSCRIPTION_WORKER_TIMEOUT_SECONDS = 60 * 20


def transcribe_segments_with_worker(
    *,
    media_path: Path,
    api_key: str,
    model: str,
    prompt: str,
    timeout_seconds: int = TRANSCRIPTION_WORKER_TIMEOUT_SECONDS,
) -> list[dict[str, object]]:
    script_path = Path(__file__).resolve().parents[1] / "scripts" / "transcribe_video_segments.py"
    payload = {
        "media_path": str(media_path),
        "api_key": api_key,
        "model": model,
        "prompt": prompt,
    }
    try:
        completed = subprocess.run(
            [sys.executable, str(script_path)],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Transcript worker timed out after {timeout_seconds} seconds.") from exc

    if completed.returncode != 0:
        raise RuntimeError(_worker_failure_message(completed.returncode, completed.stderr))

    try:
        response_payload = json.loads(completed.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError("Transcript worker returned invalid JSON output.") from exc

    if not isinstance(response_payload, list):
        raise RuntimeError("Transcript worker returned an unexpected payload shape.")

    segments: list[dict[str, object]] = []
    for item in response_payload:
        if not isinstance(item, dict):
            continue
        segments.append(
            {
                "start": item.get("start"),
                "end": item.get("end"),
                "text": str(item.get("text") or ""),
            }
        )
    return segments


def _worker_failure_message(returncode: int, stderr: str) -> str:
    details = clean_text(stderr or "")
    if returncode < 0:
        base = f"Transcript worker crashed with signal {-returncode}."
    else:
        base = f"Transcript worker exited with code {returncode}."
    if details:
        return f"{base} {details}"
    return base
