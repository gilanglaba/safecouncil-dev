# SafeCouncil

**Multi-agent AI safety evaluation platform for humanitarian and high-stakes AI deployments.**

SafeCouncil convenes a council of AI experts (Claude, GPT-4o, Gemini) to independently evaluate AI agents against 10 safety dimensions derived from 6 international governance frameworks, cross-critique each other's findings, and deliver a APPROVE / REVIEW / REJECT verdict.

Two council methods: **Deliberative** (cross-critique, score revision, debate synthesis) and **Aggregate** (independent scoring, statistical averaging, majority vote).

Built for: NYU SPS × UNICC AI Governance Capstone — Spring 2026

Live demo: [safecouncil.us](https://safecouncil.us)

---

## Quick Start

**Prerequisites:** Python 3.11+ and Node.js 18+. Installation guides for Python and Node.js can be found at [python.org](https://www.python.org/downloads/) and [nodejs.org](https://nodejs.org/). API keys are optional — without them, SafeCouncil automatically runs in demo mode and you can still see the full synthesis pipeline end-to-end (see [Demo Mode](#demo-mode) below).

### macOS / Linux

The easiest way to get started is with `make`, which handles venv creation, dependency installation, and server startup in a few commands.

```bash
# 1. Install backend deps + create .env from template
make setup

# 2. (Optional) Edit backend/.env and add your API keys
#    ANTHROPIC_API_KEY=sk-ant-...
#    OPENAI_API_KEY=sk-proj-...
#    GOOGLE_API_KEY=AIza...

# 3. Install frontend deps
make install-frontend

# 4. Start backend + frontend together
make dev
```

`make dev` runs the backend in the background and the frontend in the foreground. Open http://localhost:3000.

<details>
<summary>Manual steps — use these if Make is not installed or the commands above fail</summary>

```bash
# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # Edit with your API keys
cd backend && python app.py
```

```bash
# Frontend (separate terminal)
cd frontend && npm install
npm run dev
```

</details>

### Windows

Windows does not ship with `make`. Use the manual steps below in **Command Prompt** or **PowerShell**.

```bat
:: Backend
python -m venv .venv
.venv\Scripts\activate
pip install -r backend\requirements.txt
copy backend\.env.example backend\.env
:: Edit backend\.env and add your API keys (optional — runs in demo mode without them)
cd backend && python app.py
```

```bat
:: Frontend (separate terminal)
cd frontend && npm install
npm run dev
```

Open http://localhost:3000 — the frontend proxies `/api/*` to the backend on port 5000.

> **Tip:** Alternatively, install [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) for a full Linux environment where the Makefile commands work as-is.

> **Note — Flask auto-reloader.** `FLASK_DEBUG=true` (the default) enables Werkzeug's auto-reloader, which restarts the backend process once on startup. This is normal and harmless for local development. If you're running in a script or CI environment, set `FLASK_DEBUG=false` in `backend/.env` to disable it.

---

## Demo Mode

Three ways to run SafeCouncil without a full set of API keys:

1. **Test Demo button.** On the Evaluate page, click **Test Demo**. Returns a static result regardless of your input. No pipeline, no API calls.
2. **`DEMO_MODE` in `backend/.env`.** Edit `backend/.env` and set `DEMO_MODE=auto` or `DEMO_MODE=true`.
   - `auto` — falls back to demo mode only when no API keys are configured. **Recommended.**
   - `true` — always runs in demo mode, even if keys are present.

   Unlike option 1, this runs the full `SimpleOrchestrator` pipeline end-to-end with dummy data (real critique, revision, and synthesis steps) via `OfflineProvider`. No network calls.
3. **Single API key.** Configure one key (e.g. `ANTHROPIC_API_KEY`) in `backend/.env`. Then on the Evaluate page, open **Expert Configuration** and change all three experts to that provider (e.g. all Claude). Runs the real pipeline with one provider.

Check current mode at `GET /api/health`.

---

## How It Works

Submit an agent through one of four input methods → 3 LLM experts evaluate it in parallel → cross-critique, score revision, and synthesis (deliberative method) or statistical aggregation (aggregate method) → APPROVE / REVIEW / REJECT verdict with prioritized mitigations and a plain-language executive summary.

**Input methods:**
- **Tool Catalog** — pre-loaded agents (WFP, UNICEF, UNHCR, WHO, VeriMedia)
- **GitHub URL** — paste any public repo, e.g. [github.com/FlashCarrot/VeriMedia](https://github.com/FlashCarrot/VeriMedia). SafeCouncil fetches README + code, extracts an agent profile, generates interface-appropriate probes, and simulates the agent
- **Connect API** — point at a live HTTPS endpoint
- **Upload Files** — JSON / CSV of conversation pairs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   React Frontend (:3000)                         │
│              Vite dev server proxies /api/* → :5000              │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               Flask API Server (backend/app.py)                 │
│                                                                 │
│  POST /api/evaluate       →  Submit evaluation (202 + eval_id) │
│  GET  /api/evaluate/{id}/status  →  Poll progress              │
│  GET  /api/evaluate/{id}  →  Full results                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Background thread
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│          OrchestratorFactory → Deliberative or Aggregate        │
│                                                                 │
│  Deliberative (8 phases):         Aggregate (3 phases):         │
│  1. Governance context            1. Governance context         │
│  2. 3× Expert evaluation          2. 3× Expert evaluation      │
│  3. Cross-critique (parallel)     3. Average + majority vote    │
│  4. Score revision (parallel)                                   │
│  5. Final position statements                                   │
│  6. Synthesis + debate transcript                               │
│  7. Output specificity enforcer                                 │
│  8. Executive summary + verdict                                 │
└──────────┬──────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│   Expert (strategy pattern) → LLMProvider (abstract interface)  │
│                                                                 │
│   ProviderRegistry resolves provider_key → concrete provider:   │
│     "claude"   → Anthropic API        (claude-sonnet)           │
│     "gpt4o"    → OpenAI API           (gpt-4o)                  │
│     "gemini"   → Google AI API        (gemini-2.5-pro)          │
│     "local"    → LM Studio / Ollama / vLLM (on-prem)            │
│     "offline"  → OfflineProvider      (DEMO_MODE, no API key)   │
└─────────────────────────────────────────────────────────────────┘
```

Every LLM-facing step goes through `Expert` → `LLMProvider`, so adding a new provider means writing one class and registering it — no orchestrator changes. The **offline** provider is what lets the full deliberative pipeline run in DEMO_MODE without any API keys (see [Demo Mode](#demo-mode) above).

---

## 10 Evaluation Dimensions

| # | Dimension | Category |
|---|-----------|----------|
| 1 | Harmful Content Prevention | Safety & Security |
| 2 | Prompt Injection & Robustness | Safety & Security |
| 3 | Bias & Non-Discrimination | Fairness & Ethics |
| 4 | Vulnerable Population Protection | Fairness & Ethics |
| 5 | Transparency & Truthfulness | Transparency & Accountability |
| 6 | Accountability & Auditability | Transparency & Accountability |
| 7 | Human Oversight & Privacy | Governance & Compliance |
| 8 | Regulatory Compliance | Governance & Compliance |
| 9 | Conflict Sensitivity & Humanitarian Principles | Humanitarian Context |
| 10 | Output Quality & Agency Prevention | Humanitarian Context |

Dimensions are stored in `backend/dimensions/default.yaml` and loaded at runtime. Add custom dimensions by editing the YAML or uploading a governance document.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/evaluate` | Submit new evaluation (sync 202 + `eval_id`) |
| `GET`  | `/api/evaluate/{id}/status` | Poll progress |
| `GET`  | `/api/evaluate/{id}` | Full results |
| `GET`  | `/api/evaluations` | List past evaluations |
| `GET`  | `/api/health` | Provider availability + `demo_mode` flag |
| `GET`  | `/api/frameworks` | List governance frameworks |
| `POST` | `/api/governance/upload` | Upload governance doc → extract dimensions YAML |
| `POST` | `/api/governance/confirm` | Save reviewed custom dimensions YAML |

Request and response shapes live in `backend/models/schemas.py` (`EvaluationInput`, `CouncilResult`).

---

## Project Structure

```
safecouncil/
├── backend/
│   ├── app.py                          # Flask API routes + request validation
│   ├── config.py                       # Environment config, DEMO_MODE auto-detect, placeholder rejection
│   ├── demo_data.py                    # Small: DEMO_INPUT + catalog profiles + thin loader for the fixtures below
│   ├── demo_fixtures/                  # Pre-built deliberative results as JSON (fallback only; real demo uses OfflineProvider)
│   │   ├── wfp_deliberative.json
│   │   └── verimedia_deliberative.json
│   ├── requirements.txt
│   ├── .env.example                    # Empty API keys by default → DEMO_MODE engages automatically
│   ├── models/schemas.py               # Dataclasses (EvaluationInput, ExpertAssessment, CouncilResult)
│   ├── experts/
│   │   ├── base_expert.py              # Abstract base + JSON extraction
│   │   ├── expert.py                   # Provider-agnostic expert (evaluate/critique/revise/synthesize)
│   │   └── llm_providers/
│   │       ├── base_provider.py        # LLMProvider interface
│   │       ├── anthropic_provider.py   # Claude
│   │       ├── openai_provider.py      # GPT-4o + local LLM (LM Studio / Ollama / vLLM)
│   │       ├── google_provider.py      # Gemini
│   │       ├── offline_provider.py     # Deterministic demo-mode provider — runs the real pipeline with no API keys
│   │       └── provider_registry.py    # Factory (claude | gpt4o | gemini | local | offline)
│   ├── orchestrators/
│   │   ├── base_orchestrator.py        # Strategy pattern base
│   │   ├── simple_orchestrator.py      # Deliberative pipeline (critique → revise → position → synthesize) + output-specificity enforcer
│   │   ├── aggregate_orchestrator.py   # Aggregate pipeline (average → majority vote)
│   │   └── orchestrator_factory.py     # Factory for creating orchestrators
│   ├── prompts/
│   │   ├── prompt_builder.py           # Generates rubric from YAML dimensions
│   │   ├── critique_prompt.py          # Cross-critique prompt
│   │   ├── revision_prompt.py          # Score revision prompt (Delphi step)
│   │   └── synthesis_prompt.py         # Debate + verdict prompt
│   ├── dimensions/
│   │   ├── default.yaml                # 10 evaluation dimensions
│   │   ├── loader.py                   # YAML dimension loader (default + custom/)
│   │   └── custom/                     # User-uploaded custom dimensions (via /api/governance/upload)
│   ├── governance/
│   │   ├── frameworks.py               # RAG-lite governance text (6 frameworks)
│   │   └── doc_to_yaml_service.py      # PDF/DOCX/TXT → dimension YAML extraction
│   ├── services/
│   │   ├── evaluation_service.py       # Async job manager + orchestrator selection + demo-mode runner
│   │   ├── probe_service.py            # Live API probing + agent simulation via Claude
│   │   └── github_ingestion_service.py # Parse GitHub URL → fetch README/code → profile extraction
│   └── logs/                           # Evaluation audit logs (backend/logs/*.json is gitignored)
├── frontend/
│   ├── src/
│   │   ├── pages/                      # LandingPage, EvaluatorPage, ResultsPage (8 tabs), DashboardPage, AboutPage
│   │   ├── components/                 # Nav, Footer, VerdictBadge, SeverityBadge, Badge, SectionHead, CompanyIcon, ScoreBar, PrintableReport
│   │   ├── utils/generatePDF.js        # Triggers browser print-to-PDF (PrintableReport + @media print)
│   │   ├── theme.js                    # Design tokens (NYU Violet + UN Blue)
│   │   ├── api.js                      # API client
│   │   └── demoResult.js               # Frontend-side demo data for /results/demo routes
│   ├── public/                         # Static assets
│   └── package.json
├── scripts/
│   └── demo_verimedia.sh               # One-command demo verification script (invoked by `make demo`)
├── tests/
│   ├── conftest.py                     # PYTHONPATH setup
│   ├── test_expert.py                  # Expert JSON extraction + governance context
│   ├── test_orchestrator.py            # Live-API orchestrator tests
│   ├── test_api.py                     # Integration tests (require live server)
│   ├── test_config.py                  # Placeholder detection + DEMO_MODE auto-detect
│   ├── test_offline_provider.py        # OfflineProvider JSON shapes + real-orchestrator-in-demo spy
│   ├── test_custom_dimensions.py       # Custom YAML flows through to demo-mode results
│   ├── test_github_demo_ingestion.py   # Monkeypatched GitHub helpers, fact isolation between runs
│   ├── test_output_specificity_enforcement.py  # Enforcer patches generic LLM output in place
│   ├── test_validation.py              # POST /api/evaluate input validation (Bug 2)
│   └── test_repo_cleanliness.py        # .gitignore + demo_data.py size + fixture round-trip
├── pytest.ini                          # Test markers (unit/integration/live_api)
├── Makefile                            # dev/setup/run/install-frontend/test/demo/clean
└── README.md
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | At least one | — | Anthropic Claude API key |
| `OPENAI_API_KEY` | At least one | — | OpenAI API key |
| `GOOGLE_API_KEY` | At least one | — | Google AI API key |
| `PORT` | No | `5000` | Server port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `FLASK_DEBUG` | No | `true` | Debug mode |
| `CLAUDE_MODEL` | No | `claude-sonnet-4-20250514` | Claude model ID |
| `OPENAI_MODEL` | No | `gpt-4o` | OpenAI model ID |
| `GEMINI_MODEL` | No | `gemini-2.5-pro` | Gemini model ID |
| `LOCAL_ENDPOINT` | If local expert enabled | — | Your local LLM endpoint (no default — set to your own LM Studio / Ollama / vLLM URL) |
| `LOCAL_MODEL` | If local expert enabled | — | Your local model name (no default) |
| `LOCAL_API_KEY` | No | — | Optional bearer token for your local server |
| `DEMO_MODE` | No | `auto` | `true` = force demo mode; `false` = force real mode; `auto` (default) = demo mode only when all three cloud API keys are missing or still set to `.env.example` placeholders |

---

## Commands

### macOS / Linux (Make)

| Command | Purpose |
|---|---|
| `make setup` | Create venv, install backend deps, copy `.env.example` |
| `make install-frontend` | Install frontend deps |
| `make dev` | Start backend on :5000 (waits for `/api/health`), then frontend on :3000 |
| `make demo` | Run a VeriMedia evaluation end-to-end in demo mode, print the result, exit. No API keys required. |
| `make test` | Unit tests (default) |
| `make test-api` | Integration tests (requires live server) |
| `make test-all` | All tests including live LLM calls (requires keys) |
| `make clean` | Remove venv and caches |

### Windows (manual)

| Step | Command |
|---|---|
| Create venv | `python -m venv .venv` |
| Activate venv | `.venv\Scripts\activate` |
| Install backend deps | `pip install -r backend\requirements.txt` |
| Create env file | `copy backend\.env.example backend\.env` |
| Install frontend deps | `cd frontend && npm install` |
| Run backend | `cd backend && python app.py` |
| Run frontend | `cd frontend && npm run dev` |
| Unit tests | `set PYTHONPATH=backend && .venv\Scripts\python -m pytest -v` |
| Integration tests | `set PYTHONPATH=backend && .venv\Scripts\python -m pytest -m integration -v` |

---

## Credits

- **NYU SPS × UNICC AI Governance Capstone** — Spring 2026
- Governance frameworks: EU AI Act, NIST AI RMF, UNESCO AI Ethics, OWASP Top 10 for LLMs, ISO 42001, UNICC AI Governance

---

## Project Contributors

| Contributor | Project Area | Owned modules |
|---|---|---|
| **Pengyun (Jimmy) Ma** | Platform & Infrastructure | `backend/config.py`, `backend/governance/`, `backend/dimensions/`, `backend/services/github_ingestion_service.py`, `backend/experts/llm_providers/` |
| **Gilang Laba** | AI Orchestration & Synthesis | `backend/orchestrators/`, `backend/experts/expert.py`, `backend/experts/base_expert.py`, `backend/prompts/` |
| **Iris Zhang** | UX & Integration | `frontend/`, `backend/services/evaluation_service.py`, `backend/app.py` |

Shared modules (`backend/models/schemas.py`, `tests/`, `Makefile`) are owned jointly.

---

## License

MIT License — see LICENSE for details.
