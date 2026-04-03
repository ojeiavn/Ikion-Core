from __future__ import annotations

from functools import lru_cache
import re
from typing import Any, Literal
from urllib.parse import parse_qs, urlparse

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from io import BytesIO
from pathlib import Path

from .models import RetrievalHit
from .runtime import OrionCoreRuntime, create_runtime
from .services.auth import ALLOWED_ROLES, AuthSession


class BootstrapRequest(BaseModel):
    full_name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserCreateRequest(BaseModel):
    full_name: str
    email: str
    password: str
    role: Literal["student", "lecturer", "admin"] = "student"


class WorkspaceCreateRequest(BaseModel):
    name: str
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkspaceMemberRequest(BaseModel):
    user_id: str
    role: Literal["student", "lecturer", "admin"] = "student"


class FileAssetRequest(BaseModel):
    asset_type: Literal["pdf", "notice"]
    title: str
    file_path: str | None = None
    filename: str | None = None
    content_base64: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    mime_type: str | None = None


class TextAssetRequest(BaseModel):
    asset_type: Literal["notice"]
    title: str
    text: str
    filename: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TranscriptSegmentsRequest(BaseModel):
    title: str
    segments: list[dict[str, Any]]
    linked_video_asset_id: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class VideoAssetRequest(BaseModel):
    title: str
    file_path: str | None = None
    filename: str | None = None
    content_base64: str | None = None
    external_ref: str | None = None
    mime_type: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GuidanceRequest(BaseModel):
    name: str
    instructions: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    activate: bool = True


class RetrievalRequest(BaseModel):
    query: str
    top_k: int = 6
    source_types: list[str] | None = None
    source_weights: dict[str, float] | None = None


class AskRequest(RetrievalRequest):
    user_id: str | None = None
    conversation_id: str | None = None
    answer_mode: Literal["standard", "thinking"] | None = "standard"


class ExamRecommendationRequest(BaseModel):
    prefer_inspired: bool = False
    requested_topics: list[str] = Field(default_factory=list)


class ExamEvaluationRequest(BaseModel):
    exam_question_id: str | None = None
    question_text: str
    student_answer: str


class ConversationCreateRequest(BaseModel):
    title: str | None = None


class ConversationUpdateRequest(BaseModel):
    title: str


class PlaybackResolveRequest(BaseModel):
    query: str | None = None
    chunk_ids: list[str] = Field(default_factory=list)
    top_k: int = 6


class PlaybackSearchRequest(BaseModel):
    query: str
    top_k: int = 3
    video_asset_id: str | None = None


@lru_cache(maxsize=1)
def get_runtime() -> OrionCoreRuntime:
    return create_runtime()


def create_app(runtime: OrionCoreRuntime | None = None) -> FastAPI:
    active_runtime = runtime or get_runtime()
    app = FastAPI(title="Orion Core Backend", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(active_runtime.config.frontend_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def set_session_cookie(response: Response, token: str) -> None:
        response.set_cookie(
            key=active_runtime.config.session_cookie_name,
            value=token,
            max_age=active_runtime.config.session_ttl_seconds,
            httponly=True,
            secure=active_runtime.config.session_secure_cookie,
            samesite="lax",
            path="/",
        )

    def clear_session_cookie(response: Response) -> None:
        response.delete_cookie(
            key=active_runtime.config.session_cookie_name,
            httponly=True,
            secure=active_runtime.config.session_secure_cookie,
            samesite="lax",
            path="/",
        )

    def get_auth_session(raw_request: Request) -> AuthSession:
        token = raw_request.cookies.get(active_runtime.config.session_cookie_name)
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
        try:
            return active_runtime.auth.get_auth_session(token)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    def require_roles(raw_request: Request, *roles: str) -> AuthSession:
        auth_session = get_auth_session(raw_request)
        if roles and auth_session.user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this resource.")
        return auth_session

    def require_workspace_access(
        raw_request: Request,
        workspace_id: str,
        allowed_roles: tuple[str, ...] | None = None,
    ) -> AuthSession:
        auth_session = get_auth_session(raw_request)
        if auth_session.user.role == "admin":
            return auth_session
        if allowed_roles and auth_session.user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this resource.")
        if not active_runtime.memberships.is_member(workspace_id, auth_session.user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not assigned to this workspace.")
        return auth_session

    def _is_within_uploads(path: Path) -> bool:
        try:
            return path.resolve().is_relative_to(active_runtime.config.uploads_root.resolve())
        except AttributeError:
            resolved = path.resolve()
            root = active_runtime.config.uploads_root.resolve()
            return root == resolved or root in resolved.parents

    def _file_stream(path: Path, raw_request: Request, mime_type: str | None, delete_after: bool = False) -> Response:
        file_size = path.stat().st_size
        range_header = raw_request.headers.get("range")
        content_type = mime_type or "application/octet-stream"

        if not range_header:
            def iter_full():
                try:
                    with path.open("rb") as handle:
                        while True:
                            chunk = handle.read(1024 * 1024)
                            if not chunk:
                                break
                            yield chunk
                finally:
                    if delete_after:
                        try:
                            path.unlink(missing_ok=True)
                        except Exception:
                            pass

            return StreamingResponse(
                iter_full(),
                media_type=content_type,
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(file_size),
                },
            )

        # Expect format: bytes=start-end
        try:
            _, byte_range = range_header.split("=", 1)
            start_str, end_str = byte_range.split("-", 1)
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, detail="Invalid Range header.")

        if start >= file_size or end < start:
            raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, detail="Range out of bounds.")

        end = min(end, file_size - 1)
        content_length = end - start + 1

        def iter_range():
            try:
                with path.open("rb") as handle:
                    handle.seek(start)
                    remaining = content_length
                    while remaining > 0:
                        chunk = handle.read(min(1024 * 1024, remaining))
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        yield chunk
            finally:
                if delete_after:
                    try:
                        path.unlink(missing_ok=True)
                    except Exception:
                        pass

        return StreamingResponse(
            iter_range(),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
            },
        )

    def _bytes_stream(payload: bytes, raw_request: Request, mime_type: str | None) -> Response:
        content_type = mime_type or "application/octet-stream"
        file_size = len(payload)
        range_header = raw_request.headers.get("range")

        if not range_header:
            return StreamingResponse(
                BytesIO(payload),
                media_type=content_type,
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(file_size),
                },
            )

        try:
            _, byte_range = range_header.split("=", 1)
            start_str, end_str = byte_range.split("-", 1)
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, detail="Invalid Range header.")

        if start >= file_size or end < start:
            raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE, detail="Range out of bounds.")
        end = min(end, file_size - 1)
        sliced = payload[start : end + 1]

        return StreamingResponse(
            BytesIO(sliced),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(len(sliced)),
            },
        )

    def _extract_drive_file_id(url: str | None) -> str | None:
        if not url:
            return None
        try:
            parsed = urlparse(url)
        except Exception:
            return None
        if "drive.google.com" not in parsed.netloc and "googleusercontent.com" not in parsed.netloc:
            return None
        query_id = parse_qs(parsed.query).get("id")
        if query_id:
            return query_id[0]
        match = re.search(r"/file/d/([a-zA-Z0-9_-]+)", parsed.path)
        if match:
            return match.group(1)
        match = re.search(r"/d/([a-zA-Z0-9_-]+)", parsed.path)
        if match:
            return match.group(1)
        return None

    def _playback_stream_url(asset_id: str, workspace_id: str, base_url: str) -> str | None:
        try:
            asset = active_runtime.ingestion.get_asset(asset_id)
        except Exception:
            return None

        if asset.workspace_id != workspace_id:
            return None

        if asset.content_path:
            content_path = Path(asset.content_path)
            if _is_within_uploads(content_path) and content_path.exists():
                return f"{base_url}/workspaces/{workspace_id}/assets/{asset_id}/content"

        drive_file_id = asset.metadata.get("drive_file_id")
        extracted_drive_id = _extract_drive_file_id(asset.external_ref)
        if drive_file_id or extracted_drive_id:
            return f"{base_url}/workspaces/{workspace_id}/assets/{asset_id}/content"

        return None

    def _drive_stream(asset, raw_request: Request, drive_file_id: str | None = None) -> Response:
        drive_client = active_runtime.ingestion.drive_client
        effective_file_id = drive_file_id or asset.metadata.get("drive_file_id")
        if not drive_client or not drive_client.enabled or not effective_file_id:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Drive streaming is unavailable.")

        range_header = raw_request.headers.get("range")
        try:
            upstream = drive_client.stream_media(file_id=effective_file_id, range_header=range_header)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Drive stream unavailable for asset '{asset.id}' (file {effective_file_id}): {exc}",
            ) from exc

        def iter_upstream():
            try:
                for chunk in upstream.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        yield chunk
            finally:
                upstream.close()

        content_type = upstream.headers.get("Content-Type") or asset.mime_type or "application/octet-stream"
        passthrough_headers = {}
        for name in ("Accept-Ranges", "Content-Length", "Content-Range", "Cache-Control", "ETag", "Last-Modified"):
            value = upstream.headers.get(name)
            if value:
                passthrough_headers[name] = value

        return StreamingResponse(
            iter_upstream(),
            status_code=upstream.status_code,
            media_type=content_type,
            headers=passthrough_headers,
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/auth/setup-status")
    def auth_setup_status() -> dict[str, Any]:
        return {
            "setup_required": active_runtime.auth.setup_required(),
            "user_count": active_runtime.auth.user_count(),
            "allowed_roles": sorted(ALLOWED_ROLES),
            "allow_dev_auth_reset": active_runtime.config.allow_dev_auth_reset,
        }

    @app.post("/auth/bootstrap")
    def bootstrap(request: BootstrapRequest, response: Response, raw_request: Request) -> dict[str, Any]:
        try:
            user = active_runtime.auth.bootstrap_admin(
                full_name=request.full_name,
                email=request.email,
                password=request.password,
            )
            token, session_record = active_runtime.auth.create_session(
                user,
                user_agent=raw_request.headers.get("user-agent"),
                ip_address=raw_request.client.host if raw_request.client else None,
            )
            set_session_cookie(response, token)
            return {"user": user.to_dict(), "session": session_record.to_dict()}
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    @app.post("/auth/login")
    def login(request: LoginRequest, response: Response, raw_request: Request) -> dict[str, Any]:
        try:
            user = active_runtime.auth.authenticate(request.email, request.password)
            token, session_record = active_runtime.auth.create_session(
                user,
                user_agent=raw_request.headers.get("user-agent"),
                ip_address=raw_request.client.host if raw_request.client else None,
            )
            set_session_cookie(response, token)
            return {"user": user.to_dict(), "session": session_record.to_dict()}
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    @app.post("/auth/logout")
    def logout(response: Response, raw_request: Request) -> dict[str, str]:
        token = raw_request.cookies.get(active_runtime.config.session_cookie_name)
        if token:
            active_runtime.auth.revoke_token(token)
        clear_session_cookie(response)
        return {"status": "ok"}

    @app.post("/auth/dev-reset")
    def dev_reset_auth(response: Response) -> dict[str, str]:
        if not active_runtime.config.allow_dev_auth_reset:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local auth reset is disabled.")
        active_runtime.auth.reset_auth_state()
        clear_session_cookie(response)
        return {"status": "reset"}

    @app.get("/auth/me")
    def me(raw_request: Request) -> dict[str, Any]:
        return get_auth_session(raw_request).to_dict()

    @app.get("/auth/sessions")
    def list_sessions(raw_request: Request, all_users: bool = False) -> list[dict[str, Any]]:
        auth_session = get_auth_session(raw_request)
        if all_users and auth_session.user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
        user_id = None if all_users and auth_session.user.role == "admin" else auth_session.user.id
        return [session.to_dict() for session in active_runtime.auth.list_sessions(user_id=user_id)]

    @app.delete("/auth/sessions/{session_id}")
    def revoke_session(session_id: str, raw_request: Request) -> dict[str, str]:
        auth_session = get_auth_session(raw_request)
        try:
            active_runtime.auth.revoke_session(
                session_id,
                user_id=None if auth_session.user.role == "admin" else auth_session.user.id,
            )
            return {"status": "revoked"}
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    @app.get("/users")
    def list_users(raw_request: Request) -> list[dict[str, Any]]:
        require_roles(raw_request, "admin")
        return active_runtime.auth.list_users()

    @app.post("/users")
    def create_user(request: UserCreateRequest, raw_request: Request) -> dict[str, Any]:
        require_roles(raw_request, "admin")
        try:
            user = active_runtime.auth.create_user(
                full_name=request.full_name,
                email=request.email,
                password=request.password,
                role=request.role,
            )
            return user.to_dict()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    @app.post("/workspaces")
    def create_workspace(request: WorkspaceCreateRequest, raw_request: Request) -> dict:
        auth_session = require_roles(raw_request, "admin")
        try:
            workspace = active_runtime.workspaces.create_workspace(
                name=request.name,
                description=request.description,
                metadata=request.metadata,
            )
            active_runtime.memberships.add_member(workspace.id, auth_session.user.id, "admin")
            return workspace.to_dict()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/workspaces")
    def list_workspaces(raw_request: Request) -> list[dict]:
        require_roles(raw_request, "admin")
        return [workspace.to_dict() for workspace in active_runtime.workspaces.list_workspaces()]

    @app.get("/me/workspaces")
    def list_my_workspaces(raw_request: Request) -> list[dict]:
        auth_session = get_auth_session(raw_request)
        if auth_session.user.role == "admin":
            return [
                {**workspace.to_dict(), "membership_role": "admin"}
                for workspace in active_runtime.workspaces.list_workspaces()
            ]
        return active_runtime.memberships.list_workspaces_for_user(auth_session.user.id)

    @app.get("/workspaces/{workspace_id}/members")
    def list_workspace_members(workspace_id: str, raw_request: Request) -> list[dict]:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        return active_runtime.memberships.list_members(workspace_id)

    @app.post("/workspaces/{workspace_id}/members")
    def add_workspace_member(workspace_id: str, request: WorkspaceMemberRequest, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        membership = active_runtime.memberships.add_member(workspace_id, request.user_id, request.role)
        return membership.to_dict()

    @app.delete("/workspaces/{workspace_id}/members/{user_id}")
    def remove_workspace_member(workspace_id: str, user_id: str, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        active_runtime.memberships.remove_member(workspace_id, user_id)
        return {"status": "removed"}

    @app.get("/workspaces/{workspace_id}/conversations")
    def list_conversations(workspace_id: str, raw_request: Request, limit: int = 50) -> list[dict]:
        auth_session = require_workspace_access(raw_request, workspace_id)
        return [
            conversation.to_dict()
            for conversation in active_runtime.conversations.list_conversations(
                workspace_id,
                user_id=auth_session.user.id,
                limit=limit,
            )
        ]

    @app.post("/workspaces/{workspace_id}/conversations")
    def create_conversation(workspace_id: str, request: ConversationCreateRequest, raw_request: Request) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        conversation = active_runtime.conversations.create_conversation(
            workspace_id,
            user_id=auth_session.user.id,
            title=request.title or "New conversation",
        )
        return conversation.to_dict()

    @app.get("/workspaces/{workspace_id}/conversations/{conversation_id}")
    def get_conversation(workspace_id: str, conversation_id: str, raw_request: Request) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        conversation = active_runtime.conversations.get_conversation(
            workspace_id,
            conversation_id,
            user_id=auth_session.user.id,
        )
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        return conversation.to_dict()

    @app.patch("/workspaces/{workspace_id}/conversations/{conversation_id}")
    def update_conversation(
        workspace_id: str,
        conversation_id: str,
        request: ConversationUpdateRequest,
        raw_request: Request,
    ) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        try:
            conversation = active_runtime.conversations.rename_conversation(
                workspace_id,
                conversation_id,
                title=request.title,
                user_id=auth_session.user.id,
            )
            return conversation.to_dict()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    @app.delete("/workspaces/{workspace_id}/conversations/{conversation_id}")
    def delete_conversation(workspace_id: str, conversation_id: str, raw_request: Request) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        try:
            active_runtime.conversations.delete_conversation(
                workspace_id,
                conversation_id,
                user_id=auth_session.user.id,
            )
            return {"status": "deleted"}
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    @app.get("/workspaces/{workspace_id}/conversations/{conversation_id}/messages")
    def list_conversation_messages(workspace_id: str, conversation_id: str, raw_request: Request, limit: int = 100) -> list[dict]:
        auth_session = require_workspace_access(raw_request, workspace_id)
        try:
            return [
                message.to_dict()
                for message in active_runtime.conversations.list_messages(
                    workspace_id,
                    conversation_id,
                    user_id=auth_session.user.id,
                    limit=limit,
                )
            ]
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    @app.post("/workspaces/{workspace_id}/assets/file")
    def register_file_asset(workspace_id: str, request: FileAssetRequest, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        try:
            if request.content_base64 and request.filename:
                asset = active_runtime.ingestion.register_browser_file_asset(
                    workspace_id=workspace_id,
                    asset_type=request.asset_type,
                    title=request.title,
                    filename=request.filename,
                    content_base64=request.content_base64,
                    metadata=request.metadata,
                    mime_type=request.mime_type,
                )
            elif request.file_path:
                asset = active_runtime.ingestion.register_file_asset(
                    workspace_id=workspace_id,
                    asset_type=request.asset_type,
                    title=request.title,
                    file_path=request.file_path,
                    metadata=request.metadata,
                    mime_type=request.mime_type,
                )
            else:
                raise ValueError("Provide either file_path or filename + content_base64.")
            return asset.to_dict()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/workspaces/{workspace_id}/assets/text")
    def register_text_asset(workspace_id: str, request: TextAssetRequest, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        asset = active_runtime.ingestion.register_text_asset(
            workspace_id=workspace_id,
            asset_type=request.asset_type,
            title=request.title,
            text=request.text,
            filename=request.filename,
            metadata=request.metadata,
        )
        return asset.to_dict()

    @app.post("/workspaces/{workspace_id}/assets/transcript")
    def register_transcript(workspace_id: str, request: TranscriptSegmentsRequest, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        asset = active_runtime.ingestion.register_transcript_segments(
            workspace_id=workspace_id,
            title=request.title,
            segments=request.segments,
            linked_video_asset_id=request.linked_video_asset_id,
            metadata=request.metadata,
        )
        return asset.to_dict()

    @app.post("/workspaces/{workspace_id}/transcripts/backfill")
    def backfill_transcripts(workspace_id: str, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        try:
            scheduled = active_runtime.transcription.schedule_workspace_video_transcripts(workspace_id)
            return {"status": "scheduled", "scheduled_count": scheduled}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/workspaces/{workspace_id}/videos/{video_asset_id}/transcript/generate")
    def generate_video_transcript(workspace_id: str, video_asset_id: str, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id)
        try:
            asset = active_runtime.ingestion.get_asset(video_asset_id)
            if asset.workspace_id != workspace_id:
                raise ValueError("Video asset not found in this workspace.")
            if asset.asset_type != "video":
                raise ValueError("Transcript generation is only supported for lecture video assets.")

            existing_transcript = active_runtime.transcription._find_linked_transcript(workspace_id, video_asset_id)
            scheduled = active_runtime.transcription.schedule_for_video_asset(video_asset_id)
            refreshed = active_runtime.ingestion.get_asset(video_asset_id)
            status_value = str(refreshed.metadata.get("auto_transcript_status", "")).strip().lower()

            return {
                "status": status_value or ("ready" if existing_transcript else "queued"),
                "scheduled": scheduled,
                "linked_transcript_asset_id": refreshed.metadata.get("linked_transcript_asset_id"),
                "error": refreshed.metadata.get("auto_transcript_error"),
            }
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/workspaces/{workspace_id}/assets/video")
    def register_video(workspace_id: str, request: VideoAssetRequest, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        if request.content_base64 and request.filename:
            asset = active_runtime.ingestion.register_browser_video_asset(
                workspace_id=workspace_id,
                title=request.title,
                filename=request.filename,
                content_base64=request.content_base64,
                mime_type=request.mime_type,
                external_ref=request.external_ref,
                metadata=request.metadata,
            )
        else:
            asset = active_runtime.ingestion.register_video_asset(
                workspace_id=workspace_id,
                title=request.title,
                file_path=request.file_path,
                external_ref=request.external_ref,
                metadata=request.metadata,
            )
        active_runtime.transcription.schedule_for_video_asset(asset.id)
        return asset.to_dict()

    @app.get("/workspaces/{workspace_id}/assets")
    def list_assets(workspace_id: str, raw_request: Request) -> list[dict]:
        require_workspace_access(raw_request, workspace_id)
        return [asset.to_dict() for asset in active_runtime.ingestion.list_assets(workspace_id)]

    @app.get("/workspaces/{workspace_id}/assets/{asset_id}/content")
    def stream_asset_content(workspace_id: str, asset_id: str, raw_request: Request) -> Response:
        require_workspace_access(raw_request, workspace_id)
        try:
            asset = active_runtime.ingestion.get_asset(asset_id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        if asset.workspace_id != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found in workspace.")

        drive_file_id = asset.metadata.get("drive_file_id")
        if drive_file_id:
            # Prefer Drive streaming directly whenever a Drive mirror exists.
            # This keeps playback fully external-source backed in Orion.
            primary_error: Exception | None = None
            try:
                return _drive_stream(asset, raw_request, drive_file_id=drive_file_id)
            except HTTPException as exc:
                primary_error = exc
            fallback_drive_id = _extract_drive_file_id(asset.external_ref)
            if fallback_drive_id and fallback_drive_id != drive_file_id:
                return _drive_stream(asset, raw_request, drive_file_id=fallback_drive_id)
            if primary_error:
                raise primary_error
        extracted_drive_id = _extract_drive_file_id(asset.external_ref)
        if extracted_drive_id:
            return _drive_stream(asset, raw_request, drive_file_id=extracted_drive_id)

        path = None
        if asset.content_path:
            content_path = Path(asset.content_path)
            if _is_within_uploads(content_path) and content_path.exists():
                path = content_path
        if path:
            return _file_stream(path, raw_request, asset.mime_type, delete_after=False)

        drive_web_content = asset.metadata.get("drive_web_content_link")
        drive_web_view = asset.metadata.get("drive_web_view_link")
        # If this asset is Drive-backed, do not redirect to raw Google links.
        # The expected behavior is authenticated in-app streaming via Orion.
        if not drive_file_id:
            if drive_web_content:
                return RedirectResponse(drive_web_content, status_code=status.HTTP_302_FOUND)
            if drive_web_view:
                return RedirectResponse(drive_web_view, status_code=status.HTTP_302_FOUND)

        if asset.external_ref:
            return RedirectResponse(asset.external_ref, status_code=status.HTTP_302_FOUND)

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset content not available.")

    @app.post("/workspaces/{workspace_id}/guidance")
    def create_guidance(workspace_id: str, request: GuidanceRequest, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        pack = active_runtime.guidance.create_guidance_pack(
            workspace_id=workspace_id,
            name=request.name,
            instructions=request.instructions,
            metadata=request.metadata,
            activate=request.activate,
        )
        return pack.to_dict()

    @app.get("/workspaces/{workspace_id}/guidance")
    def list_guidance(workspace_id: str, raw_request: Request) -> list[dict]:
        require_workspace_access(raw_request, workspace_id)
        return [pack.to_dict() for pack in active_runtime.guidance.list_guidance_packs(workspace_id)]

    @app.post("/workspaces/{workspace_id}/corpus/build")
    def build_corpus(workspace_id: str, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id, allowed_roles=("admin", "lecturer"))
        try:
            corpus = active_runtime.corpus_builder.build_workspace_corpus(workspace_id)
            return corpus.to_dict()
        except Exception as exc:
            detail = str(exc)
            if "oauth2.googleapis.com" in detail or "transporterror" in detail.lower():
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc

    @app.get("/workspaces/{workspace_id}/corpus/active")
    def inspect_active_corpus(workspace_id: str, raw_request: Request) -> dict:
        require_workspace_access(raw_request, workspace_id)
        try:
            return active_runtime.corpus_builder.inspect_active_corpus(workspace_id)
        except ValueError as exc:
            if "has no active corpus" in str(exc).lower():
                return {
                    "database_record": None,
                    "workspace_manifest": active_runtime.file_store.read_workspace_manifest(workspace_id),
                    "version_manifest": None,
                }
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.post("/workspaces/{workspace_id}/retrieve")
    def retrieve(workspace_id: str, request: RetrievalRequest, raw_request: Request) -> list[dict]:
        require_workspace_access(raw_request, workspace_id)
        try:
            hits = active_runtime.retrieval.retrieve(
                workspace_id=workspace_id,
                query=request.query,
                top_k=request.top_k,
                source_types=request.source_types,
                source_weights=request.source_weights,
            )
            return [hit.to_dict() for hit in hits]
        except ValueError as exc:
            detail = str(exc)
            if "active corpus" in detail.lower() or "rebuild the corpus" in detail.lower():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
            if "deterministic answering is disabled" in detail.lower():
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=detail) from exc
            if "llm grounded synthesis failed" in detail.lower():
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc
        except Exception as exc:
            detail = str(exc)
            if "oauth2.googleapis.com" in detail or "transporterror" in detail.lower():
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc

    @app.post("/workspaces/{workspace_id}/ask")
    def ask(workspace_id: str, request: AskRequest, raw_request: Request) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        try:
            conversation = active_runtime.conversations.ensure_conversation(
                workspace_id=workspace_id,
                user_id=auth_session.user.id,
                conversation_id=request.conversation_id,
                seed_title=request.query,
            )
            history = active_runtime.conversations.list_messages(
                workspace_id,
                conversation.id,
                user_id=auth_session.user.id,
                limit=24,
            )
            response = active_runtime.answering.ask(
                workspace_id=workspace_id,
                query=request.query,
                conversation_id=conversation.id,
                conversation_history=history,
                user_id=auth_session.user.id,
                answer_mode=request.answer_mode,
                top_k=request.top_k,
                source_types=request.source_types,
                source_weights=request.source_weights,
            )
            if response.playback and response.playback.video_asset_id:
                base = str(raw_request.base_url).rstrip("/")
                response.playback.video_stream_url = _playback_stream_url(
                    response.playback.video_asset_id,
                    workspace_id,
                    base,
                )
            if response.playback_segments:
                base = str(raw_request.base_url).rstrip("/")
                for segment in response.playback_segments:
                    segment.video_stream_url = _playback_stream_url(
                        segment.video_asset_id,
                        workspace_id,
                        base,
                    )
            active_runtime.conversations.append_user_message(
                workspace_id=workspace_id,
                conversation_id=conversation.id,
                user_id=auth_session.user.id,
                content=request.query,
            )
            active_runtime.conversations.append_assistant_message(response, user_id=auth_session.user.id)
            return response.to_dict()
        except ValueError as exc:
            detail = str(exc)
            if "active corpus" in detail.lower() or "rebuild the corpus" in detail.lower():
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc
        except Exception as exc:
            detail = str(exc)
            if "oauth2.googleapis.com" in detail or "transporterror" in detail.lower():
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
            raise HTTPException(status_code=400, detail=detail) from exc

    @app.post("/workspaces/{workspace_id}/playback/resolve")
    def resolve_playback(workspace_id: str, request: PlaybackResolveRequest, raw_request: Request) -> dict | None:
        require_workspace_access(raw_request, workspace_id)
        try:
            hits: list[RetrievalHit]
            if request.chunk_ids:
                chunks = active_runtime.retrieval.get_chunks_by_ids(workspace_id, request.chunk_ids)
                hits = [
                    RetrievalHit(chunk=chunk, semantic_score=0.0, lexical_score=0.0, final_score=0.0)
                    for chunk in chunks
                ]
            elif request.query:
                hits = active_runtime.retrieval.retrieve(workspace_id, request.query, top_k=request.top_k)
            else:
                raise ValueError("Provide either query or chunk_ids for playback resolution.")
            segment = active_runtime.playback.resolve_from_hits(request.query or "", hits)
            if segment and segment.video_asset_id:
                base = str(raw_request.base_url).rstrip("/")
                segment.video_stream_url = _playback_stream_url(segment.video_asset_id, workspace_id, base)
            return segment.to_dict() if segment else None
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/workspaces/{workspace_id}/playback/search")
    def search_playback_segments(workspace_id: str, request: PlaybackSearchRequest, raw_request: Request) -> list[dict]:
        require_workspace_access(raw_request, workspace_id)
        try:
            query = request.query.strip()
            if not query:
                raise ValueError("A query is required for transcript playback search.")

            search_query = query
            if request.video_asset_id:
                try:
                    asset = active_runtime.ingestion.get_asset(request.video_asset_id)
                    if asset.workspace_id == workspace_id and asset.title:
                        search_query = f"{query} {asset.title}"
                except Exception:
                    pass

            hits = active_runtime.retrieval.retrieve(
                workspace_id,
                search_query,
                top_k=max(request.top_k * 8, 24),
                source_types=["transcript"],
                source_weights={"transcript": 1.1},
            )
            segments = active_runtime.playback.resolve_top_segments_from_hits(
                query,
                hits,
                limit=request.top_k,
                video_asset_id=request.video_asset_id,
            )
            base = str(raw_request.base_url).rstrip("/")
            for segment in segments:
                segment.video_stream_url = _playback_stream_url(segment.video_asset_id, workspace_id, base)
            return [segment.to_dict() for segment in segments]
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/workspaces/{workspace_id}/queries")
    def list_queries(workspace_id: str, raw_request: Request, limit: int = 50) -> list[dict]:
        require_workspace_access(raw_request, workspace_id)
        return active_runtime.logging.list_query_events(workspace_id, limit=limit)

    @app.get("/workspaces/{workspace_id}/insights")
    def get_insights(workspace_id: str, raw_request: Request, limit: int = 200) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        return active_runtime.insights.generate_insights(workspace_id, limit=limit, user_id=auth_session.user.id)

    @app.get("/workspaces/{workspace_id}/notes/topics")
    def get_topic_notes(workspace_id: str, raw_request: Request, limit: int = 140) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        return active_runtime.insights.generate_topic_notes(
            workspace_id=workspace_id,
            user_id=auth_session.user.id,
            limit=limit,
        )

    @app.get("/workspaces/{workspace_id}/exam-prep/profile")
    def get_exam_profile(workspace_id: str, raw_request: Request) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        return active_runtime.exam_practice.get_exam_profile(workspace_id, auth_session.user.id)

    @app.post("/workspaces/{workspace_id}/exam-prep/recommendation")
    def recommend_exam_question(workspace_id: str, request: ExamRecommendationRequest, raw_request: Request) -> dict | None:
        auth_session = require_workspace_access(raw_request, workspace_id)
        return active_runtime.exam_practice.recommend_question(
            workspace_id=workspace_id,
            user_id=auth_session.user.id,
            prefer_inspired=request.prefer_inspired,
            requested_topics=request.requested_topics or None,
        )

    @app.post("/workspaces/{workspace_id}/exam-prep/evaluate")
    def evaluate_exam_answer(workspace_id: str, request: ExamEvaluationRequest, raw_request: Request) -> dict:
        auth_session = require_workspace_access(raw_request, workspace_id)
        if not request.question_text.strip():
            raise HTTPException(status_code=400, detail="Question text is required.")
        if not request.student_answer.strip():
            raise HTTPException(status_code=400, detail="Student answer is required.")
        return active_runtime.exam_practice.evaluate_answer(
            workspace_id=workspace_id,
            user_id=auth_session.user.id,
            question_text=request.question_text.strip(),
            student_answer=request.student_answer.strip(),
            exam_question_id=request.exam_question_id,
        )

    @app.get("/workspaces/{workspace_id}/exam-questions")
    def list_exam_questions(workspace_id: str, raw_request: Request) -> list[dict]:
        require_workspace_access(raw_request, workspace_id)
        return [question.to_dict() for question in active_runtime.exam_practice.list_exam_questions(workspace_id)]

    return app


app = create_app()
