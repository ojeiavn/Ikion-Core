from __future__ import annotations

import os
import tomllib

from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = REPO_ROOT / "backend"
DATA_ROOT = BACKEND_ROOT / "data"


def _load_legacy_secret_value() -> str | None:
    for candidate in (
        BACKEND_ROOT / "secrets.toml",
        BACKEND_ROOT / "orion" / "backend" / "secrets.toml",
    ):
        if not candidate.exists():
            continue
        try:
            payload = tomllib.loads(candidate.read_text(encoding="utf-8"))
        except Exception:
            continue
        api_keys = payload.get("api_keys", {})
        if "OPENAI_API_KEY" in api_keys:
            return api_keys["OPENAI_API_KEY"]
    return None


@dataclass(slots=True)
class OrionConfig:
    repo_root: Path = REPO_ROOT
    backend_root: Path = BACKEND_ROOT
    data_root: Path = DATA_ROOT
    uploads_root: Path = DATA_ROOT / "uploads"
    corpora_root: Path = DATA_ROOT / "corpora"
    database_path: Path = DATA_ROOT / "orion.db"
    embedding_provider: str = "local"
    embedding_dimension: int = 1536
    openai_api_key: str | None = None
    openai_embedding_model: str = "text-embedding-3-small"
    openai_chat_model: str = "gpt-5.4-mini"
    openai_thinking_model: str = "gpt-5.4-mini"
    openai_transcription_model: str = "whisper-1"
    max_chunk_chars: int = 1200
    chunk_overlap_chars: int = 180
    retrieval_candidate_k: int = 16
    answer_min_support: float = 0.18
    answer_provider: str = "openai"
    answer_mode_default: str = "standard"
    semantic_chunking_enabled: bool = False
    frontend_origins: tuple[str, ...] = ("http://127.0.0.1:3000", "http://localhost:3000")
    session_cookie_name: str = "orion_session"
    session_ttl_seconds: int = 60 * 60 * 24 * 7
    session_secure_cookie: bool = False
    allow_dev_auth_reset: bool = True
    google_drive_enabled: bool = False
    google_drive_root_folder_id: str | None = None
    google_drive_credentials_path: str | None = None
    google_drive_credentials_json: str | None = None
    google_drive_shared_drive_id: str | None = None
    google_drive_only: bool = False
    auto_generate_video_transcripts: bool = True
    auto_rebuild_corpus_on_transcript: bool = True


def load_config() -> OrionConfig:
    load_dotenv()
    load_dotenv(BACKEND_ROOT / ".env", override=False)

    data_root = Path(os.getenv("ORION_DATA_DIR", DATA_ROOT)).expanduser().resolve()

    config = OrionConfig(
        data_root=data_root,
        uploads_root=data_root / "uploads",
        corpora_root=data_root / "corpora",
        database_path=Path(os.getenv("ORION_DB_PATH", data_root / "orion.db")).expanduser().resolve(),

        embedding_provider=os.getenv("ORION_EMBEDDING_PROVIDER", "openai").strip().lower() or "openai",
        embedding_dimension=int(os.getenv("ORION_EMBEDDING_DIMENSION", "1536")),

        openai_api_key=os.getenv("ORION_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") or _load_legacy_secret_value(),
        openai_embedding_model=os.getenv("ORION_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),

        openai_chat_model=os.getenv("ORION_OPENAI_CHAT_MODEL", "gpt-5.4-mini"),
        openai_thinking_model=os.getenv("ORION_OPENAI_THINKING_MODEL", "gpt-5.4-mini"),
        openai_transcription_model=os.getenv("ORION_OPENAI_TRANSCRIPTION_MODEL", "whisper-1"),

        max_chunk_chars=int(os.getenv("ORION_MAX_CHUNK_CHARS", "1000")),
        chunk_overlap_chars=int(os.getenv("ORION_CHUNK_OVERLAP_CHARS", "120")),

        retrieval_candidate_k=int(os.getenv("ORION_RETRIEVAL_CANDIDATE_K", "24")),
        answer_min_support=float(os.getenv("ORION_ANSWER_MIN_SUPPORT", "0.22")),

        answer_provider=os.getenv("ORION_ANSWER_PROVIDER", "openai").strip().lower() or "openai",
        answer_mode_default=os.getenv("ORION_ANSWER_MODE_DEFAULT", "standard").strip().lower() or "standard",

        semantic_chunking_enabled=os.getenv("ORION_SEMANTIC_CHUNKING", "true").strip().lower() in {"1", "true", "yes"},

        frontend_origins=tuple(
            origin.strip()
            for origin in os.getenv(
                "ORION_FRONTEND_ORIGINS",
                "http://127.0.0.1:3000,http://localhost:3000"
            ).split(",")
            if origin.strip()
        ),

        session_cookie_name=os.getenv("ORION_SESSION_COOKIE_NAME", "orion_session").strip() or "orion_session",
        session_ttl_seconds=int(os.getenv("ORION_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 7))),
        session_secure_cookie=os.getenv("ORION_SESSION_SECURE_COOKIE", "true").strip().lower() in {"1", "true", "yes"},
        allow_dev_auth_reset=os.getenv("ORION_ALLOW_DEV_AUTH_RESET", "false").strip().lower() in {"1", "true", "yes"},
        google_drive_enabled=os.getenv("ORION_GOOGLE_DRIVE_ENABLED", "false").strip().lower() in {"1", "true", "yes"},
        google_drive_root_folder_id=os.getenv("ORION_GOOGLE_DRIVE_ROOT_FOLDER_ID"),
        google_drive_credentials_path=os.getenv("ORION_GOOGLE_DRIVE_CREDENTIALS_PATH"),
        google_drive_credentials_json=os.getenv("ORION_GOOGLE_DRIVE_CREDENTIALS_JSON"),
        google_drive_shared_drive_id=os.getenv("ORION_GOOGLE_DRIVE_SHARED_DRIVE_ID"),
        google_drive_only=os.getenv("ORION_GOOGLE_DRIVE_ONLY", "false").strip().lower() in {"1", "true", "yes"},
        auto_generate_video_transcripts=os.getenv("ORION_AUTO_GENERATE_VIDEO_TRANSCRIPTS", "true").strip().lower() in {"1", "true", "yes"},
        auto_rebuild_corpus_on_transcript=os.getenv("ORION_AUTO_REBUILD_CORPUS_ON_TRANSCRIPT", "true").strip().lower() in {"1", "true", "yes"},
    )
    config.uploads_root.mkdir(parents=True, exist_ok=True)
    config.corpora_root.mkdir(parents=True, exist_ok=True)
    config.database_path.parent.mkdir(parents=True, exist_ok=True)
    return config
