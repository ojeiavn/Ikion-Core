from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..config import OrionConfig
from ..utils.text import clean_text, salient_terms, tokenize
from .conversation_graph import TurnPlan
from .exam_practice import ExamPracticeService


EXAM_CHAT_TERMS = {
    "exam",
    "exams",
    "past",
    "paper",
    "practice",
    "question",
    "questions",
    "revision",
    "markscheme",
    "marks",
    "grade",
    "grading",
    "evaluate",
    "mark",
}

QUESTION_REQUEST_PATTERNS = (
    "exam-style question",
    "exam style question",
    "exam question",
    "past paper question",
    "give me a question",
    "set me a question",
    "ask me a question",
    "quiz me",
    "practice question",
    "mock question",
)

QUESTION_WALKTHROUGH_PATTERNS = (
    "walk me through",
    "step by step",
    "how should i answer",
    "how do i answer",
    "mark scheme",
    "marking scheme",
    "for q",
    "question q",
)

UPLOADED_SOURCE_PATTERNS = (
    "from uploaded exam",
    "from uploaded paper",
    "from the uploaded paper",
    "from the uploaded exam",
    "directly from uploaded",
    "from past paper",
    "from a past paper",
    "actual past paper",
)

INSPIRED_SOURCE_PATTERNS = (
    "inspired",
    "similar style",
    "similar to",
    "new variant",
    "different variant",
    "generate one",
    "make one up",
)

TOPIC_FILLER = {
    "exam",
    "exams",
    "paper",
    "past",
    "question",
    "questions",
    "practice",
    "style",
    "please",
    "give",
    "make",
    "from",
    "using",
    "module",
    "workspace",
    "content",
    "help",
    "and",
}


@dataclass(slots=True)
class ExamChatSubagentResult:
    exam_related: bool
    intent: str = "none"
    source_preference: str = "auto"
    requires_deep_thinking: bool = False
    requested_topics: list[str] = field(default_factory=list)
    selected_question: dict[str, Any] | None = None
    retrieval_query_hint: str | None = None
    instructions: list[str] = field(default_factory=list)

    def prompt_context(self) -> dict[str, Any]:
        question = self.selected_question or {}
        return {
            "exam_related": self.exam_related,
            "intent": self.intent,
            "source_preference": self.source_preference,
            "requires_deep_thinking": self.requires_deep_thinking,
            "requested_topics": self.requested_topics,
            "selected_question_text": question.get("question_text"),
            "selected_question_origin": question.get("origin_type"),
            "selected_question_label": question.get("paper_label") or question.get("source_asset_title"),
            "selected_question_marks": question.get("marks"),
            "selected_question_topic": question.get("topic_label"),
            "selected_question_number": question.get("question_number"),
            "selected_question_guidance": question.get("guidance"),
            "selected_question_aliases": question.get("aliases") or [],
            "selected_answer_framework": question.get("answer_framework") or [],
            "instructions": self.instructions,
            "retrieval_query_hint": self.retrieval_query_hint,
        }

    def prompt_context_patch(self) -> dict[str, Any]:
        if not self.selected_question:
            return {}
        question = self.selected_question
        patch = {
            "recommended_question_title": question.get("paper_label") or question.get("task_summary"),
            "recommended_question_text": question.get("question_text"),
            "recommended_answer_framework": question.get("answer_framework") or [],
            "recommended_why_now": question.get("why_this_now") or [],
        }
        graph_terms = [item for item in self.requested_topics[:4] if item]
        number = clean_text(str(question.get("question_number") or ""))
        if number:
            graph_terms.extend([f"q{number.lower()}", f"question {number.lower()}"])
        for alias in question.get("aliases") or []:
            cleaned = clean_text(str(alias))
            if cleaned:
                graph_terms.append(cleaned)
        if graph_terms:
            deduped: list[str] = []
            seen: set[str] = set()
            for term in graph_terms:
                key = term.lower()
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(term)
            patch["graph_focus_terms"] = deduped[:6]
        return patch

    def metrics(self) -> dict[str, Any]:
        return {
            "exam_subagent_used": self.exam_related,
            "exam_subagent_intent": self.intent,
            "exam_subagent_source_preference": self.source_preference,
            "exam_subagent_topic_count": len(self.requested_topics),
            "exam_subagent_selected_origin": (self.selected_question or {}).get("origin_type"),
            "exam_subagent_selected_question_id": (self.selected_question or {}).get("id"),
        }


class ExamChatSubagentService:
    def __init__(self, config: OrionConfig, exam_practice: ExamPracticeService):
        self.config = config
        self.exam_practice = exam_practice

    def analyze(
        self,
        workspace_id: str,
        user_id: str | None,
        query: str,
        turn_plan: TurnPlan | None = None,
    ) -> ExamChatSubagentResult:
        cleaned = clean_text(query)
        lowered = cleaned.lower()
        exam_related = self._is_exam_related(cleaned)
        if not exam_related:
            return ExamChatSubagentResult(exam_related=False)

        requested_topics = self._extract_topics(cleaned, turn_plan)
        source_preference = self._source_preference(lowered)
        wants_question = self._is_question_request(lowered)
        wants_walkthrough = self._is_question_walkthrough(lowered)
        intent = "question_generation" if wants_question else ("question_walkthrough" if wants_walkthrough else "exam_guidance")
        selected_question: dict[str, Any] | None = None
        retrieval_hint: str | None = None
        instructions = [
            "Treat this as an exam-focused turn.",
            "Prioritize correctness, mark-aware structure, and evidence-backed coaching.",
        ]

        if wants_question or wants_walkthrough:
            prefer_inspired = source_preference == "inspired"
            recommendation = self.exam_practice.resolve_question_for_query(
                workspace_id=workspace_id,
                user_id=user_id,
                query=cleaned,
                requested_topics=requested_topics or None,
                prefer_inspired=prefer_inspired,
            )
            selected_question = self._select_question_payload(recommendation, source_preference)
            if selected_question:
                retrieval_hint = (clean_text(str(selected_question.get("question_text") or "")) or None)
                if retrieval_hint:
                    retrieval_hint = retrieval_hint[:320]
                instructions.extend(self._question_response_instructions(selected_question, source_preference, intent=intent))
                if selected_question.get("matched_specific_question"):
                    reason = clean_text(str(selected_question.get("specific_match_reason") or "")) or "specific_question_reference"
                    instructions.append(f"The user referenced a specific question; keep that exact question as the anchor ({reason}).")
            else:
                instructions.append("No indexed exam question matched strongly; provide an inspired but evidence-aligned question.")
        elif requested_topics:
            retrieval_hint = ", ".join(requested_topics[:3])

        return ExamChatSubagentResult(
            exam_related=True,
            intent=intent,
            source_preference=source_preference,
            requires_deep_thinking=True,
            requested_topics=requested_topics,
            selected_question=selected_question,
            retrieval_query_hint=retrieval_hint,
            instructions=instructions,
        )

    def _is_exam_related(self, query: str) -> bool:
        if self.exam_practice.is_exam_related_query(query):
            return True
        tokens = set(tokenize(query))
        return bool(tokens.intersection(EXAM_CHAT_TERMS))

    @staticmethod
    def _is_question_request(lowered_query: str) -> bool:
        return any(pattern in lowered_query for pattern in QUESTION_REQUEST_PATTERNS)

    @staticmethod
    def _is_question_walkthrough(lowered_query: str) -> bool:
        return any(pattern in lowered_query for pattern in QUESTION_WALKTHROUGH_PATTERNS)

    @staticmethod
    def _source_preference(lowered_query: str) -> str:
        if any(pattern in lowered_query for pattern in UPLOADED_SOURCE_PATTERNS):
            return "uploaded"
        if any(pattern in lowered_query for pattern in INSPIRED_SOURCE_PATTERNS):
            return "inspired"
        return "auto"

    @staticmethod
    def _select_question_payload(recommendation: dict[str, Any] | None, source_preference: str) -> dict[str, Any] | None:
        if not recommendation:
            return None
        if source_preference == "inspired":
            inspired = recommendation.get("inspired_variant")
            if isinstance(inspired, dict):
                payload = dict(recommendation)
                payload.update(inspired)
                return payload
        return recommendation

    @staticmethod
    def _extract_topics(query: str, turn_plan: TurnPlan | None) -> list[str]:
        topics: list[str] = []
        for token in salient_terms(query, top_k=6):
            cleaned = clean_text(token)
            if not cleaned:
                continue
            if cleaned.lower() in TOPIC_FILLER:
                continue
            topics.append(cleaned)

        if turn_plan:
            for point in turn_plan.referenced_points[:4]:
                cleaned = clean_text(point)
                if not cleaned:
                    continue
                if len(cleaned.split()) > 8:
                    continue
                if cleaned.lower() in TOPIC_FILLER:
                    continue
                topics.append(cleaned)

        deduped: list[str] = []
        seen: set[str] = set()
        for topic in topics:
            key = topic.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(topic)
            if len(deduped) >= 5:
                break
        return deduped

    @staticmethod
    def _question_response_instructions(
        selected_question: dict[str, Any],
        source_preference: str,
        *,
        intent: str,
    ) -> list[str]:
        origin = str(selected_question.get("origin_type") or "uploaded")
        paper_label = clean_text(str(selected_question.get("paper_label") or selected_question.get("source_asset_title") or ""))
        marks = selected_question.get("marks")
        instructions = [
            "Format the response in exam style with explicit markdown sections.",
            "Use this section order: Recommended Exam Question, Marking Guidance, Lecture Evidence To Use, Answer Structure, Next Step.",
            "After presenting the question, include concise marking guidance and invite the student to submit an answer for evaluation.",
        ]
        if intent == "question_walkthrough":
            instructions.append(
                "For walkthrough requests, explain how to answer the selected question step-by-step and connect each step to retrieved lecture evidence."
            )
        else:
            instructions.append("For generation requests, present one best-fit question first, then coaching.")
        if source_preference == "uploaded" and origin == "uploaded":
            instructions.append("Use a real uploaded past-paper question from this workspace.")
        elif source_preference == "inspired" or origin == "inspired":
            instructions.append("Provide an inspired question that mirrors uploaded exam style and module emphasis.")
        if paper_label:
            instructions.append(f"Include the source label: {paper_label}.")
        if marks is not None:
            instructions.append(f"Preserve the mark weighting ({marks} marks) when coaching structure.")
        return instructions
