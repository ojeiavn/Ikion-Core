from __future__ import annotations

import json
import os
import sys

from pathlib import Path


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        print("Invalid JSON payload for transcription worker.", file=sys.stderr)
        return 2

    media_path = Path(str(payload.get("media_path") or "")).expanduser().resolve()
    model = str(payload.get("model") or "whisper-1")
    prompt = str(payload.get("prompt") or "")
    api_key = str(payload.get("api_key") or "")

    if not media_path.exists():
        print(f"Video file does not exist: {media_path}", file=sys.stderr)
        return 2
    if not api_key:
        print("Missing API key for transcription worker.", file=sys.stderr)
        return 2

    os.environ["OPENAI_API_KEY"] = api_key

    try:
        from openai import OpenAI
    except Exception as exc:
        print(f"OpenAI package import failed: {exc}", file=sys.stderr)
        return 2

    try:
        client = OpenAI(api_key=api_key)
        request_kwargs = {
            "model": model,
            "response_format": "verbose_json",
            "timestamp_granularities": ["segment"],
            "temperature": 0,
            "prompt": prompt,
        }
        with media_path.open("rb") as handle:
            try:
                response = client.audio.transcriptions.create(
                    file=handle,
                    chunking_strategy="auto",
                    **request_kwargs,
                )
            except Exception as exc:
                message = str(exc).lower()
                if "chunking_strategy" in message and ("not supported" in message or "unsupported_value" in message):
                    handle.seek(0)
                    response = client.audio.transcriptions.create(
                        file=handle,
                        **request_kwargs,
                    )
                else:
                    raise
    except Exception as exc:
        print(f"Transcription request failed: {exc}", file=sys.stderr)
        return 1

    segments = getattr(response, "segments", None) or []
    payload_segments = [
        {
            "start": getattr(segment, "start", None),
            "end": getattr(segment, "end", None),
            "text": getattr(segment, "text", ""),
        }
        for segment in segments
    ]
    json.dump(payload_segments, sys.stdout, ensure_ascii=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
