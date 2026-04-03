from __future__ import annotations

import hashlib
import re

import numpy as np

from ..config import OrionConfig
from ..utils.text import clean_text, tokenize


class EmbeddingProvider:
    dimension: int

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        raise NotImplementedError

    def embed_query(self, text: str) -> np.ndarray:
        return self.embed_texts([text])[0]


class LocalHashEmbeddings(EmbeddingProvider):
    def __init__(self, dimension: int = 384):
        self.dimension = dimension

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        return np.asarray([self._embed(text) for text in texts], dtype="float32")

    def _embed(self, text: str) -> np.ndarray:
        vector = np.zeros(self.dimension, dtype="float32")
        normalized = clean_text(text).lower()
        tokens = tokenize(normalized)
        bigrams = [f"{left}_{right}" for left, right in zip(tokens, tokens[1:])]
        compact_text = re.sub(r"\s+", " ", normalized)
        trigrams = [compact_text[idx : idx + 3] for idx in range(max(len(compact_text) - 2, 0))]

        features: list[tuple[str, str, float]] = []
        features.extend(("tok", token, 1.4) for token in tokens)
        features.extend(("bg", token, 0.9) for token in bigrams)
        features.extend(("tri", token, 0.35) for token in trigrams if token.strip())
        if not features:
            features.append(("tok", "__empty__", 1.0))

        for namespace, feature, weight in features:
            digest = hashlib.sha1(f"{namespace}:{feature}".encode("utf-8")).digest()
            slot = int.from_bytes(digest[:8], "big") % self.dimension
            sign = 1.0 if digest[8] % 2 == 0 else -1.0
            vector[slot] += weight * sign
        return vector


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str, model: str):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.dimension = 1536

    def embed_texts(self, texts: list[str]) -> np.ndarray:
        response = self.client.embeddings.create(model=self.model, input=texts)
        data = [item.embedding for item in response.data]
        if data:
            self.dimension = len(data[0])
        return np.asarray(data, dtype="float32")


def build_embedding_provider(config: OrionConfig) -> EmbeddingProvider:
    if config.embedding_provider == "openai":
        if not config.openai_api_key:
            raise ValueError("ORION_EMBEDDING_PROVIDER=openai requires ORION_OPENAI_API_KEY or OPENAI_API_KEY.")
        return OpenAIEmbeddingProvider(config.openai_api_key, config.openai_embedding_model)
    return LocalHashEmbeddings(config.embedding_dimension)

