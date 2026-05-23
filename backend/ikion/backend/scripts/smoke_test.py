from __future__ import annotations

import json
import sys

from pathlib import Path

import fitz


if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[3]))

from ikion.backend.runtime import create_runtime


def write_sample_pdf(path: Path) -> None:
    document = fitz.open()
    page = document.new_page()
    page.insert_text(
        (72, 72),
        (
            "Security Handbook\n\n"
            "All suspected incidents must be escalated to the operations lead within 15 minutes.\n"
            "The handbook is mandatory reading before the onboarding workshop."
        ),
    )
    document.save(path)
    document.close()


def main() -> None:
    runtime = create_runtime()
    workspace = runtime.workspaces.create_workspace(
        name="Ikion Core Smoke Test",
        description="Local MVP verification workspace.",
        metadata={"vertical_hint": "core"},
    )

    guidance = runtime.guidance.create_guidance_pack(
        workspace_id=workspace.id,
        name="Operations Briefing",
        instructions="Be concise and use bullet points when the evidence supports more than one distinct point.",
    )

    video_path = runtime.config.backend_root / "public_video" / "LectureNew.mp4"
    video_asset = runtime.ingestion.register_video_asset(
        workspace_id=workspace.id,
        title="Onboarding Walkthrough",
        file_path=video_path if video_path.exists() else None,
        external_ref=None if video_path.exists() else "video://onboarding-demo",
        metadata={"purpose": "playback smoke test"},
    )

    notice_asset = runtime.ingestion.register_text_asset(
        workspace_id=workspace.id,
        asset_type="notice",
        title="Workshop Notice",
        text=(
            "The onboarding workshop begins at 10:00 on April 14 in Conference Room A. "
            "All new team members should review the security handbook before attending."
        ),
        filename="workshop_notice.txt",
    )

    transcript_asset = runtime.ingestion.register_transcript_segments(
        workspace_id=workspace.id,
        title="Onboarding Transcript",
        linked_video_asset_id=video_asset.id,
        segments=[
            {"start": 12, "end": 24, "text": "Before the workshop, review the security handbook so the escalation policy is familiar."},
            {"start": 24, "end": 38, "text": "The first session covers incident escalation, reporting expectations, and evidence capture."},
        ],
    )

    sample_pdf = runtime.config.data_root / "smoke_sample_handbook.pdf"
    write_sample_pdf(sample_pdf)
    pdf_asset = runtime.ingestion.register_file_asset(
        workspace_id=workspace.id,
        asset_type="pdf",
        title="Security Handbook Extract",
        file_path=sample_pdf,
    )

    corpus = runtime.corpus_builder.build_workspace_corpus(workspace.id)
    conversation = runtime.conversations.create_conversation(
        workspace_id=workspace.id,
        user_id="smoke-test",
        title="Smoke conversation",
    )

    answered = runtime.answering.ask(
        workspace_id=workspace.id,
        query="What should new team members review before the workshop?",
        conversation_id=conversation.id,
        user_id="smoke-test",
    )
    runtime.conversations.append_user_message(workspace.id, conversation.id, "smoke-test", answered.query)
    runtime.conversations.append_assistant_message(answered, user_id="smoke-test")

    refused = runtime.answering.ask(
        workspace_id=workspace.id,
        query="What color is the training badge?",
        conversation_id=conversation.id,
        user_id="smoke-test",
    )
    runtime.conversations.append_user_message(workspace.id, conversation.id, "smoke-test", refused.query)
    runtime.conversations.append_assistant_message(refused, user_id="smoke-test")

    insights = runtime.insights.generate_insights(workspace.id)

    output = {
        "workspace": workspace.to_dict(),
        "guidance_pack": guidance.to_dict(),
        "assets": [
            notice_asset.to_dict(),
            transcript_asset.to_dict(),
            video_asset.to_dict(),
            pdf_asset.to_dict(),
        ],
        "active_corpus": corpus.to_dict(),
        "conversation": conversation.to_dict(),
        "messages": [message.to_dict() for message in runtime.conversations.list_messages(workspace.id, conversation.id, user_id="smoke-test")],
        "answered_query": answered.to_dict(),
        "unsupported_query": refused.to_dict(),
        "query_log": runtime.logging.list_query_events(workspace.id, limit=5),
        "insights": insights,
    }
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
