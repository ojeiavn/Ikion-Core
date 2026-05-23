from __future__ import annotations

import re

from ..config import IkionConfig
from ..models import Chunk, ConversationMessage, RetrievalHit
from ..utils.text import concise_query
from .corpus_builder import CorpusBuilderService
from .embeddings import EmbeddingProvider
from .rag_pipeline import QueryVariant, RagPlan, build_rag_plan, run_rag_plan


class RetrievalService:
    def __init__(
        self,
        config: IkionConfig,
        corpus_builder: CorpusBuilderService,
        embeddings: EmbeddingProvider,
    ):
        self.config = config
        self.corpus_builder = corpus_builder
        self.embeddings = embeddings
        self._cache: dict[str, dict] = {}

    def retrieve(
        self,
        workspace_id: str,
        query: str,
        top_k: int = 6,
        source_types: list[str] | None = None,
        source_weights: dict[str, float] | None = None,
        conversation_history: list[ConversationMessage] | None = None,
        graph_focus_terms: list[str] | None = None,
    ) -> list[RetrievalHit]:
        corpus = self._load_active_corpus(workspace_id)
        if not corpus["chunks"]:
            return []

        # Multi-query representation: we plan multiple query variants and fuse results with
        # a rank-aware (RRF-style) score. This is a lightweight, LangGraph-style pipeline:
        # plan -> retrieve -> fuse -> diversify.
        plan = build_rag_plan(query, conversation_history or [])

        # Optional knowledge-graph expansion variants.
        graph_expansions = self._graph_expand_variants(query, corpus.get("graph", {}), focus_terms=graph_focus_terms)
        if graph_expansions:
            plan = RagPlan(query=plan.query, variants=plan.variants + graph_expansions)

        candidate_k = min(max(top_k * 4, self.config.retrieval_candidate_k), len(corpus["chunks"]))
        return run_rag_plan(
            plan=plan,
            embeddings=self.embeddings,
            index=corpus["index"],
            chunks=corpus["chunks"],
            graph=corpus.get("graph", {}),
            top_k=top_k,
            candidate_k=candidate_k,
            source_types=source_types,
            source_weights=source_weights,
        )

    def get_chunks_by_ids(self, workspace_id: str, chunk_ids: list[str]) -> list[Chunk]:
        corpus = self._load_active_corpus(workspace_id)
        chunk_map = {chunk.id: chunk for chunk in corpus["chunks"]}
        return [chunk_map[chunk_id] for chunk_id in chunk_ids if chunk_id in chunk_map]

    def _load_active_corpus(self, workspace_id: str) -> dict:
        corpus = self.corpus_builder.get_active_corpus(workspace_id)
        cache_key = f"{workspace_id}:{corpus.id}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        payload = self.corpus_builder.load_corpus_payload(corpus)
        snapshot = {
            "manifest": payload["manifest"],
            "chunks": payload["chunks"],
            "index": payload["index"],
            "version": corpus.id,
            "graph": payload.get("graph", {}),
        }
        self._cache = {cache_key: snapshot}
        return snapshot

    def _graph_expand_variants(self, query: str, graph: dict, focus_terms: list[str] | None = None) -> list[QueryVariant]:
        adjacency = graph.get("adjacency") or {}
        exam_alias_index = graph.get("exam_alias_index") or {}
        exam_questions = {
            str(item.get("id")): item
            for item in (graph.get("exam_questions") or [])
            if isinstance(item, dict) and item.get("id")
        }
        if not adjacency and not exam_alias_index:
            return []
        tokens = set(concise_query(query).split())
        focus_tokens: set[str] = set()
        for focus in focus_terms or []:
            derived = set(concise_query(focus).split())
            focus_tokens.update(derived)
            tokens.update(derived)
        expansions: list[QueryVariant] = []
        for token in tokens:
            neighbors = adjacency.get(token) or []
            for neighbor in neighbors[:3]:
                term = neighbor.get("term")
                if not term:
                    continue
                label = "graph_focus_expand" if token in focus_tokens else "graph_expand"
                expansions.append(QueryVariant(text=f"{query} {term}", weight=0.72, label=label))

        alias_candidates = self._exam_alias_candidates(query, tokens)
        for alias in alias_candidates:
            matched_question_ids = exam_alias_index.get(alias) or []
            for question_id in matched_question_ids[:3]:
                question = exam_questions.get(str(question_id)) or {}
                excerpt = str(question.get("question_text_excerpt") or "").strip()
                if excerpt:
                    expansions.append(
                        QueryVariant(
                            text=f"{query}\nExam question context: {excerpt}",
                            weight=0.94,
                            label="graph_exam_question_context",
                        )
                    )
                for term in (question.get("key_terms") or [])[:4]:
                    if not term:
                        continue
                    expansions.append(
                        QueryVariant(
                            text=f"{query} {term}",
                            weight=0.86,
                            label="graph_exam_keyterm_expand",
                        )
                    )
        return expansions

    @staticmethod
    def _exam_alias_candidates(query: str, tokens: set[str]) -> set[str]:
        lowered = query.strip().lower()
        aliases: set[str] = set()
        for match in re.findall(r"\bq(?:uestion)?\s*([0-9]{1,2}[a-z]?)\b", lowered, flags=re.IGNORECASE):
            normalized = match.lower()
            aliases.add(f"q{normalized}")
            aliases.add(f"question {normalized}")
        for token in tokens:
            if re.fullmatch(r"q[0-9]{1,2}[a-z]?", token):
                aliases.add(token)
                aliases.add(f"question {token[1:]}")
        # Capture short paper+question references like "midterm q1".
        words = [word for word in lowered.split() if word]
        for index in range(len(words) - 1):
            left = words[index]
            right = words[index + 1]
            if re.fullmatch(r"q[0-9]{1,2}[a-z]?", right):
                aliases.add(f"{left} {right}")
        return aliases
