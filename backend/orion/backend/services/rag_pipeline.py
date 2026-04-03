from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

import numpy as np

from ..models import Chunk, ConversationMessage, RetrievalHit
from ..storage.faiss_store import FaissStore
from ..utils.text import concise_query, decompose_query, keyword_overlap, looks_like_follow_up, tokenize
from .embeddings import EmbeddingProvider


@dataclass(frozen=True, slots=True)
class QueryVariant:
    text: str
    weight: float
    label: str


@dataclass(frozen=True, slots=True)
class RagPlan:
    query: str
    variants: list[QueryVariant]


def build_rag_plan(query: str, conversation_history: list[ConversationMessage]) -> RagPlan:
    variants: list[QueryVariant] = [QueryVariant(text=query, weight=1.0, label="primary")]
    condensed = concise_query(query)
    if condensed and condensed.lower() != query.lower():
        variants.append(QueryVariant(text=condensed, weight=0.82, label="condensed"))

    parts = decompose_query(query)
    # decompose_query may include the original query; keep only non-identical parts here.
    for index, part in enumerate(parts, start=1):
        if part.strip().lower() == query.strip().lower():
            continue
        variants.append(QueryVariant(text=part, weight=0.9, label=f"decomp_{index}"))

    history_rewrite = _history_context(query, conversation_history)
    if history_rewrite:
        variants.append(QueryVariant(text=history_rewrite, weight=0.88, label="history_rewrite"))

    # QB-RAG seed variants: represent the query in question-like forms
    # that align with chunk question-bank prompts generated during ingestion.
    for index, seed in enumerate(_qb_seed_variants(query), start=1):
        variants.append(QueryVariant(text=seed, weight=0.76, label=f"qb_seed_{index}"))

    seen: set[str] = set()
    deduped: list[QueryVariant] = []
    for variant in variants:
        normalized = variant.text.strip().lower()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(variant)
    return RagPlan(query=query, variants=deduped[:8])


def run_rag_plan(
    *,
    plan: RagPlan,
    embeddings: EmbeddingProvider,
    index,
    chunks: list[Chunk],
    graph: dict | None,
    top_k: int,
    candidate_k: int,
    source_types: list[str] | None,
    source_weights: dict[str, float] | None,
    question_bank_weight: float = 0.1,
    metadata_weight: float = 0.05,
    rrf_k: int = 60,
) -> list[RetrievalHit]:
    if not chunks:
        return []

    weights = source_weights or {}
    variant_texts = [variant.text for variant in plan.variants]
    query_vectors = embeddings.embed_texts(variant_texts)

    aggregate: dict[str, dict] = {}

    def run_variant(variant: QueryVariant, vector: np.ndarray):
        semantic_scores, indices = FaissStore.search(index, np.asarray(vector, dtype="float32"), candidate_k)
        rows: list[tuple[int, float, int]] = []
        for rank, (semantic_score, idx) in enumerate(zip(semantic_scores, indices), start=1):
            if idx < 0:
                continue
            rows.append((rank, float(semantic_score), int(idx)))
        return variant, rows

    max_workers = min(8, max(1, len(plan.variants)))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = [pool.submit(run_variant, variant, vector) for variant, vector in zip(plan.variants, query_vectors)]
        for future in as_completed(futures):
            variant, rows = future.result()
            for rank, semantic_score, idx in rows:
                chunk = chunks[idx]
                if source_types and chunk.asset_type not in source_types:
                    continue
                lexical_score = max(keyword_overlap(plan.query, chunk.text), keyword_overlap(variant.text, chunk.text))
                qb_score = _question_bank_score(plan.query, variant.text, chunk)
                meta_score = _metadata_overlap_score(plan.query, variant.text, chunk)
                rrf = 1.0 / float(rrf_k + rank)
                combined = (
                    (semantic_score * 0.62)
                    + (lexical_score * 0.18)
                    + (qb_score * question_bank_weight)
                    + (meta_score * metadata_weight)
                    + (rrf * 0.35)
                ) * variant.weight
                combined *= weights.get(chunk.asset_type, 1.0)
                bucket = aggregate.setdefault(
                    chunk.id,
                    {
                        "chunk": chunk,
                        "semantic": 0.0,
                        "lexical": 0.0,
                        "score": 0.0,
                        "matched_labels": set(),
                    },
                )
                bucket["semantic"] = max(bucket["semantic"], semantic_score)
                bucket["lexical"] = max(bucket["lexical"], max(lexical_score, qb_score))
                bucket["score"] += combined
                bucket["matched_labels"].add(variant.label)

    _apply_raptor_boost(plan.query, aggregate)

    hits: list[RetrievalHit] = []
    for bucket in aggregate.values():
        coverage_bonus = 0.03 * max(len(bucket["matched_labels"]) - 1, 0)
        hits.append(
            RetrievalHit(
                chunk=bucket["chunk"],
                semantic_score=float(bucket["semantic"]),
                lexical_score=float(bucket["lexical"]),
                final_score=float(bucket["score"] + coverage_bonus),
            )
        )

    hits.sort(key=lambda item: item.final_score, reverse=True)
    return _weighted_rerank(plan.query, hits, top_k=top_k, graph=graph or {})


def _history_context(query: str, conversation_history: list[ConversationMessage]) -> str | None:
    if not conversation_history or not looks_like_follow_up(query):
        return None
    recent_user = [message.content for message in conversation_history if message.role == "user"][-2:]
    recent_assistant = [message.content for message in conversation_history if message.role == "assistant"][-1:]
    context_parts = recent_user + recent_assistant
    context = " ".join(context_parts).strip()
    if not context:
        return None
    return f"{context} {query}".strip()


def _question_bank_score(query: str, variant: str, chunk: Chunk) -> float:
    question_bank = chunk.metadata.get("question_bank") or []
    if not question_bank:
        return 0.0
    scores = [
        max(keyword_overlap(query, prompt), keyword_overlap(variant, prompt))
        for prompt in question_bank
        if isinstance(prompt, str)
    ]
    return max(scores, default=0.0)


def _metadata_overlap_score(query: str, variant: str, chunk: Chunk) -> float:
    phrases = chunk.metadata.get("salient_phrases") or []
    terms = chunk.metadata.get("salient_terms") or []
    candidates = [item for item in phrases + terms if isinstance(item, str)]
    if not candidates:
        return 0.0
    scores = [
        max(keyword_overlap(query, candidate), keyword_overlap(variant, candidate))
        for candidate in candidates
    ]
    return max(scores, default=0.0)


def _diversify_hits(hits: list[RetrievalHit], top_k: int) -> list[RetrievalHit]:
    if len(hits) <= top_k:
        return hits
    selected: list[RetrievalHit] = []
    seen_assets: dict[str, int] = {}
    candidates = hits[:]

    while candidates and len(selected) < top_k:
        best_index = 0
        best_score = float("-inf")
        for index, hit in enumerate(candidates):
            repeat_penalty = 0.12 * seen_assets.get(hit.chunk.asset_id, 0)
            adjusted = hit.final_score - repeat_penalty
            if adjusted > best_score:
                best_score = adjusted
                best_index = index
        chosen = candidates.pop(best_index)
        selected.append(chosen)
        seen_assets[chosen.chunk.asset_id] = seen_assets.get(chosen.chunk.asset_id, 0) + 1
    return selected


def _weighted_rerank(query: str, hits: list[RetrievalHit], top_k: int, graph: dict) -> list[RetrievalHit]:
    if len(hits) <= top_k:
        return hits

    max_final = max((hit.final_score for hit in hits), default=1.0) or 1.0
    max_semantic = max((hit.semantic_score for hit in hits), default=1.0) or 1.0
    node_counts = {
        str(node.get("term", "")).lower(): float(node.get("count", 0.0))
        for node in (graph.get("nodes") or [])
        if isinstance(node, dict)
    }
    max_node = max(node_counts.values(), default=1.0) or 1.0
    query_terms = set(tokenize(query))

    stage_score: dict[str, float] = {}
    for hit in hits:
        chunk = hit.chunk
        relevance = hit.final_score / max_final
        semantic = max(hit.semantic_score, 0.0) / max_semantic
        lexical = max(hit.lexical_score, 0.0)
        qb = _question_bank_score(query, query, chunk)
        meta = _metadata_overlap_score(query, query, chunk)
        graph_boost = _graph_alignment_score(chunk, query_terms, node_counts, max_node)
        stage_score[chunk.id] = (
            (0.45 * relevance)
            + (0.16 * semantic)
            + (0.14 * lexical)
            + (0.12 * qb)
            + (0.08 * meta)
            + (0.05 * graph_boost)
        )

    selected: list[RetrievalHit] = []
    candidates = hits[: max(top_k * 8, top_k)]
    seen_assets: dict[str, int] = {}
    mmr_lambda = 0.76

    while candidates and len(selected) < top_k:
        best_idx = 0
        best_score = float("-inf")
        for idx, candidate in enumerate(candidates):
            novelty_penalty = _max_similarity(candidate, selected)
            asset_repeat_penalty = 0.08 * seen_assets.get(candidate.chunk.asset_id, 0)
            adjusted = (mmr_lambda * stage_score.get(candidate.chunk.id, 0.0)) - (
                (1.0 - mmr_lambda) * novelty_penalty
            ) - asset_repeat_penalty
            if adjusted > best_score:
                best_score = adjusted
                best_idx = idx
        chosen = candidates.pop(best_idx)
        selected.append(chosen)
        seen_assets[chosen.chunk.asset_id] = seen_assets.get(chosen.chunk.asset_id, 0) + 1

    return selected


def _max_similarity(candidate: RetrievalHit, selected: list[RetrievalHit]) -> float:
    if not selected:
        return 0.0
    candidate_terms = _chunk_terms(candidate.chunk)
    if not candidate_terms:
        return 0.0
    best = 0.0
    for prior in selected:
        prior_terms = _chunk_terms(prior.chunk)
        if not prior_terms:
            continue
        intersection = len(candidate_terms.intersection(prior_terms))
        union = len(candidate_terms.union(prior_terms))
        sim = (intersection / union) if union else 0.0
        best = max(best, sim)
    return best


def _chunk_terms(chunk: Chunk) -> set[str]:
    terms = [term for term in (chunk.metadata.get("salient_terms") or []) if isinstance(term, str)]
    if terms:
        return {term.strip().lower() for term in terms if term.strip()}
    return set(tokenize(chunk.text)) if chunk.text else set()


def _graph_alignment_score(chunk: Chunk, query_terms: set[str], node_counts: dict[str, float], max_node: float) -> float:
    if not query_terms or not node_counts:
        return 0.0
    chunk_terms = _chunk_terms(chunk)
    if not chunk_terms:
        return 0.0
    overlap = chunk_terms.intersection(query_terms)
    if not overlap:
        return 0.0
    density = sum(node_counts.get(term, 0.0) for term in overlap) / max_node
    return min(density / max(len(overlap), 1), 1.0)


def _qb_seed_variants(query: str) -> list[str]:
    seeds: list[str] = []
    parts = decompose_query(query)
    anchors = parts[:3] if parts else [query]
    for anchor in anchors:
        anchor = anchor.strip()
        if not anchor:
            continue
        seeds.append(f"What does the material explain about {anchor}?")
        seeds.append(f"Give a grounded example for {anchor}.")
    deduped: list[str] = []
    seen: set[str] = set()
    for seed in seeds:
        key = seed.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(seed)
    return deduped[:4]


def _apply_raptor_boost(query: str, aggregate: dict[str, dict]) -> None:
    # RAPTOR-style hierarchical signal: boost chunks that belong to
    # high-support "parent groups" (asset-level + topical term clusters).
    if not aggregate:
        return

    by_asset: dict[str, list[float]] = {}
    for bucket in aggregate.values():
        asset_id = bucket["chunk"].asset_id
        by_asset.setdefault(asset_id, []).append(float(bucket["score"]))
    asset_support = {
        asset_id: (sum(scores) / len(scores)) if scores else 0.0
        for asset_id, scores in by_asset.items()
    }
    max_asset_support = max(asset_support.values(), default=0.0) or 1.0
    query_terms = set(tokenize(query))

    for bucket in aggregate.values():
        chunk = bucket["chunk"]
        raw_score = float(bucket["score"])
        asset_score = asset_support.get(chunk.asset_id, 0.0) / max_asset_support
        salient_terms = [
            term for term in (chunk.metadata.get("salient_terms") or []) if isinstance(term, str)
        ]
        topical_overlap = 0.0
        if salient_terms and query_terms:
            overlap = len(query_terms.intersection({term.lower() for term in salient_terms}))
            topical_overlap = overlap / max(len(query_terms), 1)

        # Modest boosts only; retrieval remains grounded by primary scores.
        bucket["score"] = raw_score + (asset_score * 0.08) + (topical_overlap * 0.06)
