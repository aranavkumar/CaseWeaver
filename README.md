# CaseWeaver

**From scattered digital evidence to a traceable investigation report.**

CaseWeaver is an agentic digital-investigation workspace. It takes messy,
human-supplied evidence — screenshots, emails, receipts, PDFs, URLs, notes —
and runs a transparent, multi-stage analysis that produces a **structured,
source-provenanced, human-reviewable report**.

> **This is a demonstration prototype, not a certified forensic tool.**
> Every generated report carries the disclaimer *"Demonstration Report — Not a
> Certified Forensic Report."* It is built to show an honest investigation
> *methodology*, not to produce legally admissible findings.

---

## What makes it different from a chatbot

CaseWeaver is an **investigation product**, not a conversation. Its core
commitments:

1. **Provenance over prose.** Every claim in the report traces back to a
   structured record: `Finding → Observation → EvidenceItem`. Nothing appears
   in a report without a source it can point to.
2. **Evidence integrity.** Uploaded files are hashed with SHA-256 over the
   actual bytes, and originals are stored separately from any derived data.
   (A hash detects later tampering with *your copy* — it does **not** prove the
   original document was ever authentic or truthful.)
3. **Honest simulation.** Where an operation is simulated (OCR, web research),
   the UI and the exported data label it explicitly as *simulated* / *fixture* /
   *sample dataset*. A failed live request is **never** silently replaced with
   fabricated results.
4. **Contradictions are surfaced, not smoothed away.** Conflicting timestamps
   and ambiguous entity matches are flagged for human review rather than
   auto-resolved into a single tidy story.
5. **The agent stops for a human.** The state machine pauses at a
   `human_review` gate; the report cannot be marked *approved* without a person
   acting on the review queue.

---

## Tech stack

| Layer      | Choice |
|------------|--------|
| Backend    | Python 3.15, FastAPI, Pydantic v2 (typed schemas), pydantic-settings |
| Persistence| SQLite via a thin JSON-blob repository layer (FK integrity enforced at write time) |
| Analysis   | Deterministic regex extraction, exact-match entity resolution, contradiction-preserving timeline |
| Agent      | Threading-based 8-stage state-machine orchestrator with real measured timings |
| Export     | ReportLab (PDF), native JSON, Markdown; DOCX when `python-docx` is installed |
| Frontend   | Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4 |
| Graph      | Cytoscape.js (dynamically imported) |

The whole demo runs **without any external API key** — see
[Integrations](#integrations-live-vs-simulated).

---

## Architecture

```
caseweaver/
├── run.sh                     # one-shot dev launcher (backend + frontend)
├── .gitignore
├── backend/
│   ├── requirements.txt
│   ├── .env.example           # copy to .env; demo needs no keys
│   ├── storage/               # original uploaded bytes (git-ignored)
│   ├── app/
│   │   ├── main.py            # FastAPI app + all REST endpoints
│   │   ├── config.py          # Settings (env-prefixed CASEWEAVER_)
│   │   ├── schemas.py         # 14 Pydantic entities + enums + STAGE_ORDER
│   │   ├── db.py              # Repository (put/get/list/delete/cascade)
│   │   ├── util.py            # id + offset helpers
│   │   ├── data/silverline.py # built-in "Operation Silverline" dataset
│   │   ├── agents/
│   │   │   └── orchestrator.py# 8-stage state machine (threaded, pausable)
│   │   └── services/
│   │       ├── evidence.py    # validate + SHA-256 + text extraction
│   │       ├── extraction.py  # deterministic Observations w/ source passages
│   │       ├── entity_resolution.py
│   │       ├── timeline.py    # preserves raw ts, flags conflicts
│   │       ├── research.py    # mock adapter, all results is_simulated=True
│   │       ├── verification.py# findings + provenance re-check
│   │       ├── report.py      # 14-section markdown from records
│   │       ├── export.py      # workspace / json / pdf / md / docx
│   │       └── audit.py       # append-only audit events
│   └── tests/
│       ├── conftest.py        # isolated temp DB per session
│       └── test_workflow.py   # 15 end-to-end QA checks
└── frontend/
    ├── package.json
    └── src/
        ├── app/               # layout, globals.css (dark theme), page.tsx
        ├── lib/               # types.ts, api.ts, store.tsx (context + persistence)
        └── components/        # Sidebar, Overview, Investigations, EvidenceVault,
                               # RunConsole, Graph, Timeline, Research, Reports,
                               # Audit, Settings, ui.tsx primitives
```

### Data model (14 entities)

`Case`, `EvidenceItem`, `Observation`, `Entity`, `Relationship`,
`TimelineEvent`, `ResearchQuery`, `ResearchResult`, `Finding`, `ReviewAction`,
`AgentRun`, `AgentStage`, `AuditEvent`, `ReportVersion`.

The provenance chain is the point: an **Observation** always records the
`evidence_id`, the exact `source_passage`, and character offsets; a **Finding**
lists the observations that support (or contradict) it; a **Relationship** is
either backed by co-mention observations or explicitly labelled *inferred*.

### Repository / persistence

`db.py` exposes a single `Repository` with `put/get/list/delete`, a
`cascade_delete_case`, and `clear_all`. Records are stored as JSON blobs keyed
by id, with case-scope foreign-key checks enforced on write so evidence can
never be orphaned. Swapping SQLite for another store only touches this module.

---

## The agent methodology (8 stages)

The orchestrator (`app/agents/orchestrator.py`) is a **real state machine**, not
an animated log. Each stage runs actual service code, writes structured records,
and reports measured duration + record counts. It supports `pause`, `resume`,
`cancel`, and per-stage `retry`, and refuses to start a second concurrent run
for the same case (HTTP 409).

| # | Stage | What it really does |
|---|-------|---------------------|
| 1 | `planning` | Initialise the run, enumerate evidence, set up the question list |
| 2 | `extraction` | Run deterministic extractors → `Observation`s with source passages |
| 3 | `research` | Ask external questions; in demo mode the **mock adapter** answers and marks every result `is_simulated=True` |
| 4 | `entity_resolution` | Normalise values into `Entity`s, build `Relationship`s; ambiguous same-name matches become `needs_review`, never auto-merged |
| 5 | `timeline` | Reconstruct `TimelineEvent`s, preserving raw timestamps/timezones and flagging same-day conflicts |
| 6 | `verification` | Build `Finding`s and re-check each claim's provenance; unsupported claims are dropped, not laundered |
| 7 | `human_review` | **Pause** — the run waits for a reviewer to accept/correct/reject findings |
| 8 | `report` | Assemble the report from reviewed structured records only |

**Guardrails baked into the code:** uploaded content is treated as untrusted
*data*, never as instructions; the agent has no tool allowlist beyond these
deterministic services; it never declares a person guilty, never promotes an
unverified allegation to fact, and never presents a speculative relationship as
established evidence.

---

## Operation Silverline (built-in demo case)

`app/data/silverline.py` ships a self-consistent synthetic investigation with
**5 interconnected evidence items** (messaging screenshot, email, PDF payment
receipt, website JSON, incident notes) about a fictional marketplace scam. It
contains:

- **≥2 real inconsistencies** — notably conflicting timestamps across evidence
  that the timeline surfaces rather than resolves;
- **1 deliberately-wrong extraction** — a seeded OCR observation reads the
  payment as **$5,400.00** when the receipt says **$450.00**. It is tagged
  `provenance='inferred'`, `review_status='needs_review'`, with an ambiguity
  note. A reviewer can **correct** it in the Evidence Vault; the corrected value
  then propagates through entity resolution and drops the phantom amount from
  the report. (This round-trip is covered by an automated test.)
- Reserved `example.com` domains are labelled as IANA placeholders, never
  attributed to a real organisation.

Loading the sample is idempotent, so pressing it repeatedly is safe.

---

## Setup & run

### Prerequisites
- Python **3.12+** (developed on 3.15)
- Node.js **20+** (developed on 24)

### One command (recommended)

```bash
cd caseweaver
./run.sh
```

`run.sh` creates the backend venv, installs dependencies, copies `.env.example`
to `.env`, installs frontend deps, and launches both servers. Ctrl-C stops them.

### Manual — backend

```bash
cd caseweaver/backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # demo defaults need no keys
uvicorn app.main:app --reload --port 8000
```

### Manual — frontend

```bash
cd caseweaver/frontend
npm install
npm run dev                   # http://localhost:3000
```

Open **http://localhost:3000**, then click **Open Demo Investigation** on the
Overview to load Operation Silverline and explore all nine sections.

---

## Configuration (environment)

All backend settings use the `CASEWEAVER_` prefix (see `backend/.env.example`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `CASEWEAVER_DB_PATH` | `./caseweaver.db` | SQLite file location |
| `CASEWEAVER_STORAGE_DIR` | `./storage` | Where original evidence bytes live |
| `CASEWEAVER_MAX_UPLOAD_BYTES` | `8388608` | Upload size cap (8 MB) |
| `CASEWEAVER_ALLOWED_EXTENSIONS` | `png,jpg,jpeg,pdf,txt,csv,json,eml` | Accepted file types |
| `CASEWEAVER_MODE` | `demo` | `demo` \| `local` \| `live` |
| `OPENAI_API_KEY` | *(empty)* | Optional live model interpretation |
| `SEARCHAPI_API_KEY` | *(empty)* | Optional live web research |

**API credentials stay on the server** — they are read only by the backend and
are never sent to or stored in the browser.

---

## Integrations (live vs simulated)

The prototype is fully functional with **zero external keys**.

- **Web research** — with no `SEARCHAPI_API_KEY`, the Research Center uses a
  local **mock adapter** and labels every result `Simulated research result` /
  `fixture`. There is no silent substitution of fabricated data for a failed
  live call.
- **Model interpretation** — with no `OPENAI_API_KEY`, extraction and report
  drafting use the deterministic local path, and nothing is claimed as
  AI-verified.
- The Settings screen shows each integration's real connection state.

Research respects clear ethical limits: it does **not** browse private
accounts, bypass authentication, contact suspected individuals, or perform
intrusive scans.

---

## Testing

```bash
cd caseweaver/backend
.venv/bin/python -m pytest -q
```

**15 end-to-end tests** (`tests/test_workflow.py`) cover the QA checklist,
including: evidence hashing & provenance, extraction offsets, single-entity
transaction-ref resolution, ambiguous relationships flagged for review, timeline
ordering + conflict detection, the OCR-correction-then-propagation round-trip,
honest simulation labelling, audit events, and report generation + JSON export.
Tests run against an isolated temporary database.

*(Last run in this workspace: 15 passed.)*

---

## API surface (summary)

- `GET /api/health`, `GET /api/settings`, `GET /api/overview`
- Cases: `POST/GET /api/cases`, `GET /api/cases/{id}`, `.../workspace`, `DELETE`
- Sample: `POST /api/sample`
- Evidence: `GET/POST /api/cases/{id}/evidence`, `GET/DELETE /api/evidence/{id}`
- Runs: `POST /api/cases/{id}/run`, `GET /api/runs/{id}`,
  `.../pause|resume|cancel`, `.../retry/{stage}`
- Analysis: `GET /api/cases/{id}/graph|timeline|research|findings`
- Review & reports: `POST /api/cases/{id}/review`, `POST .../report`,
  `GET /api/reports/{id}`, `POST /api/reports/{id}/approve`,
  `GET /api/reports/{id}/export?format=json|pdf|markdown|docx`
- `GET /api/audit`

---

## Deployment notes

CaseWeaver is a standard FastAPI + Next.js split, so it deploys like any two-app
monorepo:

- **Backend:** run `uvicorn app.main:app` behind any WSGI/ASGI host (Gunicorn +
  Uvicorn workers, Docker, Fly.io, Render…). Point `CASEWEAVER_DB_PATH` and
  `CASEWEAVER_STORAGE_DIR` at persistent volumes; for multi-instance or
  production use, replace the JSON-blob repository with a real database and
  object storage.
- **Frontend:** `npm run build && npm start`, or deploy to a Node/edge host. Set
  the backend origin appropriately (CORS currently allows `localhost:3000/3001`).

---

## Limitations (read this)

- **Not forensic-grade.** No chain-of-custody guarantees, no court-accepted
  hashing workflow, no write-once audit log. The audit trail is informative, not
  tamper-proof.
- **Client-side single-user prototype.** No authentication, multi-tenancy,
  encryption-at-rest, or role-based access.
- **Deterministic extraction, not ML.** Regex/heuristic extraction is
  intentionally transparent and reproducible; it will miss patterns a trained
  model would catch. Image OCR is *not* performed — images get an honest
  "OCR unavailable" note.
- **Live integrations are stubbed by default.** Real LLM/search paths are wired
  behind config flags but ship unconfigured so the demo stays honest and offline.

Use it to learn and demonstrate an evidence-first investigation methodology —
not to reach conclusions about real people.
