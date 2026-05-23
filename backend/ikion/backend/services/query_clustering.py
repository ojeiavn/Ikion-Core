from __future__ import annotations

import math

from dataclasses import dataclass
from typing import Any

import numpy as np

from ..utils.text import STOPWORDS, clean_text, decompose_query, tokenize
from .embeddings import EmbeddingProvider


@dataclass(frozen=True, slots=True)
class QueryCluster:
    id: str
    label: str
    member_indices: list[int]
    top_terms: list[str]


def build_query_representations(queries: list[str], embeddings: EmbeddingProvider) -> np.ndarray:
    """
    Represent each user query as an embedding of a small decomposed set of sub-queries.
    This improves clustering for compound prompts (multi-question, comparisons, etc.).
    """
    parts: list[str] = []
    offsets: list[tuple[int, int]] = []
    for query in queries:
        start = len(parts)
        variants = decompose_query(query) or [clean_text(query)]
        parts.extend(variants)
        offsets.append((start, len(parts)))

    part_vectors = embeddings.embed_texts(parts) if parts else np.zeros((0, embeddings.dimension), dtype="float32")
    representations: list[np.ndarray] = []
    for start, end in offsets:
        if end <= start:
            representations.append(np.zeros((embeddings.dimension,), dtype="float32"))
            continue
        representations.append(part_vectors[start:end].mean(axis=0))
    return np.asarray(representations, dtype="float32")


def cluster_queries(
    queries: list[str],
    embeddings: EmbeddingProvider,
    *,
    max_clusters: int = 14,
    min_cluster_size: int = 2,
) -> list[QueryCluster]:
    if not queries:
        return []
    if len(queries) == 1:
        return [QueryCluster(id="cluster_0", label=_label_cluster(queries), member_indices=[0], top_terms=_top_terms(queries))]

    vectors = build_query_representations(queries, embeddings)
    vectors = _l2_normalize(vectors)

    # Pick a distance threshold based on "how similar do queries tend to be".
    # Lower = tighter clusters. This auto-adapts between sparse and focused logs.
    threshold = _choose_distance_threshold(vectors)

    labels = _cluster_labels(vectors, threshold)
    clusters = _clusters_from_labels(queries, labels, min_cluster_size=min_cluster_size)

    # If we ended up with too many tiny clusters, loosen slightly and retry once.
    if len(clusters) > max_clusters:
        labels = _cluster_labels(vectors, min(threshold * 1.15, 0.65))
        clusters = _clusters_from_labels(queries, labels, min_cluster_size=min_cluster_size)

    results: list[QueryCluster] = []
    for idx, member_indices in enumerate(sorted(clusters, key=len, reverse=True)):
        texts = [queries[i] for i in member_indices]
        results.append(
            QueryCluster(
                id=f"cluster_{idx}",
                label=_label_cluster(texts),
                member_indices=member_indices,
                top_terms=_top_terms(texts),
            )
        )

    # Include singletons as their own clusters at the end, so topic coverage still reflects them.
    used = {i for cluster in results for i in cluster.member_indices}
    for i, query in enumerate(queries):
        if i in used:
            continue
        results.append(
            QueryCluster(
                id=f"cluster_single_{i}",
                label=_label_cluster([query]),
                member_indices=[i],
                top_terms=_top_terms([query]),
            )
        )
    return results


def _l2_normalize(vectors: np.ndarray) -> np.ndarray:
    if vectors.size == 0:
        return vectors
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.where(norms == 0.0, 1.0, norms)
    return vectors / norms


def _choose_distance_threshold(vectors: np.ndarray) -> float:
    # Compute a cheap summary of pairwise cosine distances.
    n = vectors.shape[0]
    if n <= 2:
        return 0.35
    # Sample up to ~2000 pairs to avoid O(n^2) for large logs.
    max_pairs = 2000
    rng = np.random.default_rng(7)
    pairs = set()
    while len(pairs) < min(max_pairs, n * (n - 1) // 2):
        i = int(rng.integers(0, n))
        j = int(rng.integers(0, n))
        if i == j:
            continue
        if i > j:
            i, j = j, i
        pairs.add((i, j))
    distances = []
    for i, j in pairs:
        sim = float(np.dot(vectors[i], vectors[j]))
        distances.append(1.0 - max(min(sim, 1.0), -1.0))
    distances.sort()
    if not distances:
        return 0.35
    median = distances[len(distances) // 2]
    p20 = distances[int(len(distances) * 0.2)]
    # Heuristic: keep clusters tighter than the median, but don't over-tighten when data is noisy.
    threshold = median * 0.92
    threshold = max(0.18, min(threshold, 0.55))
    if p20 < 0.18:
        threshold = max(threshold, 0.22)
    return float(threshold)


def _cluster_labels(vectors: np.ndarray, distance_threshold: float) -> list[int]:
    """
    Prefer sklearn AgglomerativeClustering when available, but keep Ikion runnable
    in minimal environments by falling back to a pure-numpy greedy clustering.
    """
    try:
        from sklearn.cluster import AgglomerativeClustering

        model = AgglomerativeClustering(
            n_clusters=None,
            metric="cosine",
            linkage="average",
            distance_threshold=float(distance_threshold),
        )
        labels = model.fit_predict(vectors)
        return [int(value) for value in labels]
    except Exception:
        return _greedy_cosine_cluster_labels(vectors, distance_threshold)


def _greedy_cosine_cluster_labels(vectors: np.ndarray, distance_threshold: float) -> list[int]:
    # vectors are expected L2-normalized already
    n = vectors.shape[0]
    if n == 0:
        return []
    if n == 1:
        return [0]

    sim_threshold = 1.0 - float(distance_threshold)
    sim_threshold = max(min(sim_threshold, 0.98), -0.98)

    # Precompute similarities for a stable greedy clustering.
    sims = vectors @ vectors.T
    np.fill_diagonal(sims, 1.0)

    unassigned: set[int] = set(range(n))
    labels = [-1] * n
    current_label = 0

    # Seed clusters by "density": pick the point with most neighbors above threshold.
    while unassigned:
        candidates = list(unassigned)
        neighbor_counts = []
        for idx in candidates:
            row = sims[idx]
            neighbor_counts.append(int(np.sum(row[list(unassigned)] >= sim_threshold)))
        seed = candidates[int(np.argmax(neighbor_counts))]

        neighbors = [idx for idx in unassigned if sims[seed, idx] >= sim_threshold]
        if len(neighbors) <= 1:
            # Singleton; keep it isolated.
            labels[seed] = current_label
            current_label += 1
            unassigned.remove(seed)
            continue

        for idx in neighbors:
            labels[idx] = current_label
        current_label += 1
        for idx in neighbors:
            unassigned.discard(idx)

    # Any remaining -1 should not happen, but be safe.
    for idx, value in enumerate(labels):
        if value < 0:
            labels[idx] = current_label
            current_label += 1
    return labels


def _clusters_from_labels(
    queries: list[str],
    labels: list[int],
    *,
    min_cluster_size: int,
) -> list[list[int]]:
    groups: dict[int, list[int]] = {}
    for index, label in enumerate(labels):
        groups.setdefault(label, []).append(index)
    clusters = [indices for indices in groups.values() if len(indices) >= min_cluster_size]
    # Prefer clusters where members aren't almost-empty noise.
    clusters.sort(key=lambda idxs: (_avg_query_length(queries, idxs), len(idxs)), reverse=True)
    return clusters


def _avg_query_length(queries: list[str], indices: list[int]) -> float:
    if not indices:
        return 0.0
    return float(sum(len(clean_text(queries[i])) for i in indices) / len(indices))


def _top_terms(texts: list[str], top_k: int = 6) -> list[str]:
    docs = [clean_text(text) for text in texts if clean_text(text)]
    if not docs:
        return []
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer

        vectorizer = TfidfVectorizer(
            stop_words=sorted(STOPWORDS),
            ngram_range=(1, 2),
            min_df=1,
            max_df=0.9,
        )
        matrix = vectorizer.fit_transform(docs)
        scores = np.asarray(matrix.mean(axis=0)).ravel()
        terms = np.asarray(vectorizer.get_feature_names_out())
        order = scores.argsort()[::-1]
        selected = [terms[i] for i in order[: top_k * 2] if terms[i].strip()]
        # Reduce phrase noise: keep distinct leading tokens.
        deduped: list[str] = []
        seen: set[str] = set()
        for term in selected:
            key = term.split()[0]
            if key in seen:
                continue
            seen.add(key)
            deduped.append(term)
            if len(deduped) >= top_k:
                break
        return deduped
    except Exception:
        # Fallback: simple token counts.
        counter: dict[str, int] = {}
        for text in docs:
            for token in tokenize(text):
                if token in STOPWORDS:
                    continue
                counter[token] = counter.get(token, 0) + 1
        ranked = sorted(counter.items(), key=lambda item: (item[1], len(item[0])), reverse=True)
        return [token for token, _ in ranked[:top_k]]


def _label_cluster(texts: list[str]) -> str:
    terms = _top_terms(texts, top_k=4)
    if not terms:
        return "misc"
    # Prefer a concise 2-term label.
    label = " · ".join(term for term in terms[:2])
    return label.strip() or "misc"


def query_cluster_payload(
    clusters: list[QueryCluster],
    events: list[dict[str, Any]],
    *,
    role_by_user_id: dict[str, str],
    asset_titles: dict[str, dict[str, str]],
) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for cluster in clusters:
        member_events = [events[i] for i in cluster.member_indices if i < len(events)]
        status_counter: dict[str, int] = {}
        role_counter: dict[str, int] = {}
        support_scores: list[float] = []
        complexity_scores: list[float] = []
        cited_asset_counter: dict[str, int] = {}
        source_type_counter: dict[str, int] = {}

        for event in member_events:
            status_counter[event["response_status"]] = status_counter.get(event["response_status"], 0) + 1
            role = _role_for_event(event, role_by_user_id)
            role_counter[role] = role_counter.get(role, 0) + 1
            metrics = event.get("metrics") or {}
            support_scores.append(float(metrics.get("support_score", 0.0) or 0.0))
            complexity_scores.append(float(metrics.get("complexity_score", 0.0) or 0.0))
            for asset_id in event.get("cited_asset_ids") or []:
                cited_asset_counter[asset_id] = cited_asset_counter.get(asset_id, 0) + 1
            for retrieval_row in event.get("retrieval") or []:
                source_type = retrieval_row.get("asset_type") or "unknown"
                source_type_counter[source_type] = source_type_counter.get(source_type, 0) + 1

        examples = [events[i]["query_text"] for i in cluster.member_indices[:3] if i < len(events)]
        most_cited_assets = sorted(cited_asset_counter.items(), key=lambda item: item[1], reverse=True)[:5]
        most_cited_assets_payload = [
            {
                "asset_id": asset_id,
                "count": count,
                "title": asset_titles.get(asset_id, {}).get("title"),
                "asset_type": asset_titles.get(asset_id, {}).get("asset_type"),
            }
            for asset_id, count in most_cited_assets
        ]
        top_source_types = sorted(source_type_counter.items(), key=lambda item: item[1], reverse=True)[:6]

        payload.append(
            {
                "cluster_id": cluster.id,
                "label": cluster.label,
                "count": len(member_events),
                "examples": examples,
                "top_terms": cluster.top_terms,
                "status_breakdown": status_counter,
                "role_breakdown": role_counter,
                "avg_support_score": _mean_or_zero(support_scores),
                "avg_complexity_score": _mean_or_zero(complexity_scores),
                "top_assets": most_cited_assets_payload,
                "source_type_usage": [{"asset_type": key, "count": value} for key, value in top_source_types],
            }
        )
    return payload


def _mean_or_zero(values: list[float]) -> float:
    if not values:
        return 0.0
    return float(sum(values) / max(len(values), 1))


def _role_for_event(event: dict[str, Any], role_by_user_id: dict[str, str]) -> str:
    user_id = event.get("user_id")
    if not user_id:
        return "unknown"
    return role_by_user_id.get(user_id, "unknown")

