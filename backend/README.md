# Orion Core Backend

This backend is now structured as an Orion Core MVP rather than the original NovaCS research prototype.

## Runtime Architecture

The active backend lives under `backend/orion/backend/` and is organized around:

- `config.py`: centralized config and environment loading
- `db.py`: SQLite schema and access helpers
- `runtime.py`: service wiring
- `app.py`: FastAPI surface
- `services/`: workspaces, ingestion, corpus building, retrieval, answering, playback, logging, insights
- `storage/`: local file/corpus/FAISS helpers
- `parsers/`: PDF, transcript, and notice parsing
- `scripts/`: smoke test, corpus rebuild, legacy inventory import

Local persistence is under `backend/data/`:

```text
backend/data/
  uploads/
  corpora/<workspace_id>/<corpus_version_id>/
    manifest.json
    chunks.jsonl
    faiss/index.faiss
    assets/
  orion.db
```

## Product Model

The backend is now built around generic Orion Core concepts:

- Workspace
- Corpus Version
- Content Asset
- Chunk
- Guidance Pack
- Query Event
- Insight Snapshot

The runtime is intentionally generic and no longer hardcodes higher-education concepts into core services.

## Running

Run from the `backend/` directory:

```bash
cd backend
venv/bin/python -m orion.backend.scripts.smoke_test
venv/bin/python -m orion.backend.scripts.rebuild_corpus <workspace_id>
```

If you want to serve the API:

```bash
cd backend
venv/bin/uvicorn orion.backend.app:app --reload
```

## Legacy Code

The old prototype scripts still exist as reference material:

- `v5.py`
- `extra.py`
- `qb.py`
- `other.py`
- `migrate.py`
- `aqir_report.py`

They are no longer part of the Orion Core runtime path.
