# Ikion — AI Study Assistant

> **Course-grounded AI for universities.** Ask questions, get answers with citations, jump to exact lecture moments, and prepare for exams with confidence.

Ikion is a full-stack Retrieval-Augmented Generation (RAG) platform designed for higher education. It ingests course materials (PDFs, lecture videos, transcripts, notices), builds searchable vector indexes, and serves grounded answers to students, analytics to lecturers, and content management tools to administrators.

---

## ✨ What It Does

| Capability | Description |
|------------|-------------|
| **📚 Course-Grounded AI** | Students ask questions in natural language. Ikion answers using only the uploaded course materials — every response includes numbered citations linked to source documents. |
| **🎬 Lecture Video Navigation** | Upload lecture recordings (or link external videos). Ikion auto-generates transcripts and can jump students to the exact timestamp where a concept is explained. |
| **📝 Exam Preparation** | Parses past exam papers and mark schemes. Recommends questions based on student readiness, evaluates answers against rubrics, and generates inspired practice variants. |
| **📊 Query Insights (AQIR)** | Lecturers and admins see cohort-wide analytics: common misconceptions, topic coverage gaps, repeated weak queries, and AI-generated teaching focus summaries. |
| **🏢 Workspace Management** | Admins create workspaces (courses/modules), upload materials, publish guidance packs (custom LLM instructions), and rebuild search indexes on demand. |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│              Next.js 16 (App Router) + React 19             │
│   Tailwind CSS · shadcn/ui · next-themes · Vercel Analytics │
│                                                             │
│   Pages:  Landing · Login · Dashboard · Lecturer · Admin    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼ REST + cookie sessions
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                              │
│                     FastAPI + Python                        │
│   SQLite (WAL) · FAISS · OpenAI · Google Drive (optional)   │
│                                                             │
│   Services: Auth · Workspaces · Ingestion · Corpus Builder  │
│   Retrieval · Answering · Playback · Exam Practice          │
│   Insights · Transcription · Conversation Graph (LangGraph) │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

- **Runtime-as-DI** — `IkionCoreRuntime` wires ~20 services as a single composition root.
- **Immutable Corpus Versions** — Every index build creates a versioned snapshot (chunks + FAISS + manifest). Old versions remain recoverable.
- **Multi-Variant RAG** — Queries are expanded into variants (condensed, decomposed, history-rewritten), fused with RRF, and reranked with MMR + knowledge-graph alignment.
- **Reflection Pass** — Every LLM answer goes through deterministic post-processing (LaTeX normalization, citation enforcement, follow-up focus injection).
- **Graceful Degradation** — Optional dependencies (LangGraph, sklearn, networkx, Google Drive, OpenAI) all have runtime fallbacks.

---

## 🗂️ Project Structure

```
project-root/
├── frontend/                 # Next.js application
│   ├── app/                  # App Router pages
│   │   ├── page.tsx          # Marketing landing page
│   │   ├── login/page.tsx    # Auth (bootstrap + sign-in)
│   │   ├── dashboard/        # Student home (exam readiness, topics, ask)
│   │   ├── lecturer/         # Lecturer analytics dashboard
│   │   └── admin/            # Admin content management panel
│   ├── components/
│   │   ├── auth-provider.tsx # Session context (cookie-based auth)
│   │   ├── protected-shell.tsx # Route guards + chrome layout
│   │   ├── app-sidebar.tsx   # Role-aware navigation
│   │   ├── ai-answer-block.tsx
│   │   ├── citation-card.tsx
│   │   ├── playback-moments-panel.tsx
│   │   └── video-player-card.tsx
│   ├── lib/
│   │   ├── ikion-api.ts      # Typed fetch wrapper + API client
│   │   └── workspace-store.ts # localStorage active workspace
│   └── public/               # Logos, icons, mock UI assets
│
├── backend/                  # FastAPI application
│   ├── ikion/backend/
│   │   ├── app.py            # All HTTP routes & auth middleware
│   │   ├── models.py         # Domain dataclasses
│   │   ├── runtime.py        # Service wiring / DI container
│   │   ├── config.py         # Environment & path configuration
│   │   ├── db.py             # SQLite schema + access helpers
│   │   ├── services/         # ~20 business-logic modules
│   │   │   ├── answering.py          # Full ask orchestration
│   │   │   ├── corpus_builder.py     # Indexing pipeline
│   │   │   ├── rag_pipeline.py       # Multi-query retrieval engine
│   │   │   ├── retrieval.py          # FAISS + corpus loading
│   │   │   ├── exam_practice.py      # Exam parsing & evaluation
│   │   │   ├── exam_chat_subagent.py # Exam intent detection
│   │   │   ├── insights.py           # Analytics & clustering
│   │   │   ├── conversation_graph.py # LangGraph turn planner
│   │   │   ├── transcription.py      # Whisper background jobs
│   │   │   └── ...
│   │   ├── parsers/          # PDF, transcript, notice parsers
│   │   ├── storage/          # FileStore, FAISS, Drive client, manifest
│   │   ├── prompts/          # LLM system prompts
│   │   └── tests/            # Pytest suites
│   ├── data/                 # Local persistence (SQLite + uploads + corpora)
│   └── requirements.txt
│
└── README.md                 # You are here
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ & npm/pnpm (frontend)
- **Python** 3.11+ with virtualenv (backend)
- **OpenAI API key** (embeddings + chat + whisper)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

pip install -r requirements.txt

# Optional: copy .env and fill in OPENAI_API_KEY, FRONTEND_ORIGINS, etc.
# cp .env.example .env

# Run the API server
venv/bin/uvicorn ikion.backend.app:app --reload --port 8000
```

**Bootstrap the first admin:**

On first run, visit the frontend login page and create the initial admin account, or call the bootstrap endpoint directly.

### 2. Frontend

```bash
cd frontend
npm install   # or pnpm install

# Set the backend URL (optional — defaults to http://127.0.0.1:8000)
# echo "NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:8000" >> .env.local

npm run dev   # Starts on http://localhost:3000
```

### 3. First-Time Setup

1. **Log in as admin** → `/admin`
2. **Create a workspace** (e.g., "CS101 Introduction to AI")
3. **Upload assets:**
   - PDF lecture notes (category: `lecture_material`)
   - Past exam papers & mark schemes (category: `exam_paper` / `mark_scheme`)
   - Lecture videos (file upload or external URL)
4. **Add a Guidance Pack** — custom instructions for how the AI should answer
5. **Build the corpus** — triggers embedding + FAISS index creation
6. **Invite members** — add students and lecturers to the workspace

---

## 🧠 Core Concepts

| Concept | Meaning |
|---------|---------|
| **Workspace** | A course or module. Holds assets, members, and corpus versions. |
| **Asset** | Any uploaded item: PDF, video, transcript, notice, or text. |
| **Corpus Version** | A snapshot of all chunked, embedded, and indexed assets. Immutable once built. |
| **Guidance Pack** | Workspace-level instructions that steer LLM tone, depth, and formatting. |
| **Query Event** | A logged student question + answer + citations + playback + latency metrics. |
| **Insight Snapshot** | Cohort analytics: topic coverage, misconception clusters, readiness scores. |

---

## 🛡️ Auth & Roles

Ikion uses **PBKDF2-hashed passwords** with **HTTP-only cookie sessions**.

| Role | Capabilities |
|------|--------------|
| `student` | Ask questions, view citations/playback, take recommended exams, see personal readiness |
| `lecturer` | View query insights, misconception clusters, AQIR reports, edit guidance packs |
| `admin` | Full workspace/asset/user management, corpus builds, transcript backfill, member invites |

---

## 🔌 API Highlights

The backend exposes a comprehensive REST API (see `backend/ikion/backend/app.py` for all routes):

- `POST /ask` — Grounded Q&A with citations & playback
- `POST /retrieve` — Semantic + lexical search over corpus
- `POST /corpus/build` — Trigger new corpus version build
- `GET /exam-prep/profile` — Student readiness scores
- `POST /exam-prep/recommendation` — Next recommended question
- `POST /exam-prep/evaluate` — Evaluate a student answer
- `GET /insights` — Cohort analytics & LLM summaries
- `POST /playback/resolve` & `/playback/search` — Video timestamp resolution

All endpoints are workspace-scoped and protected by role-based guards.

---

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest ikion/backend/tests/

# Frontend typecheck
cd frontend
npm run typecheck
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Radix UI |
| **Backend** | Python, FastAPI, Uvicorn, Pydantic |
| **Database** | SQLite (WAL mode) |
| **Vector Search** | FAISS-CPU |
| **Embeddings** | OpenAI `text-embedding-3-small` (or local SHA1 fallback) |
| **LLM** | OpenAI GPT models (configurable) |
| **Transcription** | OpenAI Whisper-1 |
| **Parsing** | PyMuPDF (PDF), langchain-text-splitters, RecursiveCharacterTextSplitter |
| **Graphs** | LangGraph (conversation planning), networkx (knowledge graph) |
| **Clustering** | scikit-learn (agglomerative) with pure-numpy fallback |
| **Storage** | Local filesystem + optional Google Drive mirror |
| **Auth** | PBKDF2 + signed cookie sessions |

---

## 📝 License

This project is private and proprietary.

---

## 🤝 Contributing

Ikion is an active MVP. If you're working on it, refer to `backend/README.md` and `frontend/README.md` for module-specific conventions and legacy notes.

---

<p align="center">
  <strong>Ikion — Grounded AI for Higher Education</strong><br/>
  Built with Next.js, FastAPI, and OpenAI.
</p>
