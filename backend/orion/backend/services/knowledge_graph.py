from __future__ import annotations

from collections import Counter, defaultdict
from itertools import combinations

from ..models import Chunk
from ..utils.text import clean_text, salient_terms, tokenize


class KnowledgeGraphService:
    def build_graph(
        self,
        chunks: list[Chunk],
        exam_questions: list[dict] | None = None,
        max_nodes: int = 240,
        max_neighbors: int = 8,
    ) -> dict:
        node_counts: Counter[str] = Counter()
        exam_counts: Counter[str] = Counter()
        edge_counts: Counter[tuple[str, str]] = Counter()

        for chunk in chunks:
            terms = [term for term in (chunk.metadata.get("salient_terms") or []) if isinstance(term, str)]
            if not terms:
                continue
            unique_terms = list(dict.fromkeys(term.strip().lower() for term in terms if term.strip()))
            node_counts.update(unique_terms)
            if str(chunk.metadata.get("document_category") or "").strip().lower() == "exam_paper":
                exam_counts.update(unique_terms)
            for left, right in combinations(sorted(unique_terms), 2):
                edge_counts[(left, right)] += 1

        exam_entries: list[dict] = []
        alias_index: dict[str, list[str]] = defaultdict(list)
        for question in exam_questions or []:
            question_id = str(question.get("id") or "").strip()
            if not question_id:
                continue
            question_text = clean_text(str(question.get("question_text") or ""))
            question_number = clean_text(str(question.get("question_number") or ""))
            topic_label = clean_text(str(question.get("topic_label") or ""))
            source_asset_title = clean_text(str(question.get("source_asset_title") or ""))

            key_terms = list(dict.fromkeys(
                [token for token in salient_terms(f"{question_text} {topic_label}", top_k=6) if token]
            ))
            aliases: list[str] = []
            if question_number:
                aliases.extend([f"q{question_number.lower()}", f"question {question_number.lower()}"])
            if source_asset_title:
                title_tokens = tokenize(source_asset_title)
                if title_tokens:
                    aliases.append(f"{' '.join(title_tokens[:2])} {question_number.lower()}".strip())
            aliases = [clean_text(alias).lower() for alias in aliases if clean_text(alias)]
            aliases = list(dict.fromkeys(aliases))

            node_counts.update(key_terms)
            exam_counts.update(key_terms)
            node_counts.update(aliases)
            exam_counts.update(aliases)
            for alias in aliases:
                for term in key_terms[:4]:
                    left, right = sorted((alias, term))
                    edge_counts[(left, right)] += 2

            for left, right in combinations(sorted(key_terms[:6]), 2):
                edge_counts[(left, right)] += 1

            exam_entries.append(
                {
                    "id": question_id,
                    "question_number": question.get("question_number"),
                    "source_asset_title": source_asset_title or None,
                    "topic_label": question.get("topic_label"),
                    "marks": question.get("marks"),
                    "origin_type": question.get("origin_type"),
                    "question_text_excerpt": question_text[:360],
                    "aliases": aliases[:6],
                    "key_terms": key_terms[:6],
                }
            )
            for alias in aliases:
                alias_index[alias].append(question_id)

        nodes = [
            {"term": term, "count": count, "exam_count": int(exam_counts.get(term, 0))}
            for term, count in node_counts.most_common(max_nodes)
        ]
        node_set = {node["term"] for node in nodes}
        edges = [
            {"source": left, "target": right, "weight": count}
            for (left, right), count in edge_counts.items()
            if left in node_set and right in node_set
        ]

        adjacency: dict[str, list[dict]] = defaultdict(list)
        for edge in edges:
            adjacency[edge["source"]].append({"term": edge["target"], "weight": edge["weight"]})
            adjacency[edge["target"]].append({"term": edge["source"], "weight": edge["weight"]})

        for term, neighbors in adjacency.items():
            neighbors.sort(key=lambda item: item["weight"], reverse=True)
            adjacency[term] = neighbors[:max_neighbors]

        return {
            "nodes": nodes,
            "edges": edges,
            "adjacency": dict(adjacency),
            "exam_questions": exam_entries,
            "exam_alias_index": dict(alias_index),
        }
