from __future__ import annotations

import json
import math
import hashlib
import time

from collections import Counter, defaultdict
from typing import Any

from ..config import OrionConfig
from ..db import Database
from ..utils.ids import make_id
from ..utils.text import STOPWORDS, clean_text, normalized_query_bucket, token_frequencies, tokenize
from ..utils.time import utc_now_iso
from .corpus_builder import CorpusBuilderService
from .embeddings import EmbeddingProvider
from .exam_practice import ExamPracticeService
from .logging_service import QueryLoggingService
from .memberships import WorkspaceMembershipService
from .query_clustering import cluster_queries, query_cluster_payload


class InsightsService:
    def __init__(
        self,
        config: OrionConfig,
        db: Database,
        logging_service: QueryLoggingService,
        memberships: WorkspaceMembershipService,
        corpus_builder: CorpusBuilderService,
        embeddings: EmbeddingProvider,
        exam_practice: ExamPracticeService,
    ):
        self.config = config
        self.db = db
        self.logging_service = logging_service
        self.memberships = memberships
        self.corpus_builder = corpus_builder
        self.embeddings = embeddings
        self.exam_practice = exam_practice
        self._llm_cache: dict[str, tuple[float, dict[str, Any]]] = {}

    def generate_insights(self, workspace_id: str, limit: int = 200, user_id: str | None = None) -> dict:
        raw_events = self.logging_service.list_query_events(workspace_id, limit=max(limit * 3, limit))
        if user_id:
            events = [event for event in raw_events if event.get("user_id") == user_id][:limit]
        else:
            events = raw_events[:limit]
        assets = self.db.fetchall("SELECT id, title, asset_type FROM assets WHERE workspace_id = ?", (workspace_id,))
        asset_titles = {row["id"]: {"title": row["title"], "asset_type": row["asset_type"]} for row in assets}

        weak_buckets: dict[str, list[str]] = defaultdict(list)
        asset_counter: Counter[str] = Counter()
        source_type_counter: Counter[str] = Counter()
        daily_counter: Counter[str] = Counter()
        role_counter: Counter[str] = Counter()

        role_by_user_id = self._role_map(workspace_id, events)

        for event in events:
            metrics = event["metrics"]
            bucket = normalized_query_bucket(event["query_text"])
            if event["response_status"] in {"refused", "partial", "error"} or metrics.get("support_score", 0.0) < 0.2:
                if bucket:
                    weak_buckets[bucket].append(event["query_text"])

            role_counter[self._event_role(event, role_by_user_id)] += 1

            for asset_id in event["cited_asset_ids"]:
                asset_counter[asset_id] += 1

            for retrieval_row in event["retrieval"]:
                source_type_counter[retrieval_row.get("asset_type", "unknown")] += 1

            daily_counter[event["created_at"][:10]] += 1

        repeated_weak_queries = [
            {"bucket": bucket, "count": len(samples), "examples": samples[:3]}
            for bucket, samples in sorted(weak_buckets.items(), key=lambda item: len(item[1]), reverse=True)
            if len(samples) > 1
        ][:10]

        most_queried_assets = [
            {
                "asset_id": asset_id,
                "count": count,
                "title": asset_titles.get(asset_id, {}).get("title"),
                "asset_type": asset_titles.get(asset_id, {}).get("asset_type"),
            }
            for asset_id, count in asset_counter.most_common(10)
        ]

        clusters: list[dict[str, Any]] = []
        coverage = None
        graph_topics: list[dict[str, Any]] | None = None
        segments = None
        llm_insights = None
        topic_mastery = None
        topic_summary = token_frequencies([event["query_text"] for event in events], top_k=10)
        try:
            queries = [event["query_text"] for event in events]
            query_clusters = cluster_queries(queries, self.embeddings)
            clusters = query_cluster_payload(
                query_clusters,
                events,
                role_by_user_id=role_by_user_id,
                asset_titles=asset_titles,
            )

            corpus_graph = self._load_active_corpus_graph(workspace_id)
            if corpus_graph:
                graph_topics = self._graph_topics(corpus_graph)
                coverage = self._topic_coverage(corpus_graph, clusters, graph_topics)
            anchors = self._workspace_topic_anchors(asset_titles, graph_topics or [])

            llm_insights = self._llm_enrich_insights(
                workspace_id=workspace_id,
                user_id=user_id,
                events=events,
                clusters=clusters,
                graph_topics=graph_topics or [],
                anchors=anchors,
            )
            if llm_insights:
                clusters = self._apply_cluster_topic_labels(clusters, llm_insights, anchors)

            topic_summary = self._derive_topic_summary(events, clusters, llm_insights)
            topic_mastery = self._build_topic_mastery(
                workspace_id=workspace_id,
                user_id=user_id,
                events=events,
                clusters=clusters,
                anchors=anchors,
            )
            segments = self._segment_insights(events, clusters, role_by_user_id)
        except Exception:
            # Insights must never break the product surface; degrade to basic counters.
            clusters = []
            coverage = None
            graph_topics = None
            segments = None
            llm_insights = None
            topic_mastery = None

        summary = {
            "workspace_id": workspace_id,
            "generated_at": utc_now_iso(),
            "query_count": len(events),
            "top_topics": topic_summary,
            "repeated_weak_queries": repeated_weak_queries,
            "most_queried_assets": most_queried_assets,
            "source_type_usage": [{"source_type": key, "count": value} for key, value in source_type_counter.most_common()],
            "recent_query_counts": [{"date": key, "count": value} for key, value in sorted(daily_counter.items())],
            "role_breakdown": [{"role": role, "count": count} for role, count in role_counter.most_common()],
            "query_clusters": clusters,
            "topic_coverage": coverage,
            "graph_topics": graph_topics,
            "segments": segments,
            "llm_insights": llm_insights,
            "topic_mastery": topic_mastery,
            "exam_prep": self.exam_practice.get_exam_profile(workspace_id, user_id) if user_id else None,
        }

        self.db.execute(
            "INSERT INTO insights_snapshots (id, workspace_id, summary_json, created_at) VALUES (?, ?, ?, ?)",
            (make_id("insight"), workspace_id, json.dumps(summary), summary["generated_at"]),
        )
        return summary

    def list_snapshots(self, workspace_id: str, limit: int = 20) -> list[dict]:
        rows = self.db.fetchall(
            """
            SELECT * FROM insights_snapshots
            WHERE workspace_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (workspace_id, limit),
        )
        return [
            {
                "id": row["id"],
                "workspace_id": row["workspace_id"],
                "summary": json.loads(row["summary_json"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def _role_map(self, workspace_id: str, events: list[dict[str, Any]]) -> dict[str, str]:
        user_ids = sorted({event.get("user_id") for event in events if event.get("user_id")})
        if not user_ids:
            return {}

        placeholders = ", ".join("?" for _ in user_ids)
        rows = self.db.fetchall(
            f"""
            SELECT user_id, role
            FROM workspace_memberships
            WHERE workspace_id = ? AND user_id IN ({placeholders})
            """,
            (workspace_id, *user_ids),
        )
        mapped = {row["user_id"]: row["role"] for row in rows}

        # Fallback: if a user isn't explicitly a workspace member, use their global role.
        missing = [user_id for user_id in user_ids if user_id not in mapped]
        if missing:
            placeholders = ", ".join("?" for _ in missing)
            user_rows = self.db.fetchall(
                f"SELECT id, role FROM users WHERE id IN ({placeholders})",
                tuple(missing),
            )
            for row in user_rows:
                mapped[row["id"]] = row["role"]
        return mapped

    @staticmethod
    def _event_role(event: dict[str, Any], role_by_user_id: dict[str, str]) -> str:
        user_id = event.get("user_id")
        if not user_id:
            return "unknown"
        return role_by_user_id.get(user_id, "unknown")

    def _load_active_corpus_graph(self, workspace_id: str) -> dict[str, Any] | None:
        try:
            corpus = self.corpus_builder.get_active_corpus(workspace_id)
            payload = self.corpus_builder.load_corpus_payload(corpus)
        except Exception:
            return None
        return payload.get("graph") or None

    def _graph_topics(self, graph: dict[str, Any], max_topics: int = 12) -> list[dict[str, Any]]:
        """
        Derive "topics" from the corpus knowledge graph using community detection.
        This gives admins a domain-grounded map of what's in the workspace.
        """
        if not graph:
            return []

        try:
            import networkx as nx
            from networkx.algorithms.community import greedy_modularity_communities
        except Exception:
            return self._graph_topics_fallback(graph, max_topics=max_topics)

        g = nx.Graph()
        for node in graph.get("nodes", []) or []:
            term = node.get("term")
            if not term:
                continue
            g.add_node(term, count=int(node.get("count", 0) or 0))

        for edge in graph.get("edges", []) or []:
            left = edge.get("source")
            right = edge.get("target")
            if not left or not right:
                continue
            g.add_edge(left, right, weight=float(edge.get("weight", 1.0) or 1.0))

        if g.number_of_nodes() == 0:
            return []

        # Pagerank gives a stable "importance" metric for topic labeling.
        try:
            pagerank = nx.pagerank(g, weight="weight")
        except Exception:
            pagerank = {node: 0.0 for node in g.nodes()}

        communities = list(greedy_modularity_communities(g, weight="weight"))
        communities.sort(key=lambda c: len(c), reverse=True)
        topics: list[dict[str, Any]] = []

        for idx, community in enumerate(communities[:max_topics]):
            terms = list(community)
            terms.sort(key=lambda t: pagerank.get(t, 0.0), reverse=True)
            label_terms = terms[:4]
            topics.append(
                {
                    "topic_id": f"kg_topic_{idx}",
                    "label": " · ".join(label_terms[:2]) if label_terms else f"topic {idx + 1}",
                    "size": len(community),
                    "top_terms": label_terms,
                }
            )
        return topics

    def _graph_topics_fallback(self, graph: dict[str, Any], max_topics: int = 12) -> list[dict[str, Any]]:
        nodes = [node for node in (graph.get("nodes") or []) if node.get("term")]
        if not nodes:
            return []
        adjacency = graph.get("adjacency") or {}
        topics: list[dict[str, Any]] = []
        used: set[str] = set()
        ranked_nodes = sorted(nodes, key=lambda node: int(node.get("count", 0) or 0), reverse=True)
        for node in ranked_nodes:
            term = str(node.get("term"))
            if term in used:
                continue
            neighbors = [entry.get("term") for entry in (adjacency.get(term) or []) if entry.get("term")]
            top_terms = [term, *neighbors[:3]]
            label = " · ".join(top_terms[:2]) if len(top_terms) >= 2 else term
            topics.append(
                {
                    "topic_id": f"kg_topic_{len(topics)}",
                    "label": label,
                    "size": max(1, int(node.get("count", 0) or 1)),
                    "top_terms": top_terms[:4],
                }
            )
            used.add(term)
            used.update(neighbors[:2])
            if len(topics) >= max_topics:
                break
        return topics

    def _topic_coverage(
        self,
        graph: dict[str, Any],
        clusters: list[dict[str, Any]],
        graph_topics: list[dict[str, Any]] | None,
        *,
        top_terms_limit: int = 40,
    ) -> dict[str, Any]:
        nodes = graph.get("nodes", []) or []
        ranked_terms = [node.get("term") for node in nodes if node.get("term")]
        ranked_terms = ranked_terms[:top_terms_limit]

        cluster_terms: set[str] = set()
        for cluster in clusters:
            for term in cluster.get("top_terms") or []:
                cluster_terms.update(tokenize(term))
            cluster_terms.update(tokenize(cluster.get("label", "")))

        covered: list[dict[str, Any]] = []
        uncovered: list[dict[str, Any]] = []

        for term in ranked_terms:
            term_tokens = set(tokenize(str(term)))
            is_covered = bool(term_tokens.intersection(cluster_terms))
            payload = {"term": term}
            (covered if is_covered else uncovered).append(payload)

        coverage_ratio = 0.0
        if ranked_terms:
            coverage_ratio = float(len(covered) / len(ranked_terms))

        topic_coverage = None
        if graph_topics:
            # A cheap mapping from graph topics to cluster terms by overlap with topic label terms.
            topic_coverage = []
            for topic in graph_topics:
                topic_tokens = set()
                for term in topic.get("top_terms") or []:
                    topic_tokens.update(tokenize(term))
                has_queries = bool(topic_tokens.intersection(cluster_terms))
                topic_coverage.append(
                    {
                        "topic_id": topic.get("topic_id"),
                        "label": topic.get("label"),
                        "has_recent_queries": has_queries,
                    }
                )

        return {
            "top_terms_considered": len(ranked_terms),
            "covered_top_terms": covered,
            "uncovered_top_terms": uncovered,
            "coverage_ratio": coverage_ratio,
            "graph_topic_coverage": topic_coverage,
        }

    def _segment_insights(
        self,
        events: list[dict[str, Any]],
        clusters: list[dict[str, Any]],
        role_by_user_id: dict[str, str],
    ) -> dict[str, Any]:
        # Segment by role to support admin vs student surfaces without hardcoding vertical semantics.
        role_events: dict[str, list[int]] = defaultdict(list)
        for idx, event in enumerate(events):
            role_events[self._event_role(event, role_by_user_id)].append(idx)

        # Map cluster -> roles by counting member events.
        role_cluster_counts: dict[str, Counter[str]] = defaultdict(Counter)
        for cluster in clusters:
            for example in cluster.get("examples") or []:
                # examples are query texts; we still want member indices. Fall back to label breakdown.
                pass
            for role, count in (cluster.get("role_breakdown") or {}).items():
                role_cluster_counts[role][cluster.get("cluster_id")] += int(count or 0)

        def top_clusters_for(role: str) -> list[dict[str, Any]]:
            counts = role_cluster_counts.get(role) or Counter()
            ranked = counts.most_common(6)
            by_id = {cluster["cluster_id"]: cluster for cluster in clusters}
            return [
                {
                    "cluster_id": cluster_id,
                    "label": by_id.get(cluster_id, {}).get("label"),
                    "count": count,
                    "avg_support_score": by_id.get(cluster_id, {}).get("avg_support_score"),
                }
                for cluster_id, count in ranked
                if cluster_id in by_id
            ]

        weak_clusters = [
            cluster
            for cluster in clusters
            if (cluster.get("avg_support_score") or 0.0) < 0.25
            or (cluster.get("status_breakdown") or {}).get("refused", 0) >= max(2, math.ceil((cluster.get("count") or 0) * 0.4))
        ]
        weak_clusters.sort(key=lambda c: (c.get("avg_support_score") or 0.0, -(c.get("count") or 0)))

        return {
            "roles": sorted(role_events.keys()),
            "by_role": {
                role: {
                    "query_count": len(indices),
                    "top_clusters": top_clusters_for(role),
                }
                for role, indices in role_events.items()
            },
            "weak_clusters": [
                {
                    "cluster_id": cluster.get("cluster_id"),
                    "label": cluster.get("label"),
                    "count": cluster.get("count"),
                    "avg_support_score": cluster.get("avg_support_score"),
                    "examples": (cluster.get("examples") or [])[:2],
                }
                for cluster in weak_clusters[:8]
            ],
        }

    def _derive_topic_summary(
        self,
        events: list[dict[str, Any]],
        clusters: list[dict[str, Any]],
        llm_insights: dict[str, Any] | None,
        top_k: int = 10,
    ) -> list[dict[str, int | str]]:
        if not events:
            return []

        ranked: Counter[str] = Counter()
        if llm_insights:
            for topic in llm_insights.get("top_topics") or []:
                label = self._sanitize_topic_label(str(topic.get("topic", "")))
                if not label:
                    continue
                try:
                    count = int(topic.get("count", 0) or 0)
                except Exception:
                    count = 0
                if count > 0:
                    ranked[label] += count

        has_llm_topics = bool(ranked)

        for cluster in clusters:
            label = self._sanitize_topic_label(str(cluster.get("label", "")))
            if not label:
                terms = [self._sanitize_topic_label(str(term)) for term in (cluster.get("top_terms") or [])]
                terms = [term for term in terms if term]
                if terms:
                    label = " / ".join(terms[:2])
            if not label:
                continue
            count = int(cluster.get("count", 0) or 0)
            if count <= 0:
                count = len(cluster.get("examples") or []) or 1
            if has_llm_topics:
                if label not in ranked:
                    ranked[label] = count
            else:
                ranked[label] += count

        if not ranked:
            return token_frequencies([event["query_text"] for event in events], top_k=top_k)

        return [
            {"token": topic, "count": count}
            for topic, count in ranked.most_common(top_k)
        ]

    def _apply_cluster_topic_labels(
        self,
        clusters: list[dict[str, Any]],
        llm_insights: dict[str, Any],
        anchors: set[str],
    ) -> list[dict[str, Any]]:
        topic_map = {
            str(item.get("cluster_id")): self._align_label_to_workspace(
                self._sanitize_topic_label(str(item.get("topic", ""))),
                anchors,
            )
            for item in (llm_insights.get("cluster_topics") or [])
            if item.get("cluster_id")
        }
        if not topic_map:
            return clusters

        relabeled: list[dict[str, Any]] = []
        for cluster in clusters:
            copy = dict(cluster)
            cluster_id = str(cluster.get("cluster_id", ""))
            llm_label = topic_map.get(cluster_id)
            if llm_label:
                copy["label"] = llm_label
            relabeled.append(copy)
        return relabeled

    def _llm_enrich_insights(
        self,
        workspace_id: str,
        user_id: str | None,
        events: list[dict[str, Any]],
        clusters: list[dict[str, Any]],
        graph_topics: list[dict[str, Any]],
        anchors: set[str],
    ) -> dict[str, Any] | None:
        if not events or not clusters:
            return None
        if self.config.answer_provider != "openai" or not self.config.openai_api_key:
            return None

        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.config.openai_api_key)
            query_samples = [clean_text(event.get("query_text", "")) for event in events[:56] if event.get("query_text")]
            cluster_payload = [
                {
                    "cluster_id": cluster.get("cluster_id"),
                    "label": cluster.get("label"),
                    "count": cluster.get("count"),
                    "top_terms": (cluster.get("top_terms") or [])[:5],
                    "examples": (cluster.get("examples") or [])[:2],
                    "avg_support_score": cluster.get("avg_support_score"),
                }
                for cluster in clusters[:16]
            ]
            graph_payload = [
                {
                    "topic_id": topic.get("topic_id"),
                    "label": topic.get("label"),
                    "top_terms": (topic.get("top_terms") or [])[:4],
                    "size": topic.get("size"),
                }
                for topic in graph_topics[:12]
            ]
            payload_seed = {
                "workspace_id": workspace_id,
                "user_id": user_id or "__workspace__",
                "queries": query_samples,
                "clusters": cluster_payload,
                "graph_topics": graph_payload,
                "anchors": sorted(list(anchors))[:48],
            }
            cache_key = f"insights:llm:{hashlib.sha1(json.dumps(payload_seed, sort_keys=True).encode('utf-8')).hexdigest()}"
            cached = self._cache_get(cache_key, ttl_seconds=180)
            if cached:
                return cached

            prompt = json.dumps(
                {
                    **payload_seed,
                    "instructions": {
                        "goal": "Name real course topics from user query history.",
                        "requirements": [
                            "Use domain/topic labels from this workspace, never stopwords/filler tokens.",
                            "Prefer labels grounded in provided anchors and graph topics.",
                            "Map each cluster to one short pedagogical topic.",
                            "Return up to 10 top topics with counts.",
                            "Provide one student summary and one lecturer action summary.",
                            "Keep highlights concrete and evidence-grounded.",
                        ],
                        "response_schema": {
                            "cluster_topics": [{"cluster_id": "string", "topic": "string"}],
                            "top_topics": [{"topic": "string", "count": 0}],
                            "student_summary": "string",
                            "lecturer_summary": "string",
                            "highlights": ["string"],
                        },
                    },
                },
                ensure_ascii=False,
            )

            response = client.chat.completions.create(
                model=self.config.openai_chat_model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": "You produce strict JSON analytics summaries for learning query insights.",
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            sanitized = self._sanitize_llm_insights(payload, anchors=anchors)
            self._cache_set(cache_key, sanitized)
            return sanitized
        except Exception:
            return None

    def _sanitize_llm_insights(self, payload: dict[str, Any], *, anchors: set[str]) -> dict[str, Any]:
        cluster_topics = []
        for row in payload.get("cluster_topics") or []:
            cluster_id = str(row.get("cluster_id", "")).strip()
            topic = self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("topic", ""))), anchors)
            if not cluster_id or not topic:
                continue
            cluster_topics.append({"cluster_id": cluster_id, "topic": topic})

        top_topics = []
        for row in payload.get("top_topics") or []:
            topic = self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("topic", ""))), anchors)
            if not topic:
                continue
            try:
                count = int(row.get("count", 0) or 0)
            except Exception:
                count = 0
            if count <= 0:
                continue
            top_topics.append({"topic": topic, "count": count})

        highlights = []
        for line in payload.get("highlights") or []:
            cleaned = clean_text(str(line))
            if cleaned:
                highlights.append(cleaned)

        return {
            "cluster_topics": cluster_topics[:20],
            "top_topics": top_topics[:10],
            "student_summary": clean_text(str(payload.get("student_summary", "")))[:700],
            "lecturer_summary": clean_text(str(payload.get("lecturer_summary", "")))[:700],
            "highlights": highlights[:6],
        }

    def generate_topic_notes(self, workspace_id: str, user_id: str, limit: int = 140) -> dict[str, Any]:
        raw_events = self.logging_service.list_query_events(workspace_id, limit=max(limit * 3, limit))
        events = [event for event in raw_events if event.get("user_id") == user_id][:limit]
        assets = self.db.fetchall("SELECT id, title, asset_type FROM assets WHERE workspace_id = ?", (workspace_id,))
        asset_titles = {row["id"]: {"title": row["title"], "asset_type": row["asset_type"]} for row in assets}

        if not events:
            return {
                "workspace_id": workspace_id,
                "generated_at": utc_now_iso(),
                "topics": [],
            }

        queries = [event.get("query_text", "") for event in events]
        query_clusters = cluster_queries(queries, self.embeddings)
        clusters = query_cluster_payload(
            query_clusters,
            events,
            role_by_user_id={user_id: "student"},
            asset_titles=asset_titles,
        )
        corpus_graph = self._load_active_corpus_graph(workspace_id)
        graph_topics = self._graph_topics(corpus_graph) if corpus_graph else []
        anchors = self._workspace_topic_anchors(asset_titles, graph_topics)

        note_blocks = self._llm_collate_notes(
            workspace_id=workspace_id,
            user_id=user_id,
            clusters=clusters,
            events=events,
            anchors=anchors,
            asset_titles=asset_titles,
        )
        block_by_cluster = {str(block.get("cluster_id")): block for block in note_blocks}
        topics: list[dict[str, Any]] = []

        for cluster in clusters[:12]:
            cluster_id = str(cluster.get("cluster_id"))
            block = block_by_cluster.get(cluster_id, {})
            member_queries = set(cluster.get("examples") or [])
            cluster_events = [event for event in events if event.get("query_text") in member_queries][:10]
            if not cluster_events:
                cluster_events = events[: min(len(events), 3)]
            keywords = [self._sanitize_topic_label(str(term)) for term in (cluster.get("top_terms") or [])]
            keywords = [term for term in keywords if term]

            top_assets = []
            for row in (cluster.get("top_assets") or [])[:4]:
                top_assets.append(
                    {
                        "asset_id": row.get("asset_id"),
                        "count": int(row.get("count", 0) or 0),
                        "title": row.get("title"),
                        "asset_type": row.get("asset_type"),
                    }
                )

            last_updated = cluster_events[0].get("created_at") if cluster_events else utc_now_iso()
            topics.append(
                {
                    "id": cluster_id,
                    "label": block.get("label") or cluster.get("label"),
                    "summary": block.get("summary")
                    or f"Collated from {cluster.get('count', 0)} grounded queries in this workspace topic.",
                    "brief": block.get("brief")
                    or self._deterministic_topic_brief(cluster),
                    "keywords": [term.title() for term in keywords[:6]],
                    "notes": cluster_events,
                    "top_assets": top_assets,
                    "last_updated": last_updated,
                    "playback_count": sum(1 for event in cluster_events if event.get("playback")),
                    "graph_label": block.get("graph_label"),
                    "representative_questions": cluster.get("examples") or [],
                }
            )

        return {
            "workspace_id": workspace_id,
            "generated_at": utc_now_iso(),
            "topics": topics,
        }

    def _llm_collate_notes(
        self,
        workspace_id: str,
        user_id: str,
        clusters: list[dict[str, Any]],
        events: list[dict[str, Any]],
        anchors: set[str],
        asset_titles: dict[str, dict[str, str]],
    ) -> list[dict[str, Any]]:
        if not clusters:
            return []
        if self.config.answer_provider != "openai" or not self.config.openai_api_key:
            return []

        cluster_events: dict[str, list[dict[str, Any]]] = {}
        for cluster in clusters[:12]:
            samples = set(cluster.get("examples") or [])
            rows = [event for event in events if event.get("query_text") in samples][:4]
            cluster_events[str(cluster.get("cluster_id"))] = rows

        llm_payload = []
        for cluster in clusters[:12]:
            cluster_id = str(cluster.get("cluster_id"))
            rows = cluster_events.get(cluster_id) or []
            llm_payload.append(
                {
                    "cluster_id": cluster_id,
                    "label": cluster.get("label"),
                    "top_terms": (cluster.get("top_terms") or [])[:6],
                    "avg_support_score": cluster.get("avg_support_score"),
                    "examples": [
                        {
                            "query": row.get("query_text"),
                            "answer_excerpt": clean_text(str(row.get("response_text", "")))[:320],
                        }
                        for row in rows
                    ],
                    "top_assets": [
                        {
                            "title": item.get("title"),
                            "asset_type": item.get("asset_type"),
                        }
                        for item in (cluster.get("top_assets") or [])[:3]
                        if item.get("asset_id") in asset_titles
                    ],
                }
            )

        key_seed = {
            "workspace_id": workspace_id,
            "user_id": user_id,
            "clusters": llm_payload,
            "anchors": sorted(list(anchors))[:40],
        }
        cache_key = f"notes:llm:{hashlib.sha1(json.dumps(key_seed, sort_keys=True).encode('utf-8')).hexdigest()}"
        cached = self._cache_get(cache_key, ttl_seconds=180)
        if cached:
            return cached.get("topics") or []

        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.config.openai_api_key)
            prompt = json.dumps(
                {
                    **key_seed,
                    "instructions": {
                        "goal": "Create concise professional collated notes per cluster, grounded in the student's own prior conversation content.",
                        "requirements": [
                            "Only use workspace-relevant labels from anchors/clusters.",
                            "Produce practical revision notes, not generic summaries.",
                            "Return Markdown in `brief` with headings and bullet points.",
                            "Include one short summary sentence per topic.",
                        ],
                        "response_schema": {
                            "topics": [
                                {
                                    "cluster_id": "string",
                                    "label": "string",
                                    "summary": "string",
                                    "brief": "markdown",
                                    "graph_label": "string|null",
                                }
                            ]
                        },
                    },
                },
                ensure_ascii=False,
            )
            response = client.chat.completions.create(
                model=self.config.openai_chat_model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": "You produce strict JSON topic note summaries for a study assistant."},
                    {"role": "user", "content": prompt},
                ],
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            rows = []
            for row in payload.get("topics") or []:
                label = self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("label", ""))), anchors)
                if not label:
                    continue
                rows.append(
                    {
                        "cluster_id": str(row.get("cluster_id", "")).strip(),
                        "label": label,
                        "summary": clean_text(str(row.get("summary", "")))[:280],
                        "brief": str(row.get("brief", "")).strip(),
                        "graph_label": clean_text(str(row.get("graph_label", "")))[:120] or None,
                    }
                )
            result = {"topics": rows}
            self._cache_set(cache_key, result)
            return rows
        except Exception:
            return []

    def _build_topic_mastery(
        self,
        workspace_id: str,
        user_id: str | None,
        events: list[dict[str, Any]],
        clusters: list[dict[str, Any]],
        anchors: set[str],
    ) -> dict[str, Any]:
        if not clusters:
            return {"strong_topics": [], "weak_topics": [], "judge_summary": ""}

        judged = []
        for cluster in clusters:
            label = self._align_label_to_workspace(self._sanitize_topic_label(str(cluster.get("label", ""))), anchors)
            if not label:
                continue
            count = int(cluster.get("count", 0) or 0)
            status_breakdown = cluster.get("status_breakdown") or {}
            refused = int(status_breakdown.get("refused", 0) or 0)
            partial = int(status_breakdown.get("partial", 0) or 0)
            answered = int(status_breakdown.get("answered", 0) or 0)
            avg_support = float(cluster.get("avg_support_score", 0.0) or 0.0)
            total = max(1, refused + partial + answered)
            refused_ratio = refused / total
            partial_ratio = partial / total
            answered_ratio = answered / total
            mastery_score = max(
                0.0,
                min(
                    1.0,
                    avg_support * 0.7 + answered_ratio * 0.22 - refused_ratio * 0.24 - partial_ratio * 0.1,
                ),
            )
            judged.append(
                {
                    "topic": label,
                    "count": count,
                    "mastery_score": round(mastery_score, 3),
                    "avg_support_score": round(avg_support, 3),
                    "refused_ratio": round(refused_ratio, 3),
                    "partial_ratio": round(partial_ratio, 3),
                    "status_breakdown": status_breakdown,
                }
            )

        judged.sort(key=lambda row: (row["mastery_score"], row["count"]), reverse=True)
        strong = [row for row in judged if row["mastery_score"] >= 0.52 and row["count"] >= 2][:6]
        weak = [row for row in sorted(judged, key=lambda row: (row["mastery_score"], -row["count"])) if row["mastery_score"] < 0.38][:6]
        llm_verdict = self._llm_judge_topic_mastery(
            workspace_id=workspace_id,
            user_id=user_id,
            judged=judged[:14],
            anchors=anchors,
        )
        if llm_verdict:
            llm_strong = [
                row for row in llm_verdict.get("strong_topics", [])
                if self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("topic", ""))), anchors)
            ]
            llm_weak = [
                row for row in llm_verdict.get("weak_topics", [])
                if self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("topic", ""))), anchors)
            ]
            if llm_strong:
                strong = llm_strong[:6]
            if llm_weak:
                weak = llm_weak[:6]
            summary = clean_text(str(llm_verdict.get("judge_summary", "")))[:500]
        else:
            summary = "Topic mastery uses query support, response status mix, and repeated evidence-grounded performance."

        return {
            "strong_topics": strong,
            "weak_topics": weak,
            "judge_summary": summary,
        }

    def _llm_judge_topic_mastery(
        self,
        workspace_id: str,
        user_id: str | None,
        judged: list[dict[str, Any]],
        anchors: set[str],
    ) -> dict[str, Any] | None:
        if not judged:
            return None
        if self.config.answer_provider != "openai" or not self.config.openai_api_key:
            return None
        seed = {
            "workspace_id": workspace_id,
            "user_id": user_id or "__workspace__",
            "judged": judged,
            "anchors": sorted(list(anchors))[:40],
        }
        cache_key = f"mastery:llm:{hashlib.sha1(json.dumps(seed, sort_keys=True).encode('utf-8')).hexdigest()}"
        cached = self._cache_get(cache_key, ttl_seconds=180)
        if cached:
            return cached
        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.config.openai_api_key)
            prompt = json.dumps(
                {
                    **seed,
                    "instructions": {
                        "goal": "Judge strong and weak course topics based on performance metrics.",
                        "requirements": [
                            "Do not invent topics outside anchors or judged topic list.",
                            "Strong topics: sustained high support and low refusal rates.",
                            "Weak topics: low support or repeated refusal/partial responses.",
                            "Return concise rationale text.",
                        ],
                        "response_schema": {
                            "strong_topics": [{"topic": "string", "reason": "string", "mastery_score": 0.0}],
                            "weak_topics": [{"topic": "string", "reason": "string", "mastery_score": 0.0}],
                            "judge_summary": "string",
                        },
                    },
                },
                ensure_ascii=False,
            )
            response = client.chat.completions.create(
                model=self.config.openai_chat_model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": "You produce strict JSON topic mastery judgments for student analytics."},
                    {"role": "user", "content": prompt},
                ],
            )
            payload = json.loads(response.choices[0].message.content or "{}")
            normalized = {
                "strong_topics": [],
                "weak_topics": [],
                "judge_summary": clean_text(str(payload.get("judge_summary", "")))[:500],
            }
            for row in payload.get("strong_topics") or []:
                topic = self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("topic", ""))), anchors)
                if not topic:
                    continue
                normalized["strong_topics"].append(
                    {
                        "topic": topic,
                        "reason": clean_text(str(row.get("reason", "")))[:240],
                        "mastery_score": float(row.get("mastery_score", 0.0) or 0.0),
                    }
                )
            for row in payload.get("weak_topics") or []:
                topic = self._align_label_to_workspace(self._sanitize_topic_label(str(row.get("topic", ""))), anchors)
                if not topic:
                    continue
                normalized["weak_topics"].append(
                    {
                        "topic": topic,
                        "reason": clean_text(str(row.get("reason", "")))[:240],
                        "mastery_score": float(row.get("mastery_score", 0.0) or 0.0),
                    }
                )
            self._cache_set(cache_key, normalized)
            return normalized
        except Exception:
            return None

    def _workspace_topic_anchors(
        self,
        asset_titles: dict[str, dict[str, str]],
        graph_topics: list[dict[str, Any]],
    ) -> set[str]:
        anchors: set[str] = set()
        for topic in graph_topics:
            anchors.update(tokenize(str(topic.get("label", ""))))
            for term in topic.get("top_terms") or []:
                anchors.update(tokenize(str(term)))
        for entry in asset_titles.values():
            anchors.update(tokenize(str(entry.get("title", ""))))
        return {token for token in anchors if token and token not in STOPWORDS and len(token) > 2}

    def _align_label_to_workspace(self, label: str, anchors: set[str]) -> str:
        if not label:
            return ""
        if not anchors:
            return label
        label_tokens = set(tokenize(label))
        if label_tokens.intersection(anchors):
            return label
        return ""

    @staticmethod
    def _deterministic_topic_brief(cluster: dict[str, Any]) -> str:
        top_terms = [clean_text(str(term)) for term in (cluster.get("top_terms") or []) if clean_text(str(term))]
        examples = [clean_text(str(example)) for example in (cluster.get("examples") or []) if clean_text(str(example))]
        lines = [
            "Topic Brief",
            f"This note cluster aggregates {cluster.get('count', 0)} grounded exchanges on this topic.",
        ]
        if top_terms:
            lines.append("Core subtopics")
            lines.extend(f"- {term}" for term in top_terms[:5])
        if examples:
            lines.append("Representative questions")
            lines.extend(f"- {example}" for example in examples[:3])
        return "\n\n".join(lines)

    def _cache_get(self, key: str, ttl_seconds: int) -> dict[str, Any] | None:
        row = self._llm_cache.get(key)
        if not row:
            return None
        created_at, payload = row
        if time.time() - created_at > ttl_seconds:
            self._llm_cache.pop(key, None)
            return None
        return payload

    def _cache_set(self, key: str, payload: dict[str, Any]) -> None:
        self._llm_cache[key] = (time.time(), payload)

    @staticmethod
    def _sanitize_topic_label(value: str) -> str:
        cleaned = clean_text(value).strip(" .,:;|-")
        if not cleaned:
            return ""
        lowered = cleaned.lower()
        if lowered in STOPWORDS or len(lowered) < 3:
            return ""
        if lowered in {"me", "about", "give", "tell", "please", "explain", "what", "how", "why"}:
            return ""
        words = [word for word in lowered.split() if word and word not in STOPWORDS]
        if not words:
            return ""
        if len(words) == 1 and len(words[0]) < 4:
            return ""
        phrase = " ".join(words[:6])
        return phrase.title()
