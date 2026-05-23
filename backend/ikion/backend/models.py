from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class Workspace:
    id: str
    slug: str
    name: str
    description: str | None
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class WorkspaceMembership:
    id: str
    workspace_id: str
    user_id: str
    role: str
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class User:
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: str
    updated_at: str
    last_login_at: str | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class SessionRecord:
    id: str
    user_id: str
    user_agent: str | None
    ip_address: str | None
    created_at: str
    last_seen_at: str
    expires_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Conversation:
    id: str
    workspace_id: str
    user_id: str | None
    title: str
    created_at: str
    updated_at: str
    message_count: int = 0
    last_message_preview: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ConversationMessage:
    id: str
    conversation_id: str
    workspace_id: str
    user_id: str | None
    role: str
    content: str
    status: str | None
    citations: list[dict[str, Any]]
    playback: dict[str, Any] | None
    metadata: dict[str, Any]
    created_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class Asset:
    id: str
    workspace_id: str
    asset_type: str
    title: str
    status: str
    source_path: str | None
    content_path: str | None
    mime_type: str | None
    external_ref: str | None
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class CorpusVersion:
    id: str
    workspace_id: str
    status: str
    storage_path: str
    manifest_path: str
    build_metadata: dict[str, Any]
    asset_ids: list[str]
    chunk_count: int
    created_at: str
    activated_at: str | None
    is_active: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class GuidancePack:
    id: str
    workspace_id: str
    name: str
    instructions: str
    metadata: dict[str, Any]
    is_active: bool
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ExamQuestion:
    id: str
    workspace_id: str
    source_asset_id: str | None
    mark_scheme_asset_id: str | None
    question_number: str | None
    question_text: str
    normalized_question: str
    topic_label: str | None
    difficulty: float
    marks: int | None
    origin_type: str
    source_question_id: str | None
    guidance: str | None
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ExamAttempt:
    id: str
    workspace_id: str
    user_id: str
    exam_question_id: str | None
    prompt_text: str
    student_answer: str
    evaluation_text: str
    score: float
    rubric: dict[str, Any]
    strengths: list[str]
    improvements: list[str]
    focus_topics: list[str]
    metadata: dict[str, Any]
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class ParsedSection:
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class Chunk:
    id: str
    workspace_id: str
    corpus_version_id: str
    asset_id: str
    asset_title: str
    asset_type: str
    text: str
    metadata: dict[str, Any]
    position: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "Chunk":
        return cls(**payload)


@dataclass(slots=True)
class RetrievalHit:
    chunk: Chunk
    semantic_score: float
    lexical_score: float
    final_score: float

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["chunk"] = self.chunk.to_dict()
        return data


@dataclass(slots=True)
class Citation:
    index: int
    chunk_id: str
    asset_id: str
    asset_title: str
    asset_type: str
    locator: str | None
    quote: str
    score: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class PlaybackSegment:
    video_asset_id: str
    timestamp_start: float
    timestamp_end: float | None
    transcript_excerpt: str
    snippet: str
    source_chunk_id: str
    video_title: str | None = None
    video_source_path: str | None = None
    video_external_ref: str | None = None
    video_stream_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class QueryResponse:
    workspace_id: str
    query: str
    conversation_id: str | None
    answer_mode: str
    complexity_score: float
    status: str
    answer: str
    citations: list[Citation]
    cited_chunk_ids: list[str]
    cited_asset_ids: list[str]
    support_score: float
    guidance_applied: list[str]
    retrieval_hits: list[RetrievalHit]
    playback: PlaybackSegment | None
    playback_segments: list[PlaybackSegment]
    latency_ms: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "workspace_id": self.workspace_id,
            "query": self.query,
            "conversation_id": self.conversation_id,
            "answer_mode": self.answer_mode,
            "complexity_score": self.complexity_score,
            "status": self.status,
            "answer": self.answer,
            "citations": [citation.to_dict() for citation in self.citations],
            "cited_chunk_ids": self.cited_chunk_ids,
            "cited_asset_ids": self.cited_asset_ids,
            "support_score": self.support_score,
            "guidance_applied": self.guidance_applied,
            "retrieval_hits": [hit.to_dict() for hit in self.retrieval_hits],
            "playback": self.playback.to_dict() if self.playback else None,
            "playback_segments": [segment.to_dict() for segment in self.playback_segments],
            "latency_ms": self.latency_ms,
        }
