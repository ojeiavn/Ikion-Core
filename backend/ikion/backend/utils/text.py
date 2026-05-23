from __future__ import annotations

import re
import unicodedata

from collections import Counter
from itertools import islice


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "what",
    "when",
    "where",
    "which",
    "who",
    "will",
    "with",
}


def clean_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    normalized = normalized.replace("\u00a0", " ")
    normalized = re.sub(r"[\u2580-\u259f\u25a0-\u25ff]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def strip_lecture_artifacts(text: str) -> str:
    cleaned = clean_text(text)
    cleaned = re.sub(r"\b\d+(?:\.\d+)?\s*LECTURE\s*\d+\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bLECTURE\s*\d+\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text).strip("-").lower()
    return slug or "workspace"


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]{2,}", clean_text(text).lower())


def split_sentences(text: str) -> list[str]:
    cleaned = clean_text(text)
    if not cleaned:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]


def split_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", text) if p.strip()]
    if not paragraphs:
        paragraphs = split_sentences(text)
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if not current:
            current = paragraph
            continue
        candidate = f"{current}\n\n{paragraph}".strip()
        if len(candidate) <= chunk_size:
            current = candidate
            continue
        if current:
            chunks.append(current.strip())
        if len(paragraph) <= chunk_size:
            current = paragraph
            continue
        cursor = 0
        while cursor < len(paragraph):
            part = paragraph[cursor : cursor + chunk_size].strip()
            if part:
                chunks.append(part)
            cursor += max(chunk_size - overlap, 1)
        current = ""
    if current:
        chunks.append(current.strip())
    return [chunk for chunk in chunks if chunk]


def best_sentences_for_query(text: str, query: str, limit: int = 2) -> list[str]:
    query_tokens = set(tokenize(query))
    if not query_tokens:
        return split_sentences(text)[:limit]
    scored: list[tuple[int, int, str]] = []
    for sentence in split_sentences(text):
        sentence_tokens = set(tokenize(sentence))
        overlap = len(query_tokens.intersection(sentence_tokens))
        scored.append((overlap, len(sentence), sentence))
    scored.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [sentence for overlap, _, sentence in scored if overlap > 0][:limit] or split_sentences(text)[:limit]


def token_frequencies(texts: list[str], top_k: int = 10) -> list[dict[str, int | str]]:
    counter: Counter[str] = Counter()
    for text in texts:
        counter.update(token for token in tokenize(text) if token not in STOPWORDS)
    return [{"token": token, "count": count} for token, count in counter.most_common(top_k)]


def normalized_query_bucket(text: str) -> str:
    tokens = [token for token in tokenize(text) if token not in STOPWORDS]
    return " ".join(tokens[:8])


def keyword_overlap(query: str, text: str) -> float:
    query_tokens = {token for token in tokenize(query) if token not in STOPWORDS}
    if not query_tokens:
        return 0.0
    text_tokens = {token for token in tokenize(text) if token not in STOPWORDS}
    if not text_tokens:
        return 0.0
    return len(query_tokens.intersection(text_tokens)) / max(len(query_tokens), 1)


def salient_terms(text: str, top_k: int = 6) -> list[str]:
    counter: Counter[str] = Counter(token for token in tokenize(text) if token not in STOPWORDS)
    ranked = sorted(counter.items(), key=lambda item: (item[1], len(item[0]), item[0]), reverse=True)
    return [token for token, _ in ranked[:top_k]]


def salient_phrases(text: str, top_k: int = 4) -> list[str]:
    tokens = [token for token in tokenize(text) if token not in STOPWORDS]
    if len(tokens) < 2:
        return tokens[:top_k]
    counter: Counter[str] = Counter(
        f"{left} {right}"
        for left, right in zip(tokens, islice(tokens, 1, None))
        if left != right
    )
    ranked = sorted(counter.items(), key=lambda item: (item[1], len(item[0]), item[0]), reverse=True)
    phrases = [phrase for phrase, _ in ranked[:top_k]]
    if not phrases:
        return tokens[:top_k]
    return phrases


def concise_query(text: str, max_terms: int = 8) -> str:
    terms = [token for token in tokenize(text) if token not in STOPWORDS]
    return " ".join(terms[:max_terms])


def decompose_query(text: str) -> list[str]:
    cleaned = clean_text(text)
    if not cleaned:
        return []

    # Goal: generate a small set of retrieval-oriented sub-queries.
    # We bias towards "entity-focused" fragments for comparisons and multi-part questions.
    lowered = cleaned.lower()

    parts: list[str] = []

    # Split explicit multi-question prompts.
    for segment in re.split(r"\?\s+", cleaned):
        segment = segment.strip(" .?")
        if len(segment) >= 6:
            parts.append(segment)

    # Comparisons tend to hide multiple targets behind connectors.
    if any(keyword in lowered for keyword in ("compare", "difference between", "versus", " vs ", " vs.", " vs:", "pros and cons")):
        match = re.search(r"\b(?:difference between|compare)\b\s+(.*)", cleaned, flags=re.IGNORECASE)
        tail = match.group(1) if match else cleaned
        tail = tail.strip(" .?")
        # Try to extract the compared items.
        entity_parts = re.split(r"\b(?:and|versus|vs\.?)\b|[;,]", tail, flags=re.IGNORECASE)
        entities = [entity.strip(" .?") for entity in entity_parts if len(entity.strip(" .?")) >= 3]
        if len(entities) >= 2:
            for entity in entities[:3]:
                parts.append(entity)
            parts.append(f"Compare {entities[0]} vs {entities[1]}")

    # Generic connector split for long compound statements.
    raw_parts = re.split(
        r"\b(?:also|plus|along with|in addition to|then|next)\b|[;,]",
        cleaned,
        flags=re.IGNORECASE,
    )
    for part in raw_parts:
        part = part.strip(" .?")
        if len(part) >= 6:
            parts.append(part)

    deduped: list[str] = []
    seen: set[str] = set()
    for part in parts:
        normalized = part.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(part)
    # Keep the original query as the first element when decomposition yields meaningful variants.
    if deduped and deduped[0].strip().lower() != cleaned.strip().lower():
        deduped.insert(0, cleaned.strip(" .?"))
    return deduped[:6]


def looks_like_follow_up(text: str) -> bool:
    lowered = clean_text(text).lower()
    starters = (
        "what about",
        "how about",
        "and ",
        "also ",
        "why ",
        "when ",
        "where ",
        "who ",
        "does that",
        "do that",
        "can you expand",
        "tell me more",
        "go deeper",
        "explain that",
        "summarize that",
    )
    if lowered.startswith(starters):
        return True
    tokens = tokenize(lowered)
    return len(tokens) <= 6 and any(token in {"that", "those", "it", "they", "them", "this"} for token in tokens)


def generate_question_bank(text: str, title: str, asset_type: str, limit: int = 5) -> list[str]:
    phrases = salient_phrases(text, top_k=3)
    terms = salient_terms(text, top_k=3)
    prompts: list[str] = []
    lead = phrases or terms
    prefix = "transcript" if asset_type == "transcript" else "document"

    for phrase in lead:
        prompts.append(f"What does {title} say about {phrase}?")
        prompts.append(f"How is {phrase} explained in this {prefix}?")
        if asset_type == "transcript":
            prompts.append(f"Where is {phrase} discussed in the transcript?")

    deduped: list[str] = []
    seen: set[str] = set()
    for prompt in prompts:
        cleaned = clean_text(prompt)
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(cleaned)
        if len(deduped) >= limit:
            break
    return deduped


def query_complexity_score(text: str) -> float:
    tokens = tokenize(text)
    if not tokens:
        return 0.0
    length_score = min(len(tokens) / 24.0, 1.0)
    has_multi_part = 0.2 if len(decompose_query(text)) > 1 else 0.0
    has_constraints = 0.1 if any(word in tokens for word in ("compare", "difference", "explain", "why", "how")) else 0.0
    punctuation_bonus = 0.1 if text.count("?") > 1 or "," in text else 0.0
    return round(min(length_score + has_multi_part + has_constraints + punctuation_bonus, 1.0), 3)
