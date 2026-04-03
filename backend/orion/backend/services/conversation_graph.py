from __future__ import annotations

import re

from dataclasses import asdict, dataclass
from typing import Any, TypedDict

from pydantic import BaseModel, Field

try:
    from langgraph.graph import END, START, StateGraph
except Exception:  # pragma: no cover - graceful runtime fallback when langgraph is unavailable
    END = "__end__"
    START = "__start__"
    StateGraph = None

from ..config import OrionConfig
from ..models import ConversationMessage
from ..utils.text import clean_text, looks_like_follow_up, tokenize


class ConversationGraphState(TypedDict, total=False):
    query: str
    conversation_history: list[ConversationMessage]
    history_window: list[dict[str, str]]
    heuristic_plan: dict[str, Any]
    use_llm: bool
    llm_plan: dict[str, Any]
    final_plan: dict[str, Any]


@dataclass(slots=True)
class TurnPlan:
    turn_type: str
    standalone_query: str
    uses_history: bool
    referenced_points: list[str]
    response_strategy: list[str]
    history_summary: str | None
    confidence: float
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ConversationGraphService:
    def __init__(self, config: OrionConfig, llm: Any | None = None):
        self.config = config
        self.llm = llm
        self._graph = self._build_graph()

    def plan_turn(self, query: str, conversation_history: list[ConversationMessage] | None = None) -> TurnPlan:
        history = conversation_history or []
        result = self._graph.invoke(
            {
                "query": query,
                "conversation_history": history,
            }
        )
        plan_payload = result.get("final_plan") or result.get("heuristic_plan") or {}
        return self._coerce_plan(plan_payload, query, history)

    def _build_graph(self):
        if StateGraph is None:
            return _FallbackCompiledGraph(self)

        graph = StateGraph(ConversationGraphState)
        graph.add_node("prepare_history", self._prepare_history)
        graph.add_node("heuristic_plan", self._heuristic_plan)
        graph.add_node("llm_plan", self._llm_plan)
        graph.add_node("finalize", self._finalize)
        graph.add_edge(START, "prepare_history")
        graph.add_edge("prepare_history", "heuristic_plan")
        graph.add_conditional_edges(
            "heuristic_plan",
            self._route_after_heuristics,
            {
                "llm_plan": "llm_plan",
                "finalize": "finalize",
            },
        )
        graph.add_edge("llm_plan", "finalize")
        graph.add_edge("finalize", END)
        return graph.compile()

    @staticmethod
    def _prepare_history(state: ConversationGraphState) -> ConversationGraphState:
        history = state.get("conversation_history") or []
        window = history[-8:]
        history_window: list[dict[str, str]] = []
        for message in window:
            raw_content = str(message.content or "").strip()
            if not raw_content:
                continue
            normalized = re.sub(r"[ \t]+", " ", raw_content)
            if len(normalized) > 500:
                normalized = f"{normalized[:499].rstrip()}…"
            history_window.append({"role": message.role, "content": normalized, "raw_content": raw_content})
        return {"history_window": history_window}

    def _heuristic_plan(self, state: ConversationGraphState) -> ConversationGraphState:
        query = str(state.get("query") or "").strip()
        history_window = state.get("history_window") or []
        if not query:
            return {
                "heuristic_plan": self._default_plan(query, history_window),
                "use_llm": False,
            }

        has_history = bool(history_window)
        explicit_follow_up = self._is_explicit_follow_up(query)
        likely_follow_up = looks_like_follow_up(query) or explicit_follow_up
        self_contained = self._looks_self_contained(query)
        recent_assistant = [item.get("raw_content") or item["content"] for item in history_window if item.get("role") == "assistant"]
        assistant_anchor = recent_assistant[-1] if recent_assistant else ""
        referenced_points = self._extract_referenced_points(query, assistant_anchor)

        turn_type = "follow_up" if has_history and (likely_follow_up or (not self_contained and has_history)) else "new_query"
        uses_history = turn_type != "new_query" and has_history
        standalone_query = query.strip()
        if uses_history and assistant_anchor:
            standalone_query = self._fallback_rewrite(query, assistant_anchor, referenced_points)

        reason_parts = []
        if uses_history:
            reason_parts.append("query depends on recent chat context")
        if explicit_follow_up:
            reason_parts.append("explicit follow-up cue detected")
        elif not self_contained and has_history:
            reason_parts.append("query is short or referential")
        if not reason_parts:
            reason_parts.append("query is self-contained")

        heuristic_plan = TurnPlan(
            turn_type=turn_type,
            standalone_query=standalone_query,
            uses_history=uses_history,
            referenced_points=referenced_points,
            response_strategy=self._response_strategy(query, turn_type, referenced_points),
            history_summary=self._history_summary(history_window),
            confidence=0.72 if uses_history else 0.8,
            reason="; ".join(reason_parts),
        )

        use_llm = has_history and self._should_use_llm(query, turn_type, referenced_points)
        return {
            "heuristic_plan": heuristic_plan.to_dict(),
            "use_llm": use_llm,
        }

    def _route_after_heuristics(self, state: ConversationGraphState) -> str:
        return "llm_plan" if state.get("use_llm") else "finalize"

    def _llm_plan(self, state: ConversationGraphState) -> ConversationGraphState:
        if not self.llm and not self.config.openai_api_key:
            return {}
        llm = self.llm or self._build_llm()
        if llm is None:
            return {}

        query = str(state.get("query") or "").strip()
        history_window = state.get("history_window") or []
        if not query or not history_window:
            return {}

        prompt = self._render_llm_prompt(query, history_window)
        try:
            structured = llm.with_structured_output(TurnPlanResult).invoke(prompt)
        except Exception:
            return {}

        plan = TurnPlan(
            turn_type=structured.turn_type,
            standalone_query=structured.standalone_query.strip() or query,
            uses_history=bool(structured.uses_history and history_window),
            referenced_points=[item.strip() for item in structured.referenced_points if item.strip()][:5],
            response_strategy=[item.strip() for item in structured.response_strategy if item.strip()][:5],
            history_summary=structured.history_summary.strip() if structured.history_summary else None,
            confidence=max(0.0, min(float(structured.confidence), 1.0)),
            reason=structured.reason.strip() or "llm contextual planning",
        )
        return {"llm_plan": plan.to_dict()}

    def _finalize(self, state: ConversationGraphState) -> ConversationGraphState:
        heuristic = state.get("heuristic_plan") or {}
        llm_plan = state.get("llm_plan") or {}
        query = str(state.get("query") or "").strip()
        history = state.get("conversation_history") or []

        if llm_plan:
            candidate = self._coerce_plan(llm_plan, query, history)
            if candidate.uses_history and not history:
                candidate = TurnPlan(
                    turn_type="new_query",
                    standalone_query=query,
                    uses_history=False,
                    referenced_points=[],
                    response_strategy=self._response_strategy(query, "new_query", []),
                    history_summary=None,
                    confidence=0.55,
                    reason="history unavailable",
                )
            return {"final_plan": candidate.to_dict()}

        return {"final_plan": self._coerce_plan(heuristic, query, history).to_dict()}

    def _coerce_plan(
        self,
        payload: dict[str, Any] | None,
        query: str,
        conversation_history: list[ConversationMessage],
    ) -> TurnPlan:
        payload = payload or {}
        standalone_query = str(payload.get("standalone_query") or "").strip() or query
        referenced_points = [
            str(item).strip()
            for item in (payload.get("referenced_points") or [])
            if str(item).strip()
        ][:5]
        response_strategy = [
            str(item).strip()
            for item in (payload.get("response_strategy") or [])
            if str(item).strip()
        ][:5]
        uses_history = bool(payload.get("uses_history")) and bool(conversation_history)
        turn_type = str(payload.get("turn_type") or ("follow_up" if uses_history else "new_query")).strip().lower()
        if turn_type not in {"new_query", "follow_up", "clarification", "refinement"}:
            turn_type = "follow_up" if uses_history else "new_query"
        history_summary = str(payload.get("history_summary") or "").strip() or None
        reason = str(payload.get("reason") or "").strip() or "conversation turn analysis"
        confidence = payload.get("confidence", 0.7)
        try:
            confidence = max(0.0, min(float(confidence), 1.0))
        except Exception:
            confidence = 0.7
        return TurnPlan(
            turn_type=turn_type,
            standalone_query=standalone_query,
            uses_history=uses_history,
            referenced_points=referenced_points,
            response_strategy=response_strategy or self._response_strategy(query, turn_type, referenced_points),
            history_summary=history_summary,
            confidence=confidence,
            reason=reason,
        )

    def _build_llm(self):
        if not self.config.openai_api_key:
            return None
        try:
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(
                api_key=self.config.openai_api_key,
                model=self.config.openai_chat_model,
                temperature=0,
            )
        except Exception:
            return None

    @staticmethod
    def _default_plan(query: str, history_window: list[dict[str, str]]) -> dict[str, Any]:
        return TurnPlan(
            turn_type="new_query",
            standalone_query=query,
            uses_history=bool(history_window and looks_like_follow_up(query)),
            referenced_points=[],
            response_strategy=["answer the user directly from grounded evidence"],
            history_summary=None,
            confidence=0.5,
            reason="default conversation planning fallback",
        ).to_dict()

    @staticmethod
    def _history_summary(history_window: list[dict[str, str]]) -> str | None:
        if not history_window:
            return None
        lines = []
        for item in history_window[-4:]:
            role = "User" if item.get("role") == "user" else "Assistant"
            lines.append(f"{role}: {item.get('content', '')}")
        return " | ".join(lines)[:900] or None

    @staticmethod
    def _is_explicit_follow_up(query: str) -> bool:
        lowered = clean_text(query).lower()
        patterns = (
            r"\ball (?:two|three|four|of them)\b",
            r"\b(first|second|third|last) (one|part|topic|point)\b",
            r"\bmore detail\b",
            r"\bgo deeper\b",
            r"\bexpand on\b",
            r"\bthat (?:one|part|topic|example|answer)\b",
            r"\bthose (?:topics|points|examples|questions)\b",
            r"\bthis (?:one|topic|example|part)\b",
            r"\bit\b",
            r"\bthem\b",
            r"\bthe same\b",
        )
        return any(re.search(pattern, lowered) for pattern in patterns)

    @staticmethod
    def _looks_self_contained(query: str) -> bool:
        lowered = clean_text(query).lower()
        tokens = [token for token in tokenize(lowered) if token not in {"it", "that", "this", "those", "them"}]
        if len(tokens) >= 8:
            return True
        if any(
            marker in lowered
            for marker in (
                "using this module",
                "based on the lecture",
                "compare",
                "explain",
                "define",
                "what is",
                "how does",
                "why does",
            )
        ) and not looks_like_follow_up(lowered):
            return True
        return False

    @staticmethod
    def _fallback_rewrite(query: str, assistant_anchor: str, referenced_points: list[str]) -> str:
        anchor = assistant_anchor[:700].strip()
        if referenced_points:
            joined = "; ".join(referenced_points[:4])
            return f"{query} Referenced points from the prior answer: {joined}."
        return f"{query} Prior answer context: {anchor}"

    @staticmethod
    def _extract_referenced_points(query: str, assistant_anchor: str) -> list[str]:
        lowered = clean_text(query).lower()
        lines = [line.strip(" -*0123456789.)") for line in assistant_anchor.splitlines() if line.strip()]
        candidates = [
            line
            for line in lines
            if not line.endswith(":")
            and (
                len(line.split()) >= 3
                or "_" in line
                or "/" in line
                or (len(line.split()) >= 1 and any(char.isupper() for char in line))
            )
        ][:6]
        if not candidates:
            sentence_parts = re.split(r"(?<=[.!?])\s+", assistant_anchor)
            candidates = [part.strip() for part in sentence_parts if len(part.strip().split()) >= 3][:6]

        if "all three" in lowered or "all 3" in lowered:
            return candidates[:3]
        ordinal_map = {
            "first": 0,
            "second": 1,
            "third": 2,
            "last": max(len(candidates) - 1, 0),
        }
        for word, index in ordinal_map.items():
            if re.search(rf"\b{word}\b", lowered) and candidates:
                return [candidates[min(index, len(candidates) - 1)]]
        if any(term in lowered for term in ("that", "this", "those", "them", "it")):
            return candidates[:3]
        return []

    @staticmethod
    def _response_strategy(query: str, turn_type: str, referenced_points: list[str]) -> list[str]:
        strategy: list[str] = []
        lowered = clean_text(query).lower()
        if turn_type != "new_query":
            strategy.append("use the active conversation to resolve references before answering")
        if any(phrase in lowered for phrase in ("more detail", "go deeper", "step by step", "walk me through")):
            strategy.append("expand with more depth, reasoning, and examples")
        if referenced_points:
            strategy.append("cover the referenced points explicitly rather than switching topics")
        if not strategy:
            strategy.append("answer the user directly from grounded evidence")
        return strategy

    @staticmethod
    def _should_use_llm(query: str, turn_type: str, referenced_points: list[str]) -> bool:
        lowered = clean_text(query).lower()
        if turn_type != "new_query":
            return True
        if referenced_points:
            return True
        if len(tokenize(lowered)) <= 10:
            return True
        return any(
            marker in lowered
            for marker in (
                "all three",
                "all 3",
                "more detail",
                "go deeper",
                "that one",
                "this one",
                "the first",
                "the second",
                "the third",
            )
        )

    @staticmethod
    def _render_llm_prompt(query: str, history_window: list[dict[str, str]]) -> str:
        history_lines = []
        for index, item in enumerate(history_window, start=1):
            history_lines.append(f"{index}. {item['role']}: {item['content']}")
        history_block = "\n".join(history_lines)
        return f"""You are Orion's conversation planner.

Decide whether the current user turn is a new query or a follow-up that depends on the active chat.
If it is a follow-up, rewrite it into a standalone retrieval query that preserves the user's intent and the exact referenced points from the prior chat.
Do not broaden or change the topic.

Return structured output with:
- turn_type: new_query | follow_up | clarification | refinement
- standalone_query: self-contained query for retrieval
- uses_history: boolean
- referenced_points: short list of the concrete prior points/topics the user is referring to
- response_strategy: short list of answering instructions for the grounded answerer
- history_summary: 1-2 sentences summarizing only the relevant prior context
- confidence: 0 to 1
- reason: brief explanation

CURRENT USER QUERY
{query}

RECENT CONVERSATION
{history_block}
"""


class TurnPlanResult(BaseModel):
    turn_type: str = Field(default="new_query")
    standalone_query: str = Field(default="")
    uses_history: bool = Field(default=False)
    referenced_points: list[str] = Field(default_factory=list)
    response_strategy: list[str] = Field(default_factory=list)
    history_summary: str | None = Field(default=None)
    confidence: float = Field(default=0.5)
    reason: str = Field(default="")


class _FallbackCompiledGraph:
    def __init__(self, service: ConversationGraphService):
        self.service = service

    def invoke(self, state: ConversationGraphState) -> ConversationGraphState:
        prepared = dict(state)
        prepared.update(self.service._prepare_history(prepared))
        prepared.update(self.service._heuristic_plan(prepared))
        if self.service._route_after_heuristics(prepared) == "llm_plan":
            prepared.update(self.service._llm_plan(prepared))
        prepared.update(self.service._finalize(prepared))
        return prepared
