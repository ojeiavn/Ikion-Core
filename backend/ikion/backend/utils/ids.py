from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def make_version_id(prefix: str = "corpusv") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}_{stamp}_{uuid4().hex[:8]}"

