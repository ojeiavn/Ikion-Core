from __future__ import annotations

from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter

from ..models import ParsedSection
from ..utils.pdf_worker import load_pdf_pages
from ..utils.text import clean_text


def parse_pdf(
    path: str | Path,
    max_chunk_chars: int = 1200,
    chunk_overlap_chars: int = 180,
    use_semantic_chunking: bool = False,
    openai_api_key: str | None = None,
    embedding_model: str = "text-embedding-3-small",
) -> list[ParsedSection]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=max_chunk_chars,
        chunk_overlap=chunk_overlap_chars,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    semantic_chunker = None
    if use_semantic_chunking:
        if not openai_api_key:
            raise ValueError("Semantic chunking requires an OpenAI API key.")
        from langchain_experimental.text_splitter import SemanticChunker
        from langchain_openai import OpenAIEmbeddings
        from langchain_core.documents import Document

        try:
            semantic_chunker = SemanticChunker(
                OpenAIEmbeddings(model=embedding_model, api_key=openai_api_key),
                breakpoint_threshold_type="standard_deviation",
                min_chunk_size=max(300, max_chunk_chars // 3),
            )
        except Exception:
            # Do not fail ingestion/corpus build because semantic splitter init failed.
            # We fall back to deterministic recursive chunking.
            semantic_chunker = None
    sections: list[ParsedSection] = []
    for page in load_pdf_pages(Path(path)):
        page_index = int(page["page_number"])
        text = clean_text(str(page["text"]))
        if not text:
            continue
        parts: list[str]
        if semantic_chunker:
            try:
                docs = semantic_chunker.split_documents([Document(page_content=text)])
                parts = [clean_text(doc.page_content) for doc in docs if clean_text(doc.page_content)]
            except Exception:
                # Runtime semantic splitter failures (network/provider/transient)
                # degrade gracefully to recursive splitting.
                parts = [clean_text(part) for part in splitter.split_text(text) if clean_text(part)]
        else:
            parts = [clean_text(part) for part in splitter.split_text(text) if clean_text(part)]
        for part_index, part in enumerate(parts):
            cleaned = clean_text(part)
            if not cleaned:
                continue
            sections.append(
                ParsedSection(
                    text=cleaned,
                    metadata={
                        "page_number": page_index,
                        "locator": f"page {page_index}",
                        "pre_split": True,
                        "splitter": "langchain_recursive",
                        "split_index": part_index,
                    },
                )
            )
    return sections
