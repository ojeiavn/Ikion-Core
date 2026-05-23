from __future__ import annotations

import numpy as np

from pathlib import Path


try:
    import faiss
except Exception as exc:  # pragma: no cover - imported during runtime validation
    raise RuntimeError("faiss is required for Ikion Core retrieval.") from exc


def _normalize(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return vectors / norms


class FaissStore:
    @staticmethod
    def build(index_path: Path, vectors: np.ndarray) -> None:
        vectors = np.asarray(vectors, dtype="float32")
        if vectors.ndim != 2:
            raise ValueError("Vectors must be a 2D matrix.")
        normalized = _normalize(vectors)
        index = faiss.IndexFlatIP(normalized.shape[1])
        index.add(normalized)
        index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(index, str(index_path))

    @staticmethod
    def load(index_path: Path):
        return faiss.read_index(str(index_path))

    @staticmethod
    def load_from_bytes(payload: bytes):
        array = np.frombuffer(payload, dtype="uint8")
        return faiss.deserialize_index(array)

    @staticmethod
    def search(index, query_vector: np.ndarray, top_k: int) -> tuple[np.ndarray, np.ndarray]:
        query = np.asarray(query_vector, dtype="float32")
        if query.ndim == 1:
            query = query.reshape(1, -1)
        query = _normalize(query)
        scores, indices = index.search(query, top_k)
        return scores[0], indices[0]
