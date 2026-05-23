from __future__ import annotations

from dataclasses import dataclass

from .config import IkionConfig, load_config
from .db import Database
from .services.answering import GroundedAnsweringService
from .services.auth import AuthService
from .services.chunking import ChunkingService
from .services.conversation_graph import ConversationGraphService
from .services.conversations import ConversationService
from .services.corpus_builder import CorpusBuilderService
from .services.embeddings import build_embedding_provider
from .services.exam_chat_subagent import ExamChatSubagentService
from .services.exam_practice import ExamPracticeService
from .services.guidance import GuidanceService
from .services.ingestion import AssetIngestionService
from .services.insights import InsightsService
from .services.logging_service import QueryLoggingService
from .services.memberships import WorkspaceMembershipService
from .services.playback import PlaybackService
from .services.latex_subagent import LatexFormattingSubagent
from .services.reflection import ResponseReflectionTool
from .services.retrieval import RetrievalService
from .services.transcription import TranscriptGenerationService
from .services.workspaces import WorkspaceService
from .storage.drive_client import GoogleDriveClient
from .storage.file_store import FileStore


@dataclass(slots=True)
class IkionCoreRuntime:
    config: IkionConfig
    db: Database
    file_store: FileStore
    auth: AuthService
    workspaces: WorkspaceService
    memberships: WorkspaceMembershipService
    conversations: ConversationService
    conversation_graph: ConversationGraphService
    ingestion: AssetIngestionService
    guidance: GuidanceService
    corpus_builder: CorpusBuilderService
    retrieval: RetrievalService
    playback: PlaybackService
    latex_subagent: LatexFormattingSubagent
    reflection: ResponseReflectionTool
    logging: QueryLoggingService
    exam_practice: ExamPracticeService
    exam_chat_subagent: ExamChatSubagentService
    insights: InsightsService
    answering: GroundedAnsweringService
    transcription: TranscriptGenerationService


def create_runtime(config: IkionConfig | None = None) -> IkionCoreRuntime:
    runtime_config = config or load_config()
    if runtime_config.google_drive_only and not runtime_config.google_drive_enabled:
        raise ValueError("IKION_GOOGLE_DRIVE_ONLY=true requires IKION_GOOGLE_DRIVE_ENABLED=true.")
    db = Database(runtime_config.database_path)
    file_store = FileStore(runtime_config)
    drive_client = GoogleDriveClient(
        enabled=runtime_config.google_drive_enabled,
        credentials_path=runtime_config.google_drive_credentials_path,
        credentials_json=runtime_config.google_drive_credentials_json,
        root_folder_id=runtime_config.google_drive_root_folder_id,
        shared_drive_id=runtime_config.google_drive_shared_drive_id,
    )
    auth = AuthService(runtime_config, db)
    workspaces = WorkspaceService(db, file_store)
    memberships = WorkspaceMembershipService(db)
    conversations = ConversationService(db)
    conversation_graph = ConversationGraphService(runtime_config)
    ingestion = AssetIngestionService(
        db,
        file_store,
        drive_client=drive_client,
        drive_only=runtime_config.google_drive_only,
    )
    guidance = GuidanceService(db, drive_client=drive_client)
    chunking = ChunkingService(runtime_config)
    embeddings = build_embedding_provider(runtime_config)
    corpus_builder = CorpusBuilderService(
        runtime_config,
        db,
        file_store,
        ingestion,
        embeddings,
        chunking,
        drive_client=drive_client,
    )
    retrieval = RetrievalService(runtime_config, corpus_builder, embeddings)
    playback = PlaybackService(db)
    latex_subagent = LatexFormattingSubagent()
    reflection = ResponseReflectionTool(latex_subagent=latex_subagent)
    logging = QueryLoggingService(db)
    exam_practice = ExamPracticeService(runtime_config, db, ingestion, retrieval, guidance)
    exam_chat_subagent = ExamChatSubagentService(runtime_config, exam_practice)
    insights = InsightsService(runtime_config, db, logging, memberships, corpus_builder, embeddings, exam_practice)
    answering = GroundedAnsweringService(
        runtime_config,
        retrieval,
        guidance,
        playback,
        reflection,
        logging,
        exam_practice,
        exam_chat_subagent,
        conversation_graph,
    )
    transcription = TranscriptGenerationService(runtime_config, ingestion, corpus_builder=corpus_builder)
    return IkionCoreRuntime(
        config=runtime_config,
        db=db,
        file_store=file_store,
        auth=auth,
        workspaces=workspaces,
        memberships=memberships,
        conversations=conversations,
        conversation_graph=conversation_graph,
        ingestion=ingestion,
        guidance=guidance,
        corpus_builder=corpus_builder,
        retrieval=retrieval,
        playback=playback,
        latex_subagent=latex_subagent,
        reflection=reflection,
        logging=logging,
        exam_practice=exam_practice,
        exam_chat_subagent=exam_chat_subagent,
        insights=insights,
        answering=answering,
        transcription=transcription,
    )
