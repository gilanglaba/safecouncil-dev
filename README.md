# SafeCouncil

**Multi-agent AI safety evaluation platform for humanitarian and high-stakes AI deployments.**

SafeCouncil convenes a council of AI experts (Claude, GPT-4o, Gemini) to independently evaluate AI agents against 10 safety dimensions derived from 6 international governance frameworks, cross-critique each other's findings, and deliver a GO / CONDITIONAL / NO-GO verdict.

Two council methods: **Deliberative** (cross-critique, score revision, debate synthesis) and **Aggregate** (independent scoring, statistical averaging, majority vote).

Built for: NYU SPS × UNICC AI Governance Capstone — Spring 2026

Live demo: [safecouncil.vercel.app](https://safecouncil.vercel.app)

---

## Quick Start

**Prerequisites:** Python 3.11+, Node.js 18+. API keys are optional — without them, you can still run the **Test Demo** for a full evaluation walkthrough.

### One-command (Makefile)

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

### Manual

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # Edit with your API keys
cd backend && python app.py

# Frontend (separate terminal)
cd frontend && npm install
npm run dev
```

Open http://localhost:3000 — the frontend proxies `/api/*` to the backend on port 5000.

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
│  Deliberative:                    Aggregate:                    │
│  1. Governance context            1. Governance context         │
│  2. 3× Expert evaluation          2. 3× Expert evaluation      │
│  3. Cross-critique                3. Average scores             │
│  4. Score revision                4. Majority vote verdict      │
│  5. Synthesis + debate                                          │
│  6. Final verdict                                               │
└──────────┬────────────────┬───────────────────┬────────────────┘
           │                │                   │
           ▼                ▼                   ▼
    Anthropic API      OpenAI API         Google AI API
    (claude-sonnet)    (gpt-4o)           (gemini-2.5-pro)
```

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
| `POST` | `/api/evaluate` | Submit new evaluation |
| `POST` | `/api/evaluate/demo` | Submit demo evaluation (WFP chatbot) |
| `GET` | `/api/evaluate/{id}/status` | Poll evaluation progress |
| `GET` | `/api/evaluate/{id}` | Get full results |
| `GET` | `/api/evaluations` | List all past evaluations |
| `GET` | `/api/frameworks` | List governance frameworks |
| `GET` | `/api/health` | Health check + API key status |
| `POST` | `/api/governance/upload` | Upload governance document for dimension extraction |

### POST /api/evaluate

```json
{
  "agent_name": "WFP Customer Support Bot v2.1",
  "use_case": "Automated customer support for humanitarian aid...",
  "system_prompt": "You are a helpful customer support assistant...",
  "conversations": [
    {
      "label": "Normal inquiry",
      "prompt": "I haven't received my food package...",
      "output": "I'm sorry to hear that. Let me look into this..."
    }
  ],
  "environment": "Cloud-hosted, web chat",
  "data_sensitivity": "High",
  "frameworks": ["eu_ai_act", "nist", "owasp", "unesco"],
  "experts": [
    {"llm": "claude", "enabled": true},
    {"llm": "gpt4o", "enabled": true},
    {"llm": "gemini", "enabled": true}
  ],
  "orchestration_method": "deliberative"
}
```

`orchestration_method`: `"deliberative"` (default) or `"aggregate"`.

### Response Structure

```json
{
  "eval_id": "a1b2c3d4",
  "agent_name": "...",
  "orchestrator_method": "deliberative",
  "verdict": {
    "final_verdict": "CONDITIONAL",
    "confidence": 87,
    "agreement_rate": 84
  },
  "expert_assessments": [...],
  "debate_transcript": [...],
  "agreements": [...],
  "disagreements": [...],
  "mitigations": [...],
  "audit": {
    "total_api_calls": 7,
    "total_tokens_used": 40000,
    "evaluation_time_seconds": 180.0
  }
}
```

---

## How the Evaluation Works

1. **Submit**: User provides agent details + conversation examples (or connects an API, or selects from Tool Catalog)
2. **Queue**: Backend creates a job and returns `eval_id` immediately (202 Accepted)
3. **Governance context**: RAG-lite lookup of selected frameworks (EU AI Act, NIST, OWASP, UNESCO, ISO 42001, UNICC)
4. **Independent evaluation**: Each expert evaluates the agent across **10 safety dimensions** in 5 categories
5. **Cross-critique** *(deliberative only)*: Each expert reviews others' assessments, challenging score differences and surfacing missed risks
6. **Score revision** *(deliberative only)*: Experts revise scores based on critiques, producing traceable `score_changes` with justifications
7. **Synthesis** *(deliberative only)*: One expert generates a debate transcript narrating the actual deliberation
8. **Verdict**: GO / CONDITIONAL / NO-GO with prioritized mitigations
9. **Audit log**: Complete JSON record saved to `backend/logs/{eval_id}.json`

---

## Project Structure

```
safecouncil/
├── backend/
│   ├── app.py                          # Flask API routes
│   ├── config.py                       # Environment configuration
│   ├── requirements.txt
│   ├── .env.example
│   ├── models/schemas.py               # Dataclasses (EvaluationInput, ExpertAssessment, CouncilResult)
│   ├── experts/
│   │   ├── base_expert.py              # Abstract base + JSON extraction
│   │   ├── expert.py                   # Provider-agnostic expert (evaluate/critique/revise/synthesize)
│   │   └── llm_providers/
│   │       ├── base_provider.py        # LLMProvider interface
│   │       ├── anthropic_provider.py   # Claude
│   │       ├── openai_provider.py      # GPT-4o + local LLM (LM Studio)
│   │       ├── google_provider.py      # Gemini
│   │       └── provider_registry.py    # Factory for creating providers
│   ├── orchestrators/
│   │   ├── base_orchestrator.py        # Strategy pattern base
│   │   ├── simple_orchestrator.py      # Deliberative pipeline (critique → revise → synthesize)
│   │   ├── aggregate_orchestrator.py   # Aggregate pipeline (average → majority vote)
│   │   └── orchestrator_factory.py     # Factory for creating orchestrators
│   ├── prompts/
│   │   ├── prompt_builder.py           # Generates rubric from YAML dimensions
│   │   ├── critique_prompt.py          # Cross-critique prompt
│   │   ├── revision_prompt.py          # Score revision prompt (Delphi step)
│   │   └── synthesis_prompt.py         # Debate + verdict prompt
│   ├── dimensions/
│   │   ├── default.yaml                # 10 evaluation dimensions
│   │   ├── loader.py                   # YAML dimension loader
│   │   └── custom/                     # User-uploaded custom dimensions
│   ├── governance/
│   │   ├── frameworks.py               # RAG-lite governance text (6 frameworks)
│   │   └── doc_to_yaml_service.py      # Document → dimension extraction pipeline
│   ├── services/
│   │   └── evaluation_service.py       # Async job manager
│   └── logs/                           # Evaluation audit logs (gitignored)
├── frontend/
│   ├── src/
│   │   ├── pages/                      # LandingPage, EvaluatorPage, ResultsPage, DashboardPage, AboutPage
│   │   ├── components/                 # Nav, Footer, VerdictBadge, SeverityBadge, Badge
│   │   ├── theme.js                    # Design tokens (NYU Violet + UN Blue)
│   │   ├── api.js                      # API client
│   │   └── demoResult.js               # Demo evaluation data
│   ├── public/                         # Static assets (favicon, photos)
│   └── package.json
├── tests/
│   ├── conftest.py                     # PYTHONPATH setup + test categorization docs
│   ├── test_expert.py                  # Unit tests + live API expert tests
│   ├── test_orchestrator.py            # Live API orchestrator tests
│   └── test_api.py                     # Integration tests (require live server)
├── pytest.ini                          # Test markers (unit/integration/live_api)
├── Makefile
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
| `LOCAL_ENDPOINT` | No | `http://127.0.0.1:1234/v1` | Local LLM endpoint (LM Studio) |
| `LOCAL_MODEL` | No | `local-model` | Local model name |

---

## Local LLM Support

SafeCouncil supports on-premise LLM evaluation via LM Studio or any OpenAI-compatible local endpoint. To use:

1. Start LM Studio and load a model
2. Add to `backend/.env`:
   ```
   LOCAL_ENDPOINT=http://127.0.0.1:1234/v1
   LOCAL_MODEL=your-model-name
   LOCAL_API_KEY=lm-studio
   ```
3. In the evaluation request, set an expert to `{"llm": "local", "enabled": true}`

The system automatically adapts: compact prompts, reduced token limits, extended timeouts.

---

## Running Tests

Tests are organized by category using pytest markers:

- **Unit tests** — no API calls, no live server required
- **Integration tests** — require Flask server running on `localhost:5000`
- **Live API tests** — make real LLM API calls (require API keys, costs money)

```bash
make test          # Unit tests only (default — runs out of the box)
make test-api      # Integration tests (start backend first with `make run`)
make test-all      # All tests including live API calls
```

---

## Makefile Targets

| Target | Description |
|--------|-------------|
| `make dev` | **Default** — start backend (:5000) + frontend (:3000) |
| `make setup` | Create venv, install deps, copy .env.example |
| `make run` | Start backend server only |
| `make install-frontend` | Install frontend dependencies |
| `make run-frontend` | Start frontend dev server only |
| `make test` | Run unit tests (no server, no API keys needed) |
| `make test-api` | Run integration tests (requires live server) |
| `make test-all` | Run all tests (requires server + API keys) |
| `make clean` | Remove venv and cache files |

---

## Credits

- **NYU SPS × UNICC AI Governance Capstone** — Spring 2026
- Governance frameworks: EU AI Act, NIST AI RMF, UNESCO AI Ethics, OWASP Top 10 for LLMs, ISO 42001, UNICC AI Governance

## License

MIT License — see LICENSE for details.
