from __future__ import annotations

import math

import numpy as np


def _normalize_rows(vectors: np.ndarray) -> np.ndarray:
    vectors = np.asarray(vectors, dtype="float32")
    if vectors.ndim != 2:
        raise ValueError("Vectors must be a 2D matrix.")
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vectors / norms


def choose_k(n: int, max_k: int = 8) -> int:
    if n <= 0:
        return 0
    if n < 6:
        return 1
    # Heuristic: small n => small k; larger n increases slowly.
    k = int(round(math.sqrt(n / 2)))
    return max(2, min(max_k, k))


def kmeans_cosine(
    vectors: np.ndarray,
    k: int,
    *,
    max_iter: int = 25,
    seed: int = 42,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Lightweight k-means using cosine similarity (dot product on normalized vectors).
    Returns (labels, centroids) where centroids are normalized.
    """
    if k <= 0:
        raise ValueError("k must be >= 1.")
    vectors = _normalize_rows(vectors)
    n, dim = vectors.shape
    if k == 1 or n == 1:
        centroid = _normalize_rows(np.mean(vectors, axis=0, keepdims=True))
        return np.zeros((n,), dtype=np.int32), centroid
    k = min(k, n)

    rng = np.random.default_rng(seed)

    # k-means++ init (cosine distance = 1 - dot).
    centroids = np.empty((k, dim), dtype="float32")
    first = int(rng.integers(0, n))
    centroids[0] = vectors[first]
    closest_sim = vectors @ centroids[0]
    for idx in range(1, k):
        # Higher distance => higher probability.
        distances = np.maximum(1.0 - closest_sim, 0.0)
        probs = distances / max(float(distances.sum()), 1e-9)
        chosen = int(rng.choice(n, p=probs))
        centroids[idx] = vectors[chosen]
        closest_sim = np.maximum(closest_sim, vectors @ centroids[idx])

    labels = np.zeros((n,), dtype=np.int32)
    for _ in range(max_iter):
        sims = vectors @ centroids.T  # (n, k)
        new_labels = np.argmax(sims, axis=1).astype(np.int32)
        if np.array_equal(new_labels, labels):
            break
        labels = new_labels
        for cluster_id in range(k):
            members = vectors[labels == cluster_id]
            if members.size == 0:
                # Re-seed empty cluster to a random point.
                centroids[cluster_id] = vectors[int(rng.integers(0, n))]
                continue
            mean = np.mean(members, axis=0, keepdims=True)
            centroids[cluster_id] = _normalize_rows(mean)[0]

    return labels, centroids

