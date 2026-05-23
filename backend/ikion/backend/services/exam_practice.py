from __future__ import annotations

import json
import logging
import re

from collections import Counter
from typing import Any

from ..config import IkionConfig
from ..db import Database
from ..models import ExamAttempt, ExamQuestion
from ..utils.ids import make_id
from ..utils.pdf_worker import load_pdf_pages
from ..utils.text import clean_text, normalized_query_bucket, salient_terms, split_sentences, tokenize
from ..utils.time import utc_now_iso
from .guidance import GuidanceService
from .ingestion import AssetIngestionService
from .retrieval import RetrievalService


EXAM_QUERY_TERMS = {
    "exam",
    "markscheme",
    "past",
    "paper",
    "practice",
    "question",
    "revision",
    "answer",
    "marks",
    "evaluate",
    "critically",
}

EXAM_TOPIC_FILLER = {
    "answer",
    "answers",
    "detail",
    "details",
    "exam",
    "exams",
    "explain",
    "explained",
    "explaining",
    "explanation",
    "good",
    "mark",
    "marks",
    "more",
    "much",
    "paper",
    "practice",
    "question",
    "questions",
    "revision",
    "style",
    "tell",
    "understand",
    "want",
}

COMMAND_WORDS = (
    "analyse",
    "analyze",
    "apply",
    "compare",
    "contrast",
    "critically",
    "define",
    "describe",
    "discuss",
    "evaluate",
    "explain",
    "justify",
    "outline",
)

CHAT_ANSWER_MARKERS = (
    "my answer",
    "my attempt",
    "here is my answer",
    "here's my answer",
    "question:",
    "answer:",
    "mark this",
    "grade this",
    "evaluate this answer",
    "feedback on my answer",
)

logger = logging.getLogger(__name__)


class ExamPracticeService:
    def __init__(
        self,
        config: IkionConfig,
        db: Database,
        ingestion: AssetIngestionService,
        retrieval: RetrievalService,
        guidance: GuidanceService,
    ):
        self.config = config
        self.db = db
        self.ingestion = ingestion
        self.retrieval = retrieval
        self.guidance = guidance

    def is_exam_related_query(self, query: str) -> bool:
        tokens = set(tokenize(query))
        return bool(tokens & EXAM_QUERY_TERMS)

    def build_chat_performance_signal(
        self,
        query: str,
        hits: list[Any],
        status: str,
        support_score: float,
    ) -> dict[str, Any] | None:
        cleaned = clean_text(query)
        if not self.is_exam_related_query(cleaned):
            return None

        student_answer = self._extract_chat_answer_text(cleaned)
        answer_attempt = bool(student_answer)
        evidence_terms: set[str] = set()
        for hit in hits[:4]:
            evidence_terms.update(tokenize(hit.chunk.text))

        overlap = 0.0
        if student_answer:
            answer_tokens = set(tokenize(student_answer))
            overlap = len(answer_tokens.intersection(evidence_terms)) / max(len(answer_tokens), 1) if answer_tokens else 0.0

        status_adjustment = {
            "answered": 0.03,
            "partial": -0.05,
            "refused": -0.18,
            "error": -0.24,
        }.get(status, -0.1)

        if answer_attempt:
            structure_bonus = 0.05 if len(split_sentences(student_answer)) >= 2 else 0.0
            score = (0.42 * overlap) + (0.24 * support_score) + structure_bonus + status_adjustment
        else:
            score = (0.26 * support_score) + status_adjustment

        focus_topics = self._focus_topics_from_hits(cleaned, hits)
        return {
            "exam_related": True,
            "chat_answer_attempt": answer_attempt,
            "chat_readiness_score": round(min(max(score, 0.0), 1.0), 3),
            "chat_focus_topics": focus_topics[:4],
        }

    def build_prompt_context(self, workspace_id: str, user_id: str | None, query: str) -> dict[str, Any] | None:
        if not user_id or not self.is_exam_related_query(query):
            return None
        profile = self.get_exam_profile(workspace_id, user_id)
        recommendation = profile.get("recommended_question") or {}
        focus_topics = [clean_text(item) for item in (profile.get("focus_topics") or []) if clean_text(item)]
        return {
            "readiness_score": int(profile.get("readiness_score", 0) or 0),
            "proficiency_band": str(profile.get("proficiency_band", "building") or "building"),
            "exam_attempt_readiness_score": int(profile.get("exam_attempt_readiness_score", 0) or 0),
            "chat_readiness_score": int(profile.get("chat_readiness_score", 0) or 0),
            "focus_topics": focus_topics[:5],
            "recommended_question_title": recommendation.get("paper_label") or recommendation.get("task_summary"),
            "recommended_question_text": recommendation.get("question_text"),
            "recommended_answer_framework": recommendation.get("answer_framework") or [],
            "recommended_why_now": recommendation.get("why_this_now") or [],
            "graph_focus_terms": list(dict.fromkeys(focus_topics[:3] + ([recommendation.get("topic_label")] if recommendation.get("topic_label") else []))),
        }

    def sync_asset(self, asset_id: str) -> list[ExamQuestion]:
        asset = None
        try:
            asset = self.ingestion.get_asset(asset_id)
            category = str(asset.metadata.get("document_category") or "").strip().lower()
            if category == "exam_paper":
                questions = self._extract_questions_for_asset(asset.id)
                self._replace_uploaded_questions(asset.workspace_id, asset.id, questions)
                self._update_asset_sync_metadata(
                    asset,
                    sync_status="ready",
                    question_count=len(questions),
                    error=None,
                )
                return self.list_exam_questions(asset.workspace_id, source_asset_id=asset.id)
            if category == "mark_scheme":
                linked_exam_asset_id = asset.metadata.get("linked_exam_asset_id")
                if linked_exam_asset_id:
                    now = utc_now_iso()
                    self.db.execute(
                        """
                        UPDATE exam_questions
                        SET mark_scheme_asset_id = ?, updated_at = ?
                        WHERE workspace_id = ? AND source_asset_id = ?
                        """,
                        (asset.id, now, asset.workspace_id, linked_exam_asset_id),
                    )
                self._update_asset_sync_metadata(asset, sync_status="ready", question_count=0, error=None)
                return []
        except Exception:
            if asset is not None:
                self._update_asset_sync_metadata(asset, sync_status="failed", question_count=0, error="Exam-paper indexing failed.")
            logger.exception("Exam-practice sync failed for asset %s", asset_id)
            return []
        return []

    def list_exam_questions(self, workspace_id: str, source_asset_id: str | None = None) -> list[ExamQuestion]:
        if source_asset_id:
            self._sync_asset_if_pending(source_asset_id)
        else:
            self._sync_pending_workspace_assets(workspace_id)
        params: list[object] = [workspace_id]
        sql = "SELECT * FROM exam_questions WHERE workspace_id = ?"
        if source_asset_id:
            sql += " AND source_asset_id = ?"
            params.append(source_asset_id)
        sql += " ORDER BY updated_at DESC, question_number ASC, created_at ASC"
        rows = self.db.fetchall(sql, tuple(params))
        return [self._row_to_question(row) for row in rows]

    def list_attempts(self, workspace_id: str, user_id: str, limit: int = 8) -> list[ExamAttempt]:
        rows = self.db.fetchall(
            """
            SELECT * FROM exam_attempts
            WHERE workspace_id = ? AND user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (workspace_id, user_id, limit),
        )
        return [self._row_to_attempt(row) for row in rows]

    def get_exam_profile(self, workspace_id: str, user_id: str | None) -> dict[str, Any]:
        questions = self.list_exam_questions(workspace_id)
        exam_papers = self.db.fetchall(
            "SELECT id, title, metadata_json FROM assets WHERE workspace_id = ? AND asset_type = 'pdf'",
            (workspace_id,),
        )
        exam_paper_count = 0
        mark_scheme_count = 0
        for row in exam_papers:
            try:
                metadata = json.loads(row["metadata_json"] or "{}")
            except Exception:
                metadata = {}
            category = str(metadata.get("document_category") or "").strip().lower()
            if category == "exam_paper":
                exam_paper_count += 1
            if category == "mark_scheme":
                mark_scheme_count += 1

        attempts = self.list_attempts(workspace_id, user_id, limit=12) if user_id else []
        query_rows = self.db.fetchall(
            """
            SELECT query_text, response_status, metrics_json, created_at
            FROM query_events
            WHERE workspace_id = ? AND (? IS NULL OR user_id = ?)
            ORDER BY created_at DESC
            LIMIT 24
            """,
            (workspace_id, user_id, user_id),
        )
        focus_topics = self._focus_topics_from_history(questions, attempts, query_rows)
        readiness = self._readiness_components(attempts, query_rows)
        readiness_score = readiness["readiness_score"]
        avg_attempt_score = round(sum(attempt.score for attempt in attempts) / len(attempts), 3) if attempts else None
        proficiency_band = self._proficiency_band(readiness_score)
        recommended_question = self.recommend_question(
            workspace_id=workspace_id,
            user_id=user_id,
            prefer_inspired=readiness_score >= 82 and len(attempts) >= 2,
        )
        lecturer_exam_guidance = self._active_exam_guidance(workspace_id)

        return {
            "workspace_id": workspace_id,
            "exam_question_count": len(questions),
            "exam_paper_count": exam_paper_count,
            "mark_scheme_count": mark_scheme_count,
            "readiness_score": readiness_score,
            "exam_attempt_readiness_score": readiness["exam_attempt_readiness_score"],
            "chat_readiness_score": readiness["chat_readiness_score"],
            "chat_activity_count": readiness["chat_activity_count"],
            "proficiency_band": proficiency_band,
            "avg_attempt_score": avg_attempt_score,
            "recent_attempt_count": len(attempts),
            "focus_topics": focus_topics,
            "lecturer_exam_guidance": lecturer_exam_guidance,
            "recommended_question": recommended_question,
            "recent_attempts": [attempt.to_dict() for attempt in attempts[:4]],
        }

    def recommend_question(
        self,
        workspace_id: str,
        user_id: str | None,
        prefer_inspired: bool = False,
        requested_topics: list[str] | None = None,
    ) -> dict[str, Any] | None:
        questions = self.list_exam_questions(workspace_id)
        query_rows = self.db.fetchall(
            """
            SELECT query_text, response_status, metrics_json, created_at
            FROM query_events
            WHERE workspace_id = ? AND (? IS NULL OR user_id = ?)
            ORDER BY created_at DESC
            LIMIT 24
            """,
            (workspace_id, user_id, user_id),
        )
        attempts = self.list_attempts(workspace_id, user_id, limit=10) if user_id else []
        focus_topics = requested_topics or self._focus_topics_from_history(questions, attempts, query_rows)
        recent_question_ids = {attempt.exam_question_id for attempt in attempts[:3] if attempt.exam_question_id}
        readiness = self._readiness_components(attempts, query_rows)
        lecturer_guidance = self._active_exam_guidance(workspace_id)

        best: tuple[float, ExamQuestion] | None = None
        for question in questions:
            score = self._question_fit_score(question, focus_topics)
            if question.id in recent_question_ids:
                score -= 0.2
            if best is None or score > best[0]:
                best = (score, question)

        if best:
            question = best[1]
            payload = self._build_question_payload(
                question=question,
                focus_topics=focus_topics,
                lecturer_guidance=lecturer_guidance,
                readiness_score=readiness["readiness_score"],
                attempts=attempts,
                query_rows=query_rows,
            )
            if prefer_inspired:
                payload["inspired_variant"] = self._inspired_variant(question, focus_topics, workspace_id)
            return payload

        if not focus_topics:
            return None

        inspired_text = self._fallback_inspired_question(focus_topics)
        payload = {
            "id": None,
            "question_text": inspired_text,
            "question_number": None,
            "topic_label": focus_topics[0] if focus_topics else "exam practice",
            "marks": None,
            "origin_type": "inspired",
            "guidance": self._default_exam_guidance(focus_topics),
            "source_asset_id": None,
            "source_asset_title": None,
            "mark_scheme_available": False,
            "focus_topics": focus_topics,
            "rationale": "Generated from your recent weak topics because no uploaded past-paper question matched strongly enough.",
        }
        payload.update(
            self._recommendation_enrichment(
                question_text=inspired_text,
                question_number=None,
                marks=None,
                origin_type="inspired",
                source_asset_title=None,
                focus_topics=focus_topics,
                lecturer_guidance=lecturer_guidance,
                guidance=payload["guidance"],
                mark_scheme_available=False,
                exam_session=None,
                readiness_score=readiness["readiness_score"],
                attempts=attempts,
                query_rows=query_rows,
            )
        )
        return payload

    def resolve_question_for_query(
        self,
        workspace_id: str,
        user_id: str | None,
        query: str,
        *,
        requested_topics: list[str] | None = None,
        prefer_inspired: bool = False,
    ) -> dict[str, Any] | None:
        questions = self.list_exam_questions(workspace_id)
        if not questions:
            return self.recommend_question(
                workspace_id=workspace_id,
                user_id=user_id,
                prefer_inspired=prefer_inspired,
                requested_topics=requested_topics,
            )

        focus_topics = requested_topics or salient_terms(query, top_k=4)
        query_rows = self.db.fetchall(
            """
            SELECT query_text, response_status, metrics_json, created_at
            FROM query_events
            WHERE workspace_id = ? AND (? IS NULL OR user_id = ?)
            ORDER BY created_at DESC
            LIMIT 24
            """,
            (workspace_id, user_id, user_id),
        )
        attempts = self.list_attempts(workspace_id, user_id, limit=10) if user_id else []
        readiness = self._readiness_components(attempts, query_rows)
        lecturer_guidance = self._active_exam_guidance(workspace_id)

        specific = self._match_specific_question(questions, query)
        if specific:
            _, question, reason = specific
            payload = self._build_question_payload(
                question=question,
                focus_topics=focus_topics,
                lecturer_guidance=lecturer_guidance,
                readiness_score=readiness["readiness_score"],
                attempts=attempts,
                query_rows=query_rows,
            )
            payload["matched_specific_question"] = True
            payload["specific_match_reason"] = reason
            if prefer_inspired:
                payload["inspired_variant"] = self._inspired_variant(question, focus_topics, workspace_id)
            return payload

        return self.recommend_question(
            workspace_id=workspace_id,
            user_id=user_id,
            prefer_inspired=prefer_inspired,
            requested_topics=focus_topics,
        )

    def evaluate_answer(
        self,
        workspace_id: str,
        user_id: str,
        question_text: str,
        student_answer: str,
        exam_question_id: str | None = None,
    ) -> dict[str, Any]:
        question = None
        if exam_question_id:
            row = self.db.fetchone("SELECT * FROM exam_questions WHERE id = ? AND workspace_id = ?", (exam_question_id, workspace_id))
            question = self._row_to_question(row) if row else None

        hits = self.retrieval.retrieve(workspace_id=workspace_id, query=question_text, top_k=8)
        evidence = [
            {
                "asset_title": hit.chunk.asset_title,
                "asset_type": hit.chunk.asset_type,
                "locator": hit.chunk.metadata.get("locator"),
                "text": hit.chunk.text[:1200],
                "question_bank": hit.chunk.metadata.get("question_bank") or [],
            }
            for hit in hits[:6]
        ]
        support_score = round(sum(max(hit.final_score, 0.0) for hit in hits[:3]) / max(len(hits[:3]), 1), 4) if hits else 0.0
        evaluation = self._llm_evaluate(workspace_id, question_text, student_answer, question, evidence)
        score = float(evaluation.get("score", 0.0) or 0.0)
        score = round(min(max(score, 0.0), 1.0), 3)
        strengths = [clean_text(item) for item in evaluation.get("strengths", []) if clean_text(item)]
        improvements = [clean_text(item) for item in evaluation.get("improvements", []) if clean_text(item)]
        focus_topics = [clean_text(item) for item in evaluation.get("focus_topics", []) if clean_text(item)]
        if not focus_topics:
            focus_topics = salient_terms(f"{question_text} {' '.join(improvements)}", top_k=4)

        model_answer = clean_text(str(evaluation.get("model_answer", "") or "")) or "Use the cited evidence to structure a concise, directly supported answer."
        band = str(evaluation.get("band", "") or self._score_band(score))
        guidance = clean_text(str(evaluation.get("guidance", "") or "")) or self._default_exam_guidance(focus_topics)

        payload = {
            "workspace_id": workspace_id,
            "exam_question_id": exam_question_id,
            "question_text": question_text,
            "score": score,
            "score_percent": int(round(score * 100)),
            "band": band,
            "support_score": support_score,
            "strengths": strengths[:4],
            "improvements": improvements[:5],
            "focus_topics": focus_topics[:5],
            "model_answer": model_answer,
            "guidance": guidance,
            "evaluation_text": clean_text(str(evaluation.get("evaluation", "") or "")) or "Use stronger, more explicit evidence from Ikion's cited materials.",
            "readiness_score": self._readiness_after_attempt(workspace_id, user_id, score)["readiness_score"],
        }

        self._store_attempt(
            workspace_id=workspace_id,
            user_id=user_id,
            exam_question_id=exam_question_id,
            prompt_text=question_text,
            student_answer=student_answer,
            evaluation=payload,
        )
        return payload

    def build_personalized_guidance(self, workspace_id: str, user_id: str | None, query: str) -> str | None:
        prompt_context = self.build_prompt_context(workspace_id, user_id, query)
        if not prompt_context:
            return None
        focus_topics = prompt_context.get("focus_topics") or []
        guidance_bits = [
            f"Current exam readiness score: {prompt_context.get('readiness_score', 0)}/100.",
            f"Exam-prep readiness component: {prompt_context.get('exam_attempt_readiness_score', 0)}/100.",
            f"Ask Ikion exam-chat readiness component: {prompt_context.get('chat_readiness_score', 0)}/100.",
        ]
        if focus_topics:
            guidance_bits.append(f"Prioritize these weak areas when relevant: {', '.join(focus_topics[:4])}.")
        if prompt_context.get("recommended_question_title"):
            guidance_bits.append(f"Current recommended practice target: {prompt_context['recommended_question_title']}.")
        answer_framework = prompt_context.get("recommended_answer_framework") or []
        if answer_framework:
            guidance_bits.append(f"Use this exam structure: {' '.join(answer_framework[:3])}.")
        why_now = prompt_context.get("recommended_why_now") or []
        if why_now:
            guidance_bits.append(f"Why this matters now: {' '.join(why_now[:2])}.")
        guidance_bits.append(
            "When the user asks exam-style questions, answer in a mark-aware, exam-structured way, reinforce the weakest topics first, and make the coaching level match the current readiness."
        )
        return " ".join(guidance_bits)

    def _extract_questions_for_asset(self, asset_id: str) -> list[dict[str, Any]]:
        asset = self.ingestion.get_asset(asset_id)
        path = self.ingestion.ensure_local_content(asset_id)
        if not path:
            return []
        candidates: list[dict[str, Any]] = []
        current: dict[str, Any] | None = None
        for page in load_pdf_pages(path):
            page_number = int(page["page_number"])
            lines = [clean_text(line) for line in str(page["text"]).splitlines()]
            lines = [line for line in lines if line]
            for line in lines:
                marker = self._question_marker(line)
                if marker:
                    if current and len(current.get("question_text", "")) >= 24:
                        candidates.append(current)
                    current = {
                        "question_number": marker,
                        "question_text": line,
                        "page_number": page_number,
                    }
                    continue
                if current:
                    combined = clean_text(f"{current['question_text']} {line}")
                    current["question_text"] = combined[:2400]
            if current and current.get("page_number") == page_number and current.get("question_text", "").count("?") >= 1:
                current["question_text"] = clean_text(current["question_text"])
        if current and len(current.get("question_text", "")) >= 24:
            candidates.append(current)

        normalized_seen: set[str] = set()
        extracted: list[dict[str, Any]] = []
        for item in candidates:
            question_text = clean_text(item["question_text"])
            normalized = normalized_query_bucket(question_text)
            if not normalized or normalized in normalized_seen:
                continue
            normalized_seen.add(normalized)
            marks_match = re.search(r"\[(\d{1,2})\s*(?:marks?|pts?)\]", question_text, flags=re.IGNORECASE)
            marks = int(marks_match.group(1)) if marks_match else None
            topic_terms = salient_terms(question_text, top_k=3)
            extracted.append(
                {
                    "question_number": item.get("question_number"),
                    "question_text": question_text,
                    "normalized_question": normalized,
                    "topic_label": " / ".join(topic_terms[:2]) if topic_terms else None,
                    "difficulty": self._estimate_difficulty(question_text, marks),
                    "marks": marks,
                    "guidance": clean_text(str(asset.metadata.get("default_question_guidance") or "")) or None,
                    "metadata": {
                        "page_number": item.get("page_number"),
                        "document_category": "exam_paper",
                        "exam_session": asset.metadata.get("exam_session"),
                    },
                }
            )
        return extracted

    def _update_asset_sync_metadata(
        self,
        asset,
        sync_status: str,
        question_count: int,
        error: str | None,
    ) -> None:
        metadata = dict(asset.metadata)
        metadata["exam_sync_status"] = sync_status
        metadata["exam_question_count"] = question_count
        metadata["exam_sync_updated_at"] = utc_now_iso()
        if error:
            metadata["exam_sync_error"] = error
        else:
            metadata.pop("exam_sync_error", None)
        self.db.execute(
            "UPDATE assets SET metadata_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(metadata), metadata["exam_sync_updated_at"], asset.id),
        )
        asset.metadata = metadata

    def _sync_pending_workspace_assets(self, workspace_id: str) -> None:
        rows = self.db.fetchall(
            """
            SELECT id, metadata_json
            FROM assets
            WHERE workspace_id = ? AND asset_type = 'pdf'
            ORDER BY created_at ASC
            """,
            (workspace_id,),
        )
        for row in rows:
            try:
                metadata = json.loads(row["metadata_json"] or "{}")
            except Exception:
                metadata = {}
            category = str(metadata.get("document_category") or "").strip().lower()
            if category not in {"exam_paper", "mark_scheme"}:
                continue
            sync_status = str(metadata.get("exam_sync_status") or "").strip().lower()
            if sync_status in {"ready", "failed"}:
                continue
            self.sync_asset(row["id"])

    def _sync_asset_if_pending(self, asset_id: str) -> None:
        row = self.db.fetchone("SELECT metadata_json FROM assets WHERE id = ?", (asset_id,))
        if not row:
            return
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
        except Exception:
            metadata = {}
        if str(metadata.get("exam_sync_status") or "").strip().lower() in {"ready", "failed"}:
            return
        self.sync_asset(asset_id)

    @staticmethod
    def _question_marker(line: str) -> str | None:
        match = re.match(r"^(?:question|q)\s*([0-9]{1,2}[a-z]?)\b", line, flags=re.IGNORECASE)
        if match:
            return match.group(1).upper()
        match = re.match(r"^([0-9]{1,2}[a-z]?)\s*[\).:-]\s+", line, flags=re.IGNORECASE)
        if match and "page" not in line.lower():
            return match.group(1).upper()
        return None

    @staticmethod
    def _estimate_difficulty(question_text: str, marks: int | None) -> float:
        tokens = tokenize(question_text)
        score = min(len(tokens) / 30.0, 1.0)
        if marks:
            score = max(score, min(marks / 25.0, 1.0))
        if any(word in tokens for word in ("compare", "evaluate", "critically", "analyse", "justify")):
            score = min(score + 0.18, 1.0)
        return round(max(score, 0.25), 3)

    def _replace_uploaded_questions(self, workspace_id: str, source_asset_id: str, questions: list[dict[str, Any]]) -> None:
        now = utc_now_iso()
        with self.db.transaction() as conn:
            conn.execute("DELETE FROM exam_questions WHERE workspace_id = ? AND source_asset_id = ?", (workspace_id, source_asset_id))
            for item in questions:
                conn.execute(
                    """
                    INSERT INTO exam_questions (
                        id, workspace_id, source_asset_id, mark_scheme_asset_id, question_number, question_text,
                        normalized_question, topic_label, difficulty, marks, origin_type, source_question_id,
                        guidance, metadata_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        make_id("examq"),
                        workspace_id,
                        source_asset_id,
                        None,
                        item.get("question_number"),
                        item["question_text"],
                        item["normalized_question"],
                        item.get("topic_label"),
                        float(item.get("difficulty", 0.5) or 0.5),
                        item.get("marks"),
                        "uploaded",
                        None,
                        item.get("guidance"),
                        json.dumps(item.get("metadata") or {}),
                        now,
                        now,
                    ),
                )

    def _focus_topics_from_history(
        self,
        questions: list[ExamQuestion],
        attempts: list[ExamAttempt],
        query_rows: list[Any],
    ) -> list[str]:
        counter: Counter[str] = Counter()
        for attempt in attempts[:6]:
            weight = max(1, int(round((1.0 - attempt.score) * 5)))
            for topic in attempt.focus_topics[:4]:
                cleaned = self._clean_focus_topic(topic)
                if cleaned:
                    counter[cleaned] += weight
        for row in query_rows[:10]:
            try:
                metrics = json.loads(row["metrics_json"] or "{}")
            except Exception:
                metrics = {}
            is_exam_related = bool(metrics.get("exam_related")) or self.is_exam_related_query(row["query_text"])
            weak_exam_chat = is_exam_related and float(metrics.get("chat_readiness_score", 0.0) or 0.0) < 0.45
            if weak_exam_chat or row["response_status"] in {"partial", "refused", "error"} or float(metrics.get("support_score", 0.0) or 0.0) < 0.25:
                for token in salient_terms(row["query_text"], top_k=3):
                    cleaned = self._clean_focus_topic(token)
                    if cleaned:
                        counter[cleaned] += 2
                for topic in metrics.get("chat_focus_topics", []) or []:
                    cleaned = self._clean_focus_topic(topic)
                    if cleaned:
                        counter[cleaned] += 2
        if not counter and questions:
            for question in questions[:4]:
                cleaned = self._clean_focus_topic(question.topic_label)
                if cleaned:
                    counter[cleaned] += 1
        return [topic for topic, _ in counter.most_common(5)]

    def _readiness_components(self, attempts: list[ExamAttempt], query_rows: list[Any]) -> dict[str, int]:
        attempt_readiness = self._attempt_readiness_score(attempts)
        chat_readiness, chat_activity_count = self._chat_readiness_score(query_rows)

        if attempt_readiness and chat_readiness:
            readiness_score = int(round((attempt_readiness * 0.97) + (chat_readiness * 0.03)))
        elif attempt_readiness:
            readiness_score = attempt_readiness
        else:
            readiness_score = min(chat_readiness, 5)

        if len(attempts) == 0:
            readiness_score = min(readiness_score, 5)
        elif len(attempts) == 1:
            readiness_score = min(readiness_score, 10)
        elif len(attempts) == 2:
            readiness_score = min(readiness_score, 18)
        elif len(attempts) == 3:
            readiness_score = min(readiness_score, 28)
        elif len(attempts) == 4:
            readiness_score = min(readiness_score, 40)
        elif len(attempts) == 5:
            readiness_score = min(readiness_score, 55)

        return {
            "readiness_score": max(0, min(100, readiness_score)),
            "exam_attempt_readiness_score": attempt_readiness,
            "chat_readiness_score": chat_readiness,
            "chat_activity_count": chat_activity_count,
        }

    def _readiness_after_attempt(self, workspace_id: str, user_id: str, latest_score: float) -> dict[str, int]:
        attempts = self.list_attempts(workspace_id, user_id, limit=5)
        synthetic = attempts[:4]
        synthetic.insert(
            0,
            ExamAttempt(
                id="synthetic",
                workspace_id=workspace_id,
                user_id=user_id,
                exam_question_id=None,
                prompt_text="",
                student_answer="",
                evaluation_text="",
                score=latest_score,
                rubric={},
                strengths=[],
                improvements=[],
                focus_topics=[],
                metadata={},
                created_at=utc_now_iso(),
                updated_at=utc_now_iso(),
            ),
        )
        query_rows = self.db.fetchall(
            """
            SELECT query_text, response_status, metrics_json, created_at
            FROM query_events
            WHERE workspace_id = ? AND user_id = ?
            ORDER BY created_at DESC
            LIMIT 12
            """,
            (workspace_id, user_id),
        )
        return self._readiness_components(synthetic, query_rows)

    def _attempt_readiness_score(self, attempts: list[ExamAttempt]) -> int:
        if not attempts:
            return 0
        recent = attempts[:6]
        weighted_score = self._weighted_average([attempt.score for attempt in recent])
        weighted_support = self._weighted_average([
            float((attempt.rubric or {}).get("support_score", 0.0) or 0.0)
            for attempt in recent
        ])
        weights = self._decay_weights(len(recent))
        variance = self._weighted_variance([attempt.score for attempt in recent], weights, weighted_score)
        consistency_penalty = min((variance ** 0.5) * 28.0, 26.0)
        evidence_penalty = min(max(0.75 - weighted_support, 0.0) * 70.0, 45.0)
        mastery = max(0.0, (weighted_score * 100.0) - consistency_penalty - evidence_penalty)
        confidence = min(len(recent) / 8.0, 1.0)
        readiness = mastery * (0.08 + (0.92 * confidence))
        if weighted_score < 0.65:
            readiness *= 0.45
        elif weighted_score < 0.75:
            readiness *= 0.65
        elif weighted_score < 0.85:
            readiness *= 0.82
        if len(recent) == 1:
            readiness = min(readiness, 8.0)
        elif len(recent) == 2:
            readiness = min(readiness, 14.0)
        elif len(recent) == 3:
            readiness = min(readiness, 22.0)
        elif len(recent) == 4:
            readiness = min(readiness, 32.0)
        elif len(recent) == 5:
            readiness = min(readiness, 45.0)
        return max(0, min(100, int(round(readiness))))

    def _chat_readiness_score(self, query_rows: list[Any]) -> tuple[int, int]:
        scores: list[float] = []
        for row in query_rows[:12]:
            try:
                metrics = json.loads(row["metrics_json"] or "{}")
            except Exception:
                metrics = {}
            is_exam_related = bool(metrics.get("exam_related")) or self.is_exam_related_query(row["query_text"])
            if not is_exam_related:
                continue
            if metrics.get("chat_readiness_score") is not None:
                score = float(metrics.get("chat_readiness_score", 0.0) or 0.0)
            else:
                score = self._legacy_chat_readiness_score(
                    row["query_text"],
                    row["response_status"],
                    float(metrics.get("support_score", 0.0) or 0.0),
                )
            scores.append(min(max(score, 0.0), 1.0))
        if not scores:
            return 0, 0
        weighted = self._weighted_average(scores)
        activity_count = len(scores)
        confidence = min(activity_count / 8.0, 1.0)
        readiness = (weighted * 100.0) * (0.03 + (0.12 * confidence))
        if activity_count == 1:
            readiness = min(readiness, 2.0)
        elif activity_count <= 3:
            readiness = min(readiness, 4.0)
        elif activity_count <= 6:
            readiness = min(readiness, 7.0)
        else:
            readiness = min(readiness, 10.0)
        return max(0, min(100, int(round(readiness)))), activity_count

    @staticmethod
    def _weighted_average(scores: list[float]) -> float:
        if not scores:
            return 0.0
        weights = ExamPracticeService._decay_weights(len(scores))
        total = 0.0
        divisor = 0.0
        for index, score in enumerate(scores):
            weight = weights[index]
            total += score * weight
            divisor += weight
        return total / max(divisor, 1e-9)

    @staticmethod
    def _decay_weights(length: int) -> list[float]:
        base = [1.0, 0.84, 0.68, 0.56, 0.46, 0.38]
        if length <= len(base):
            return base[:length]
        weights = base[:]
        while len(weights) < length:
            weights.append(max(weights[-1] - 0.05, 0.2))
        return weights[:length]

    @staticmethod
    def _weighted_variance(scores: list[float], weights: list[float], mean: float) -> float:
        if not scores or not weights:
            return 0.0
        numerator = 0.0
        denominator = 0.0
        for score, weight in zip(scores, weights):
            numerator += weight * ((score - mean) ** 2)
            denominator += weight
        return numerator / max(denominator, 1e-9)

    def _legacy_chat_readiness_score(self, query: str, status: str, support_score: float) -> float:
        answer_attempt = self._extract_chat_answer_text(query) is not None
        status_adjustment = {
            "answered": 0.03,
            "partial": -0.04,
            "refused": -0.16,
            "error": -0.22,
        }.get(status, -0.08)
        if answer_attempt:
            return min(max((support_score * 0.44) + 0.02 + status_adjustment, 0.0), 0.72)
        return min(max((support_score * 0.28) + status_adjustment, 0.0), 0.5)

    @staticmethod
    def _proficiency_band(readiness_score: int) -> str:
        if readiness_score <= 0:
            return "starting"
        if readiness_score >= 92:
            return "strong"
        if readiness_score >= 80:
            return "developing"
        if readiness_score >= 65:
            return "emerging"
        return "building"

    @staticmethod
    def _score_band(score: float) -> str:
        if score >= 0.8:
            return "strong"
        if score >= 0.6:
            return "developing"
        return "building"

    def _focus_topics_from_hits(self, query: str, hits: list[Any]) -> list[str]:
        counter: Counter[str] = Counter()
        for hit in hits[:5]:
            for topic in hit.chunk.metadata.get("salient_terms") or []:
                cleaned = self._clean_focus_topic(topic)
                if cleaned:
                    counter[cleaned] += 2
        for topic in salient_terms(query, top_k=4):
            cleaned = self._clean_focus_topic(topic)
            if cleaned:
                counter[cleaned] += 1
        return [topic for topic, _ in counter.most_common(5)]

    @staticmethod
    def _clean_focus_topic(topic: Any) -> str | None:
        cleaned = clean_text(str(topic or ""))
        if not cleaned:
            return None
        tokens = [token for token in tokenize(cleaned) if token not in EXAM_TOPIC_FILLER]
        if not tokens:
            return None
        if len(tokens) == 1:
            return tokens[0]
        return " ".join(tokens[:3])

    @staticmethod
    def _extract_chat_answer_text(query: str) -> str | None:
        cleaned = clean_text(query)
        lowered = cleaned.lower()
        if not any(marker in lowered for marker in CHAT_ANSWER_MARKERS):
            return None

        qa_match = re.search(r"question:\s*(.+?)\s+answer:\s*(.+)", cleaned, flags=re.IGNORECASE)
        if qa_match:
            answer_text = clean_text(qa_match.group(2))
            return answer_text or None

        answer_match = re.search(
            r"(?:my answer|my attempt|here is my answer|here's my answer|answer)\s*[:\-]\s*(.+)",
            cleaned,
            flags=re.IGNORECASE,
        )
        if answer_match:
            answer_text = clean_text(answer_match.group(1))
            return answer_text or None
        return None

    def _recommendation_enrichment(
        self,
        *,
        question_text: str,
        question_number: str | None,
        marks: int | None,
        origin_type: str,
        source_asset_title: str | None,
        focus_topics: list[str],
        lecturer_guidance: list[str],
        guidance: str | None,
        mark_scheme_available: bool,
        exam_session: str | None,
        readiness_score: int,
        attempts: list[ExamAttempt],
        query_rows: list[Any],
    ) -> dict[str, Any]:
        command_word = self._command_word(question_text)
        return {
            "paper_label": self._paper_label(source_asset_title, question_number, exam_session, origin_type),
            "command_word": command_word,
            "task_summary": self._task_summary(question_text),
            "answer_framework": self._answer_framework(command_word, focus_topics, guidance, mark_scheme_available),
            "why_this_now": self._why_this_now(focus_topics, readiness_score, attempts, query_rows, mark_scheme_available),
            "lecturer_focus": [clean_text(item) for item in lecturer_guidance[:3] if clean_text(item)],
        }

    @staticmethod
    def _command_word(question_text: str) -> str | None:
        lowered = clean_text(question_text).lower()
        for word in COMMAND_WORDS:
            if lowered.startswith(word) or re.search(rf"\b{re.escape(word)}\b", lowered):
                return word.capitalize()
        return None

    @staticmethod
    def _task_summary(question_text: str) -> str:
        cleaned = clean_text(re.sub(r"^(?:question|q)\s*[0-9]{1,2}[a-z]?\s*[:.)-]?\s*", "", question_text, flags=re.IGNORECASE))
        cleaned = re.sub(r"\[(\d{1,2})\s*(?:marks?|pts?)\]", "", cleaned, flags=re.IGNORECASE)
        sentences = split_sentences(cleaned)
        if sentences:
            return sentences[0][:180]
        return cleaned[:180]

    @staticmethod
    def _paper_label(
        source_asset_title: str | None,
        question_number: str | None,
        exam_session: str | None,
        origin_type: str,
    ) -> str | None:
        if origin_type != "uploaded":
            return "Inspired practice variant"
        bits = [clean_text(bit) for bit in (source_asset_title, exam_session) if clean_text(str(bit or ""))]
        if question_number:
            bits.append(f"Q{question_number}")
        return " · ".join(bits) if bits else None

    @staticmethod
    def _answer_framework(
        command_word: str | None,
        focus_topics: list[str],
        guidance: str | None,
        mark_scheme_available: bool,
    ) -> list[str]:
        framework: list[str] = []
        lowered = (command_word or "").lower()
        if lowered in {"compare", "contrast"}:
            framework.extend(
                [
                    "Define the two things you are comparing before making any judgement.",
                    "Build paired comparison points instead of describing each side in isolation.",
                    "End with the most important difference or trade-off.",
                ]
            )
        elif lowered in {"evaluate", "critically", "justify"}:
            framework.extend(
                [
                    "State the core claim first, then test it with evidence-backed points.",
                    "Weigh strengths against limitations instead of listing facts only.",
                    "Finish with a justified judgement tied directly to the question wording.",
                ]
            )
        else:
            framework.extend(
                [
                    "Open with the direct answer or definition the marker is looking for.",
                    "Develop two or three precise points with evidence from lectures or exam materials.",
                    "Finish by applying the idea to an example or consequence.",
                ]
            )
        if focus_topics:
            framework.append(f"Make your strongest evidence come from: {', '.join(focus_topics[:3])}.")
        if guidance:
            framework.append(clean_text(guidance))
        if mark_scheme_available:
            framework.append("After attempting it, compare your structure against the linked mark scheme.")
        return framework[:4]

    def _why_this_now(
        self,
        focus_topics: list[str],
        readiness_score: int,
        attempts: list[ExamAttempt],
        query_rows: list[Any],
        mark_scheme_available: bool,
    ) -> list[str]:
        reasons: list[str] = []
        if focus_topics:
            reasons.append(f"It targets the topics Ikion currently sees as weakest: {', '.join(focus_topics[:3])}.")
        if attempts:
            recent_average = sum(attempt.score for attempt in attempts[:3]) / len(attempts[:3])
            if recent_average < 0.6:
                reasons.append("Your recent exam-prep attempts still need tighter structure and stronger evidence selection.")
            elif recent_average >= 0.8:
                reasons.append("You are handling direct past-paper questions well enough to stretch into more transfer-style practice.")
        weak_exam_chats = 0
        for row in query_rows[:8]:
            try:
                metrics = json.loads(row["metrics_json"] or "{}")
            except Exception:
                metrics = {}
            if metrics.get("exam_related") and float(metrics.get("chat_readiness_score", 0.0) or 0.0) < 0.45:
                weak_exam_chats += 1
        if weak_exam_chats:
            reasons.append("Your recent Ask Ikion exam interactions show the same topic still needs reinforcement.")
        if mark_scheme_available:
            reasons.append("A linked mark scheme makes this a good checkpoint question for clean self-correction.")
        if not reasons:
            reasons.append(f"This is the best next fit for your current readiness level of {readiness_score}%.")
        return reasons[:3]

    def _question_fit_score(self, question: ExamQuestion, focus_topics: list[str]) -> float:
        score = question.difficulty * 0.15
        haystack = f"{question.question_text} {question.topic_label or ''}".lower()
        for topic in focus_topics:
            if topic.lower() in haystack:
                score += 1.2
            else:
                overlap = len(set(tokenize(topic)).intersection(tokenize(haystack)))
                score += overlap * 0.25
        if question.mark_scheme_asset_id:
            score += 0.15
        return score

    def _match_specific_question(
        self,
        questions: list[ExamQuestion],
        query: str,
    ) -> tuple[float, ExamQuestion, str] | None:
        lowered_query = clean_text(query).lower()
        query_tokens = set(tokenize(lowered_query))
        explicit_refs = self._extract_question_number_refs(lowered_query)

        best: tuple[float, ExamQuestion, str] | None = None
        for question in questions:
            score = 0.0
            reasons: list[str] = []

            number = clean_text(str(question.question_number or "")).lower()
            if number:
                q_aliases = {
                    number,
                    f"q{number}",
                    f"question {number}",
                }
                if explicit_refs and any(ref in q_aliases for ref in explicit_refs):
                    score += 3.8
                    reasons.append("explicit_question_number")
                elif any(alias in lowered_query for alias in q_aliases):
                    score += 2.2
                    reasons.append("question_number_text_match")

            question_tokens = set(tokenize(question.question_text))
            topic_tokens = set(tokenize(question.topic_label or ""))
            overlap = len(query_tokens.intersection(question_tokens.union(topic_tokens)))
            if overlap:
                score += min(overlap * 0.25, 1.6)
                reasons.append("content_overlap")

            if question.source_asset_id:
                asset = self.db.fetchone("SELECT title FROM assets WHERE id = ?", (question.source_asset_id,))
                source_title = clean_text(str(asset["title"])) if asset else ""
                if source_title:
                    title_tokens = set(tokenize(source_title))
                    title_overlap = len(query_tokens.intersection(title_tokens))
                    if title_overlap >= 2:
                        score += min(1.8, 0.7 + (0.2 * title_overlap))
                        reasons.append("source_title_overlap")
                    elif source_title.lower() in lowered_query:
                        score += 1.5
                        reasons.append("source_title_exact")

            if score <= 0.0:
                continue
            reason = ",".join(reasons) if reasons else "weak_match"
            if best is None or score > best[0]:
                best = (score, question, reason)

        if not best:
            return None
        threshold = 1.9 if explicit_refs else 2.3
        if best[0] < threshold:
            return None
        return best

    @staticmethod
    def _extract_question_number_refs(query: str) -> set[str]:
        refs: set[str] = set()
        for match in re.findall(r"\bq(?:uestion)?\s*([0-9]{1,2}[a-z]?)\b", query, flags=re.IGNORECASE):
            refs.add(clean_text(match).lower())
        return refs

    def _build_question_payload(
        self,
        *,
        question: ExamQuestion,
        focus_topics: list[str],
        lecturer_guidance: list[str],
        readiness_score: int,
        attempts: list[ExamAttempt],
        query_rows: list[Any],
    ) -> dict[str, Any]:
        source_asset_title = None
        if question.source_asset_id:
            asset = self.db.fetchone("SELECT title FROM assets WHERE id = ?", (question.source_asset_id,))
            source_asset_title = asset["title"] if asset else None
        payload = {
            "id": question.id,
            "question_text": question.question_text,
            "question_number": question.question_number,
            "topic_label": question.topic_label,
            "marks": question.marks,
            "origin_type": question.origin_type,
            "guidance": question.guidance,
            "source_asset_id": question.source_asset_id,
            "source_asset_title": source_asset_title,
            "mark_scheme_available": bool(question.mark_scheme_asset_id),
            "focus_topics": focus_topics,
            "rationale": self._recommendation_rationale(question, focus_topics),
            "aliases": self._question_aliases(question.question_number, source_asset_title),
        }
        payload.update(
            self._recommendation_enrichment(
                question_text=question.question_text,
                question_number=question.question_number,
                marks=question.marks,
                origin_type=question.origin_type,
                source_asset_title=source_asset_title,
                focus_topics=focus_topics,
                lecturer_guidance=lecturer_guidance,
                guidance=question.guidance,
                mark_scheme_available=bool(question.mark_scheme_asset_id),
                exam_session=str(question.metadata.get("exam_session") or "") or None,
                readiness_score=readiness_score,
                attempts=attempts,
                query_rows=query_rows,
            )
        )
        return payload

    @staticmethod
    def _question_aliases(question_number: str | None, source_asset_title: str | None) -> list[str]:
        aliases: list[str] = []
        number = clean_text(str(question_number or "")).lower()
        if number:
            aliases.extend([f"q{number}", f"question {number}"])
        title = clean_text(str(source_asset_title or "")).lower()
        if title and number:
            title_tokens = tokenize(title)
            if title_tokens:
                aliases.append(f"{' '.join(title_tokens[:2])} q{number}")
        deduped: list[str] = []
        seen: set[str] = set()
        for alias in aliases:
            cleaned = clean_text(alias).lower()
            if not cleaned or cleaned in seen:
                continue
            seen.add(cleaned)
            deduped.append(cleaned)
        return deduped[:6]

    @staticmethod
    def _recommendation_rationale(question: ExamQuestion, focus_topics: list[str]) -> str:
        if focus_topics:
            return f"Recommended because it targets your current focus areas: {', '.join(focus_topics[:3])}."
        if question.topic_label:
            return f"Recommended because it reinforces {question.topic_label}."
        return "Recommended from the uploaded exam-paper bank."

    def _inspired_variant(self, question: ExamQuestion, focus_topics: list[str], workspace_id: str) -> dict[str, Any]:
        lecturer_exam_guidance = self._active_exam_guidance(workspace_id)
        generated = self._llm_inspired_question(question.question_text, focus_topics, lecturer_exam_guidance)
        if not generated:
            generated = self._fallback_inspired_question(focus_topics or [question.topic_label or "the core topic"], source_question=question.question_text)
        return {
            "question_text": generated,
            "origin_type": "inspired",
            "source_question_id": question.id,
            "source_question_text": question.question_text,
        }

    def _llm_inspired_question(self, source_question: str, focus_topics: list[str], guidance_texts: list[str]) -> str | None:
        if not self.config.openai_api_key:
            return None
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.config.openai_api_key)
            prompt = (
                "Create one new exam-style question inspired by the source question. "
                "Keep it aligned to the same module, test the same kind of reasoning, "
                "and bias it toward these focus topics: "
                f"{', '.join(focus_topics) if focus_topics else 'none'}. "
                "Use lecturer guidance only to shape emphasis.\n\n"
                f"Source question:\n{source_question}\n\n"
                f"Lecturer guidance:\n{chr(10).join(f'- {item}' for item in guidance_texts[:4]) or '- none'}"
            )
            response = client.chat.completions.create(
                model=self.config.openai_chat_model,
                temperature=0.4,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": "Return JSON with a single key question containing the new exam-style question."},
                    {"role": "user", "content": prompt},
                ],
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            question = clean_text(str(payload.get("question", "") or ""))
            return question or None
        except Exception:
            return None

    def _llm_evaluate(
        self,
        workspace_id: str,
        question_text: str,
        student_answer: str,
        question: ExamQuestion | None,
        evidence: list[dict[str, Any]],
    ) -> dict[str, Any]:
        if not self.config.openai_api_key:
            return self._heuristic_evaluation(question_text, student_answer, question, evidence)
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.config.openai_api_key)
            guidance_lines = self._active_exam_guidance(workspace_id, include_workspace=False)
            evidence_text = "\n\n".join(
                f"{item['asset_title']} | {item.get('locator') or 'no locator'}\n{item['text']}"
                for item in evidence[:6]
            )
            prompt = (
                "Evaluate the student's answer to an exam-style question using only the grounded evidence.\n"
                "Return JSON with keys: score, band, strengths, improvements, focus_topics, model_answer, guidance, evaluation.\n"
                f"Question:\n{question_text}\n\n"
                f"Question guidance:\n{question.guidance if question and question.guidance else 'none'}\n\n"
                f"Workspace exam guidance:\n{chr(10).join(f'- {item}' for item in guidance_lines[:4]) or '- none'}\n\n"
                f"Student answer:\n{student_answer}\n\n"
                f"Evidence:\n{evidence_text}"
            )
            response = client.chat.completions.create(
                model=self.config.openai_chat_model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an exacting but constructive exam tutor. "
                            "Score from 0 to 1. Keep strengths and improvements concise and specific."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            if isinstance(payload, dict) and payload:
                return payload
        except Exception:
            pass
        return self._heuristic_evaluation(question_text, student_answer, question, evidence)

    def _heuristic_evaluation(
        self,
        question_text: str,
        student_answer: str,
        question: ExamQuestion | None,
        evidence: list[dict[str, Any]],
    ) -> dict[str, Any]:
        answer_tokens = set(tokenize(student_answer))
        evidence_tokens = set()
        for item in evidence[:4]:
            evidence_tokens.update(tokenize(item["text"]))
        overlap = len(answer_tokens.intersection(evidence_tokens)) / max(len(answer_tokens), 1)
        score = round(min(max(overlap + 0.18, 0.15), 0.9), 3)
        focus_topics = salient_terms(f"{question_text} {' '.join(item['text'] for item in evidence[:2])}", top_k=4)
        return {
            "score": score,
            "band": self._score_band(score),
            "strengths": ["You addressed the main topic of the question.", "Your answer uses some language that overlaps with the taught material."],
            "improvements": [
                "Use more explicit evidence from lectures, notes, or mark-scheme-aligned material.",
                "Structure the answer around clear points instead of one continuous explanation.",
            ],
            "focus_topics": focus_topics,
            "model_answer": "Start with a direct definition, develop two evidence-backed points, then finish with a short example or comparison.",
            "guidance": question.guidance if question and question.guidance else self._default_exam_guidance(focus_topics),
            "evaluation": "Your answer is on the right topic, but it needs tighter structure and stronger grounding in the uploaded materials.",
        }

    def _store_attempt(
        self,
        workspace_id: str,
        user_id: str,
        exam_question_id: str | None,
        prompt_text: str,
        student_answer: str,
        evaluation: dict[str, Any],
    ) -> None:
        now = utc_now_iso()
        attempt = ExamAttempt(
            id=make_id("attempt"),
            workspace_id=workspace_id,
            user_id=user_id,
            exam_question_id=exam_question_id,
            prompt_text=prompt_text,
            student_answer=student_answer,
            evaluation_text=evaluation["evaluation_text"],
            score=float(evaluation["score"]),
            rubric={
                "band": evaluation["band"],
                "score_percent": evaluation["score_percent"],
                "support_score": evaluation["support_score"],
            },
            strengths=evaluation["strengths"],
            improvements=evaluation["improvements"],
            focus_topics=evaluation["focus_topics"],
            metadata={
                "guidance": evaluation["guidance"],
                "model_answer": evaluation["model_answer"],
            },
            created_at=now,
            updated_at=now,
        )
        self.db.execute(
            """
            INSERT INTO exam_attempts (
                id, workspace_id, user_id, exam_question_id, prompt_text, student_answer, evaluation_text, score,
                rubric_json, strengths_json, improvements_json, focus_topics_json, metadata_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                attempt.id,
                attempt.workspace_id,
                attempt.user_id,
                attempt.exam_question_id,
                attempt.prompt_text,
                attempt.student_answer,
                attempt.evaluation_text,
                attempt.score,
                json.dumps(attempt.rubric),
                json.dumps(attempt.strengths),
                json.dumps(attempt.improvements),
                json.dumps(attempt.focus_topics),
                json.dumps(attempt.metadata),
                attempt.created_at,
                attempt.updated_at,
            ),
        )

    def _active_exam_guidance(self, workspace_id: str, include_workspace: bool = True) -> list[str]:
        packs = self.guidance.get_active_guidance_packs(workspace_id) if workspace_id else []
        selected: list[str] = []
        for pack in packs:
            scope = str(pack.metadata.get("scope") or "workspace").strip().lower()
            if scope == "exam_general" or (include_workspace and scope == "workspace"):
                selected.append(pack.instructions)
        return selected

    @staticmethod
    def _default_exam_guidance(focus_topics: list[str]) -> str:
        if focus_topics:
            return f"Prioritize explicit definitions, clear steps, and direct evidence for: {', '.join(focus_topics[:3])}."
        return "Lead with the core idea, structure points clearly, and support each point with taught material."

    @staticmethod
    def _fallback_inspired_question(focus_topics: list[str], source_question: str | None = None) -> str:
        primary = focus_topics[0] if focus_topics else "the core topic"
        if source_question:
            return f"In a past-paper style, explain and apply {primary} to a realistic scenario inspired by: {source_question}"
        return f"Using a concrete example from the module, explain how {primary} should be applied and justify your reasoning."

    @staticmethod
    def _row_to_question(row) -> ExamQuestion:
        metadata = json.loads(row["metadata_json"] or "{}")
        return ExamQuestion(
            id=row["id"],
            workspace_id=row["workspace_id"],
            source_asset_id=row["source_asset_id"],
            mark_scheme_asset_id=row["mark_scheme_asset_id"],
            question_number=row["question_number"],
            question_text=row["question_text"],
            normalized_question=row["normalized_question"],
            topic_label=row["topic_label"],
            difficulty=float(row["difficulty"] or 0.5),
            marks=int(row["marks"]) if row["marks"] is not None else None,
            origin_type=row["origin_type"],
            source_question_id=row["source_question_id"],
            guidance=row["guidance"],
            metadata=metadata,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _row_to_attempt(row) -> ExamAttempt:
        return ExamAttempt(
            id=row["id"],
            workspace_id=row["workspace_id"],
            user_id=row["user_id"],
            exam_question_id=row["exam_question_id"],
            prompt_text=row["prompt_text"],
            student_answer=row["student_answer"],
            evaluation_text=row["evaluation_text"],
            score=float(row["score"] or 0.0),
            rubric=json.loads(row["rubric_json"] or "{}"),
            strengths=json.loads(row["strengths_json"] or "[]"),
            improvements=json.loads(row["improvements_json"] or "[]"),
            focus_topics=json.loads(row["focus_topics_json"] or "[]"),
            metadata=json.loads(row["metadata_json"] or "{}"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
