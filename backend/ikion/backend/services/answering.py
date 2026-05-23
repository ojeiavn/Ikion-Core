from __future__ import annotations

import json
import re
import time

from ..config import IkionConfig
from ..models import Citation, ConversationMessage, QueryResponse, RetrievalHit
from ..prompts.grounded_answer import SYSTEM_PROMPT, render_grounded_answer_prompt
from ..utils.text import best_sentences_for_query, query_complexity_score
from .conversation_graph import ConversationGraphService, TurnPlan
from .exam_chat_subagent import ExamChatSubagentService
from .exam_practice import ExamPracticeService
from .guidance import GuidanceService
from .logging_service import QueryLoggingService
from .playback import PlaybackService
from .reflection import ResponseReflectionTool
from .retrieval import RetrievalService


class GroundedAnsweringService:
    def __init__(
        self,
        config: IkionConfig,
        retrieval: RetrievalService,
        guidance: GuidanceService,
        playback: PlaybackService,
        reflection: ResponseReflectionTool,
        logging_service: QueryLoggingService,
        exam_practice: ExamPracticeService,
        exam_chat_subagent: ExamChatSubagentService,
        conversation_graph: ConversationGraphService,
    ):
        self.config = config
        self.retrieval = retrieval
        self.guidance = guidance
        self.playback = playback
        self.reflection = reflection
        self.logging_service = logging_service
        self.exam_practice = exam_practice
        self.exam_chat_subagent = exam_chat_subagent
        self.conversation_graph = conversation_graph

    def ask(
        self,
        workspace_id: str,
        query: str,
        conversation_id: str | None = None,
        conversation_history: list[ConversationMessage] | None = None,
        user_id: str | None = None,
        answer_mode: str | None = None,
        top_k: int = 6,
        source_types: list[str] | None = None,
        source_weights: dict[str, float] | None = None,
    ) -> QueryResponse:
        started = time.perf_counter()
        turn_plan = self.conversation_graph.plan_turn(query, conversation_history or [])
        exam_subagent = self.exam_chat_subagent.analyze(
            workspace_id=workspace_id,
            user_id=user_id,
            query=query,
            turn_plan=turn_plan,
        )
        resolved_query = turn_plan.standalone_query or query
        exam_prompt_context = self.exam_practice.build_prompt_context(workspace_id, user_id, query)
        if exam_subagent.exam_related:
            patch = exam_subagent.prompt_context_patch()
            exam_prompt_context = {**(exam_prompt_context or {}), **patch}
        graph_focus_terms = list(exam_prompt_context.get("graph_focus_terms") if exam_prompt_context else []) or []
        graph_focus_terms.extend(exam_subagent.requested_topics[:4])
        if turn_plan.referenced_points:
            graph_focus_terms.extend(turn_plan.referenced_points)
        retrieval_query = resolved_query
        if exam_subagent.retrieval_query_hint:
            retrieval_query = f"{resolved_query}\nExam focus: {exam_subagent.retrieval_query_hint}"
        retrieval_history = (
            []
            if turn_plan.uses_history and resolved_query.strip().lower() != query.strip().lower()
            else conversation_history
        )
        hits = self.retrieval.retrieve(
            workspace_id=workspace_id,
            query=retrieval_query,
            top_k=top_k,
            source_types=source_types,
            source_weights=source_weights,
            conversation_history=retrieval_history,
            graph_focus_terms=graph_focus_terms or None,
        )
        lecture_support_hits: list[RetrievalHit] = []
        if exam_subagent.exam_related and exam_subagent.selected_question:
            lecture_support_hits = self._retrieve_exam_lecture_support_hits(
                workspace_id=workspace_id,
                selected_question=exam_subagent.selected_question,
                top_k=max(4, top_k),
                source_types=source_types,
                source_weights=source_weights,
                conversation_history=retrieval_history,
                graph_focus_terms=graph_focus_terms or None,
            )
            if lecture_support_hits:
                hits = self._merge_hits(hits, lecture_support_hits, max_hits=max(top_k * 4, 16))
        guidance_packs = self.guidance.get_active_guidance_packs(workspace_id)
        guidance_texts = [pack.instructions for pack in guidance_packs]
        guidance_applied = [pack.name for pack in guidance_packs]
        personalized_guidance = self.exam_practice.build_personalized_guidance(workspace_id, user_id, query)
        if personalized_guidance:
            guidance_texts.append(personalized_guidance)
            guidance_applied.append("personalized_exam_focus")
        if exam_subagent.exam_related:
            guidance_texts.extend(exam_subagent.instructions)
            guidance_applied.append("exam_chat_subagent")
            if exam_subagent.intent == "question_generation":
                guidance_applied.append("exam_question_generation")
            if lecture_support_hits:
                guidance_applied.append("exam_lecture_support_retrieval")
        guidance_applied.append("langgraph_conversation_planner")
        if turn_plan.uses_history:
            guidance_applied.append("conversation_follow_up_context")
        if resolved_query.strip().lower() != query.strip().lower():
            guidance_applied.append("contextual_query_rewrite")
        guidance_applied.append("reflection_subagent")
        guidance_applied.append("latex_subagent")
        support_score = self._compute_support_score(hits)
        citations = self._build_citations(resolved_query, hits)
        complexity_score = query_complexity_score(query)
        effective_mode = (answer_mode or self.config.answer_mode_default or "standard").strip().lower()
        if (exam_prompt_context or exam_subagent.requires_deep_thinking) and effective_mode == "standard":
            effective_mode = "thinking"
            guidance_applied.append("exam_subagent_deep_thinking")

        if not self._has_sufficient_grounding(hits, citations):
            extra_metrics = self.exam_practice.build_chat_performance_signal(query, hits, "refused", support_score) or {}
            extra_metrics.update(exam_subagent.metrics())
            extra_metrics["exam_lecture_support_hit_count"] = len(lecture_support_hits)
            extra_metrics.update(self._turn_plan_metrics(turn_plan, resolved_query))
            response = QueryResponse(
                workspace_id=workspace_id,
                query=query,
                conversation_id=conversation_id,
                answer_mode=effective_mode,
                complexity_score=complexity_score,
                status="refused",
                answer="I can't answer that from the active workspace corpus because I don't have enough grounded support.",
                citations=[],
                cited_chunk_ids=[],
                cited_asset_ids=[],
                support_score=support_score,
                guidance_applied=guidance_applied,
                retrieval_hits=hits,
                playback=None,
                playback_segments=[],
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            self.logging_service.log_query_event(response, user_id=user_id, extra_metrics=extra_metrics)
            return response

        status = "answered" if support_score >= max(self.config.answer_min_support * 1.35, 0.3) else "partial"
        extra_metrics = self.exam_practice.build_chat_performance_signal(query, hits, status, support_score) or {}
        extra_metrics.update(exam_subagent.metrics())
        extra_metrics["exam_lecture_support_hit_count"] = len(lecture_support_hits)
        extra_metrics.update(self._turn_plan_metrics(turn_plan, resolved_query))
        answer = self._compose_answer(
            query,
            resolved_query,
            citations,
            hits,
            guidance_texts,
            status,
            effective_mode,
            exam_prompt_context,
            exam_subagent.prompt_context(),
            conversation_history or [],
            turn_plan,
        )
        playback = self.playback.resolve_from_hits(resolved_query, hits)
        playback_segments = self.playback.resolve_top_segments_from_hits(resolved_query, hits, limit=3)
        response = QueryResponse(
            workspace_id=workspace_id,
            query=query,
            conversation_id=conversation_id,
            answer_mode=effective_mode,
            complexity_score=complexity_score,
            status=status,
            answer=answer,
            citations=citations,
            cited_chunk_ids=[citation.chunk_id for citation in citations],
            cited_asset_ids=list(dict.fromkeys(citation.asset_id for citation in citations)),
            support_score=support_score,
            guidance_applied=guidance_applied,
            retrieval_hits=hits,
            playback=playback,
            playback_segments=playback_segments,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        self.logging_service.log_query_event(response, user_id=user_id, extra_metrics=extra_metrics)
        return response

    def _compose_answer(
        self,
        query: str,
        resolved_query: str,
        citations: list[Citation],
        hits: list[RetrievalHit],
        guidance_texts: list[str],
        status: str,
        answer_mode: str,
        exam_prompt_context: dict | None,
        exam_subagent_context: dict | None,
        conversation_history: list[ConversationMessage],
        turn_plan: TurnPlan,
    ) -> str:
        if self.config.answer_provider != "openai" or not self.config.openai_api_key:
            raise ValueError(
                "Deterministic answering is disabled. Configure OpenAI answering to generate grounded responses."
            )
        llm_answer = self._try_openai_answer(
            query,
            resolved_query,
            citations,
            hits,
            guidance_texts,
            answer_mode,
            exam_prompt_context,
            exam_subagent_context,
            conversation_history,
            turn_plan,
        )
        if llm_answer:
            outcome = self.reflection.refine(
                query=query,
                answer=llm_answer,
                citation_count=len(citations),
                referenced_points=turn_plan.referenced_points,
            )
            return outcome.answer
        raise ValueError("LLM grounded synthesis failed. Check provider/model/API configuration and retry.")

    def _try_openai_answer(
        self,
        query: str,
        resolved_query: str,
        citations: list[Citation],
        hits: list[RetrievalHit],
        guidance_texts: list[str],
        answer_mode: str,
        exam_prompt_context: dict | None,
        exam_subagent_context: dict | None,
        conversation_history: list[ConversationMessage],
        turn_plan: TurnPlan,
    ) -> str | None:
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.config.openai_api_key)
            evidence_blocks = self._build_evidence_blocks(citations, hits)
            prompt = render_grounded_answer_prompt(
                query,
                resolved_query,
                guidance_texts,
                evidence_blocks,
                conversation_context=self._build_prompt_conversation_context(conversation_history),
                exam_context=exam_prompt_context,
                exam_subagent_context=exam_subagent_context,
                turn_context=turn_plan.to_dict(),
            )
            model = self._select_openai_model(answer_mode)
            response = client.chat.completions.create(
                model=model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            answer = str(payload.get("answer", "") or "").strip()
            if answer:
                return self._normalize_answer_markdown(answer)
        except Exception:
            return None
        return None

    def _select_openai_model(self, answer_mode: str) -> str:
        if answer_mode == "thinking":
            return self.config.openai_thinking_model or self.config.openai_chat_model
        return self.config.openai_chat_model

    def _build_citations(self, query: str, hits: list[RetrievalHit], max_citations: int = 4) -> list[Citation]:
        citations: list[Citation] = []
        seen_chunks: set[str] = set()
        for hit in hits:
            if hit.chunk.id in seen_chunks:
                continue
            sentences = best_sentences_for_query(hit.chunk.text, query, limit=1)
            quote = sentences[0] if sentences else hit.chunk.text[:220]
            citations.append(
                Citation(
                    index=len(citations) + 1,
                    chunk_id=hit.chunk.id,
                    asset_id=hit.chunk.asset_id,
                    asset_title=hit.chunk.asset_title,
                    asset_type=hit.chunk.asset_type,
                    locator=hit.chunk.metadata.get("locator"),
                    quote=quote,
                    score=hit.final_score,
                )
            )
            seen_chunks.add(hit.chunk.id)
            if len(citations) >= max_citations:
                break
        return citations

    @staticmethod
    def _compute_support_score(hits: list[RetrievalHit]) -> float:
        if not hits:
            return 0.0
        sample = hits[:3]
        support = sum(max(hit.final_score, 0.0) for hit in sample) / len(sample)
        return round(min(max(support, 0.0), 1.0), 4)

    def _has_sufficient_grounding(self, hits: list[RetrievalHit], citations: list[Citation]) -> bool:
        if not hits or not citations:
            return False
        top_hit = hits[0]
        max_lexical = max((hit.lexical_score for hit in hits[:3]), default=0.0)
        if top_hit.final_score >= 0.35:
            return True
        if top_hit.final_score >= self.config.answer_min_support and max_lexical >= 0.12:
            return True
        return False

    @staticmethod
    def _normalize_answer_markdown(text: str) -> str:
        normalized = text.replace("\r\n", "\n").strip()
        if re.search(r"(?m)^\s*#{1,6}\s+\S+", normalized):
            normalized = re.sub(r"(?m)^\s*#{1,2}\s+", "### ", normalized)
        return normalized

    @staticmethod
    def _build_evidence_blocks(citations: list[Citation], hits: list[RetrievalHit], max_blocks: int = 8) -> list[dict]:
        citation_by_chunk = {citation.chunk_id: citation for citation in citations}
        blocks: list[dict] = []
        seen: set[str] = set()
        for hit in hits:
            chunk = hit.chunk
            if chunk.id in seen:
                continue
            seen.add(chunk.id)
            citation = citation_by_chunk.get(chunk.id)
            blocks.append(
                {
                    "index": citation.index if citation else (len(blocks) + 1),
                    "chunk_id": chunk.id,
                    "asset_id": chunk.asset_id,
                    "asset_title": chunk.asset_title,
                    "asset_type": chunk.asset_type,
                    "locator": chunk.metadata.get("locator"),
                    "quote": citation.quote if citation else chunk.text[:240],
                    "chunk_text": chunk.text[:1400],
                    "score": hit.final_score,
                    "semantic_score": hit.semantic_score,
                    "lexical_score": hit.lexical_score,
                    "salient_terms": chunk.metadata.get("salient_terms") or [],
                    "question_bank": chunk.metadata.get("question_bank") or [],
                    "document_category": chunk.metadata.get("document_category"),
                    "default_question_guidance": chunk.metadata.get("default_question_guidance"),
                }
            )
            if len(blocks) >= max_blocks:
                break
        return blocks

    @staticmethod
    def _build_prompt_conversation_context(
        conversation_history: list[ConversationMessage],
        max_messages: int = 8,
        max_chars: int = 500,
    ) -> list[dict]:
        if not conversation_history:
            return []

        recent_messages = conversation_history[-max_messages:]
        context: list[dict] = []
        for message in recent_messages:
            content = " ".join(str(message.content or "").split())
            if not content:
                continue
            if len(content) > max_chars:
                content = f"{content[: max_chars - 1].rstrip()}…"
            context.append(
                {
                    "role": message.role,
                    "content": content,
                    "status": message.status,
                }
            )
        return context

    @staticmethod
    def _turn_plan_metrics(turn_plan: TurnPlan, resolved_query: str) -> dict[str, object]:
        return {
            "conversation_turn_type": turn_plan.turn_type,
            "conversation_uses_history": turn_plan.uses_history,
            "conversation_confidence": turn_plan.confidence,
            "conversation_referenced_points": turn_plan.referenced_points,
            "resolved_query": resolved_query,
        }

    def _retrieve_exam_lecture_support_hits(
        self,
        *,
        workspace_id: str,
        selected_question: dict,
        top_k: int,
        source_types: list[str] | None,
        source_weights: dict[str, float] | None,
        conversation_history: list[ConversationMessage] | None,
        graph_focus_terms: list[str] | None,
    ) -> list[RetrievalHit]:
        question_text = str(selected_question.get("question_text") or "").strip()
        if not question_text:
            return []
        support_query = (
            f"{question_text}\n"
            "Find lecture and transcript evidence that helps answer this exam question."
        )
        support_hits = self.retrieval.retrieve(
            workspace_id=workspace_id,
            query=support_query,
            top_k=top_k,
            source_types=source_types,
            source_weights=source_weights,
            conversation_history=conversation_history,
            graph_focus_terms=graph_focus_terms,
        )
        filtered = [
            hit
            for hit in support_hits
            if str(hit.chunk.metadata.get("document_category") or "").strip().lower() not in {"exam_paper", "mark_scheme"}
        ]
        return filtered[:top_k]

    @staticmethod
    def _merge_hits(primary: list[RetrievalHit], secondary: list[RetrievalHit], max_hits: int) -> list[RetrievalHit]:
        merged: dict[str, RetrievalHit] = {}
        for hit in primary + secondary:
            existing = merged.get(hit.chunk.id)
            if existing is None:
                merged[hit.chunk.id] = hit
                continue
            if hit.final_score > existing.final_score:
                merged[hit.chunk.id] = RetrievalHit(
                    chunk=hit.chunk,
                    semantic_score=max(existing.semantic_score, hit.semantic_score),
                    lexical_score=max(existing.lexical_score, hit.lexical_score),
                    final_score=hit.final_score,
                )
            else:
                merged[hit.chunk.id] = RetrievalHit(
                    chunk=existing.chunk,
                    semantic_score=max(existing.semantic_score, hit.semantic_score),
                    lexical_score=max(existing.lexical_score, hit.lexical_score),
                    final_score=existing.final_score,
                )
        ordered = sorted(merged.values(), key=lambda item: item.final_score, reverse=True)
        return ordered[:max_hits]
