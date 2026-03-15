```markdown
# NovaCS: AI-Enhanced Lecture Notes & Exam Preparation Tool

**Author**: Ojei Imiavan  
**Supervisor**: Dr. Ian Saunders  
**Date**: 29 April 2025  

---

## Introduction

NovaCS is a Retrieval-Augmented Generation (RAG)-based web platform designed to support Computer Science students with consolidating lecture content and studying exam questions, generating thorough lecture note responses. It processes lecture content (slides, transcripts, and past exam questions) and enables domain-specific grounded LLM-based querying using OpenAI’s GPT-4o mini. Key features include:

- Query-Based RAG (QB-RAG)
- Query Decomposition
- Dynamic Weighted Retrieval (DWR)
- Chunk Ranking
- Transcript Video Querying [EXTENSION]
- Automated Query Insight Reporting (AQIR) [EXTENSION]

NovaCS was evaluated using both quantitative and qualitative metrics, achieving a BERTScore F1 of 0.8914, 77.9% domain-expert correctness, and a 100% user satisfaction score.

## Things to note

- migrate.py is the code that corresponds to v4.0, there is no separate code for v3.0, as migrate.py was originally v3.0
- The closest representations to v2.0's code is in qb.py, but this is a version that includes further development on top of v2.0, such as DWR
- In the Final Report, v1.0, 2.0, and 3.0's pipelines are all evaluated in **test.py**. This is because their indicidual components are evaluated at different stages of combinations- perfectly mimicking how all three versions actually performed during developmenmt and testing.



## Repository Structure

```
.
├── migrate.py              # Main Streamlit RAG app (CS352)- v3.0
├── qb.py                   # QB-RAG helpers with Chroma
├── extra.py                # Whisper video transcripts + AQIR UI
├── aqir_report.py          # Automated Query Insights emailer
├── v5.py                   # migrate.py instrumented for testing
├── other.py                # upgrade of v1.0, but not v2.0 fully- has static weighting and ranking with semantic chunking, but uses Naive RAG
│
├── test.py                 # Integration/eval metrics     (pytrec_eval, BERTScore, deepeval)
├── test_novaCS.py          # Unit & async integration tests
├── app_test.py             # Streamlit stress-test (latency/stability)
├── conftest.py             # pytest fixtures: mock OpenAI & FAISS
│
├── public_video/           # (external) lecture video + FAISS indices:
├── content_index/          # Lecture content is stored here (embedding)
├── question_index/         # QB-RAG pre-computed queries are stored here
│── faiss_exam_index/       # Embedded exam content is stored here
├── faiss_video_index  # For transcript processing and seeking
│
├── requirements.txt        # Core dependencies
└── README.md               # ← This file
```

---

## Installation- (NOTE: run git clone if you want to copy deirectly from my Git repository)

```bash
git clone https://your-repo.git
cd novaCS
python3 -m venv .venv
# Linux/Mac:
source .venv/bin/activate
# Windows PowerShell:
# .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
pip install openai-whisper streamlit-player pytrec_eval evaluate deepeval numpy scipy
```

---

## Environment Setup

Create a `.env` file in the project root:

```ini
# Core APIs
OPENAI_API_KEY=your-openai-key
HUGGINGFACE_API_KEY=your-huggingface-key
LANGCHAIN_API_KEY=your-langchain-key
LANGCHAIN_TRACING_V2=true

# AQIR Email Reporting
SMTP_SERVER=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
RECIPIENT_EMAIL=recipient@example.com
QUERY_LOG_PATH=path/to/queries_log.json
```

---

## Running the Applications

### 1. Start Local Server for Video Files

```bash
cd public_video/
# Windows PowerShell
$env:KMP_DUPLICATE_LIB_OK="TRUE"
python -m http.server 8000
```

### 2. Run the Main Streamlit App

```bash
# Navigate back to project root
cd ..
# Windows PowerShell
streamlit run migrate.py
```

### 3. Run the Extended App (Video Search and AQIR)

```bash
# From project root
$env:KMP_DUPLICATE_LIB_OK="TRUE"
streamlit run extra.py
```

---

## File Overview & Key Functionalities

| File | Purpose |
| :--- | :--- |
| `migrate.py` | Main Streamlit app (v3.0): loads slides/transcripts, semantic chunking, FAISS storage, QB-RAG chain for querying. |
| `main.py` | Early RAG prototype using basic retrieval and Chroma vectorstores. |
| `qb.py` | Chroma-based QB-RAG system, offline multi-question generation, weighted retrieval setup. This is NOT v2.0- it is v2.0 with Dynamic Weighted Retrieval being built on-top.|
| `extra.py` | Video transcript loader using Whisper, builds FAISS video index, supports video search, AQIR logging. |
| `aqir_report.py` | Loads queries, summarizes insights using OpenAI, and sends them via SMTP email. |
| `v5.py` | migrate.py instrumented for testability (mocked APIs, dummy chains). |
| `test_novaCS.py` | Unit tests for DocumentLoader, DocumentSplitter, QueryGenerator, ExamPaperLoader, etc. |
| `test.py` | Integration and evaluation tests for retrieval metrics (Precision, Recall, CR@20, nDCG, MRR, AP) and hallucination metrics (Faithfulness, Hallucination). |
| `app_test.py` | Stress-test for the Streamlit app using streamlit.testing (benchmark latency, detect instability). |
| `conftest.py` | pytest fixtures: mocking OpenAI Chat API and FAISS vectorstores for isolated unit/integration tests. |

---



## Environment Variables Reference

| Variable | Purpose |
| :--- | :--- |
| `OPENAI_API_KEY` | Access GPT-4 models and embeddings. |
| `PINECONE_API_KEY` | (Optional) Vector DB for scaling beyond FAISS. |
| `HUGGINGFACE_API_KEY` | Access models such as Whisper. |
| `LANGCHAIN_API_KEY` | Enable tracing with LangChain platform. |
| `LANGCHAIN_TRACING_V2` | Trace document chunking, retrieval, and LLM generation. |
| `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `RECIPIENT_EMAIL` | Enable AQIR email sending from aqir_report.py. |
| `QUERY_LOG_PATH` | Path to user queries for AQIR summary generation. |

---

## Core Python Dependencies

```text
langchain==0.3.14
langchain_community==0.3.2
langchain_core==0.3.30
langchain_openai==0.3.1
langchain_experimental==0.3.3
pinecone-client==5.0.1
chromadb==0.5.15
chroma-hnswlib==0.7.6
faiss-cpu==1.10.0
streamlit==1.42.0
python-dotenv==1.0.1
pydantic==2.9.2
scikit-learn==1.5.1
pysqlite3-binary==0.5.4
nest-asyncio==1.6.0
async-lru==2.0.4
PyMuPDF==1.24.13
openai-whisper
streamlit-player
pytrec_eval
evaluate
deepeval
numpy
scipy
```

---

## License

This project is licensed under the MIT License.

## Acknowledgements

- Special thanks to Dr. Ian Saunders for all of his support, as well as the University of Warwick for their support and resources for this project.



---
