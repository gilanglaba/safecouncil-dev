# SafeCouncil

**Multi-agent AI safety evaluation platform for humanitarian and high-stakes AI deployments.**

SafeCouncil convenes a council of AI experts (Claude, GPT-4o, Gemini) to independently evaluate AI agents against 10 safety dimensions derived from 6 international governance frameworks, cross-critique each other's findings, and deliver a APPROVE / REVIEW / REJECT verdict.

Two council methods: **Deliberative** (cross-critique, score revision, debate synthesis) and **Aggregate** (independent scoring, statistical averaging, majority vote).

Built for: NYU SPS × UNICC AI Governance Capstone — Spring 2026

Live demo: [safecouncil.vercel.app](https://safecouncil.vercel.app)

---

## Quick Start

**Prerequisites:** Python 3.11+, Node.js 18+. API keys are optional — without them, SafeCouncil automatically runs in demo mode and you can still see the full synthesis pipeline end-to-end (see [Demo Mode](#demo-mode-run-without-api-keys) below).

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

## How the Evaluation Works

1. **Submit**: User provides agent details + conversation examples, pastes a GitHub URL, connects an API, or selects from the Tool Catalog
2. **Queue**: Backend creates a job and returns `eval_id` immediately (202 Accepted)
3. **Governance context**: RAG-lite lookup of selected frameworks (EU AI Act, NIST, OWASP, UNESCO, ISO 42001, UNICC)
4. **Independent evaluation** *(parallel)*: Each expert evaluates the agent across **10 safety dimensions** in 5 categories
5. **Cross-critique** *(deliberative only, parallel)*: Each expert reviews others' assessments, challenging score differences and surfacing missed risks
6. **Score revision** *(deliberative only, parallel)*: Experts revise scores based on critiques, producing traceable `score_changes` with justifications
7. **Final position statements** *(deliberative only, parallel)*: Each expert issues a final 2–4 sentence position after the critique round
8. **Synthesis** *(deliberative only)*: One expert generates a debate transcript narrating the actual deliberation, plus agreements, disagreements, mitigations, and an **executive summary** for non-technical readers
9. **Output specificity enforcement**: Deterministic post-processor scans every finding, dimension detail, and debate message. Any piece that doesn't reference the agent by name is patched in place using architecture notes / filenames pulled from `eval_input.environment`. Guarantees the final report is grounded in the actual agent regardless of LLM behavior. Enforcement stats surface in `audit.specificity`.
10. **Verdict**: APPROVE / REVIEW / REJECT with prioritized mitigations
11. **Audit log**: Complete JSON record saved to `backend/logs/{eval_id}.json` (gitignored)

---

## Input Methods

SafeCouncil accepts AI agents through four input modes — pick whichever matches what you have:

| Mode | What you provide | Best for |
|---|---|---|
| **1. Tool Catalog** | Click a pre-loaded agent (WFP Support Bot, VeriMedia, UNICEF/UNHCR/WHO simulations) | Demo users who want to see the full pipeline immediately |
| **2. GitHub Repo URL** | Paste any public GitHub URL — SafeCouncil fetches the README + code, extracts an agent profile via Claude, and generates interface-appropriate test probes | Open-source AI agents, dynamic evaluation |
| **3. Connect API** | A live HTTPS endpoint + auth header — SafeCouncil sends real probes to your running agent | Agents already deployed in staging/production |
| **4. Upload Files** | A JSON or CSV of conversation pairs (`prompt` / `output`) | Offline transcript analysis, batch evaluations |

**Try VeriMedia**: from the Tool Catalog, click **VeriMedia** — it routes to [github.com/FlashCarrot/VeriMedia](https://github.com/FlashCarrot/VeriMedia) and runs a full deliberative evaluation against the live repo. VeriMedia is a Flask-based AI media ethics analyzer with a GPT-4o backend; SafeCouncil's report specifically calls out its file upload surface and missing authentication layer as deployment-blocking findings.

**Try GitHub URL ingestion**: under **GitHub Repo**, paste any public AI-agent repo URL — for example, try VeriMedia at [https://github.com/FlashCarrot/VeriMedia](https://github.com/FlashCarrot/VeriMedia). SafeCouncil ingests the README + code, infers the agent's interface (chat / API / file processor), generates appropriate test probes, and runs them against a Claude-simulated version of the agent — no live deployment required.

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

Every LLM-facing step goes through `Expert` → `LLMProvider`, so adding a new provider means writing one class and registering it — no orchestrator changes. The **offline** provider is what lets the full deliberative pipeline run in DEMO_MODE without any API keys (see [Demo Mode](#demo-mode-run-without-api-keys) below).

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
| `GET` | `/api/evaluate/{id}/pdf` | Download PDF report |
| `GET` | `/api/evaluations` | List all past evaluations |
| `GET` | `/api/frameworks` | List governance frameworks |
| `GET` | `/api/health` | Health check + provider availability (`claude`, `gpt4o`, `gemini`, `local`) + `demo_mode` flag |
| `POST` | `/api/governance/upload` | Upload governance document, extract dimensions YAML |
| `POST` | `/api/governance/confirm` | Save reviewed custom dimensions YAML to `backend/dimensions/custom/` |

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
  "orchestration_method": "deliberative",
  "synthesis_provider": "claude"
}
```

- `orchestration_method`: `"deliberative"` (default) or `"aggregate"`.
- `synthesis_provider` *(optional)*: `"claude"` / `"gpt4o"` / `"gemini"` / `"local"`. Lets you run cross-critique on cloud LLMs while keeping the final synthesis report on your own hardware (or vice versa). Defaults to the first council expert.
- **GitHub URL shortcut**: any of these three shapes works, no `conversations` required:
  - `{"input_method": "github", "github_url": "https://github.com/..."}` *(shortest)*
  - `{"input_method": "github", "api_config": {"github_url": "..."}}`
  - `{"input_method": "api_probe", "api_config": {"github_url": "..."}}` *(canonical)*
- `experts[].llm` also accepts `"offline"` for the deterministic demo provider. The server automatically uses `offline` when `DEMO_MODE` is active.

### Response Structure

```json
{
  "eval_id": "a1b2c3d4",
  "agent_name": "...",
  "orchestrator_method": "deliberative",
  "timestamp": "2026-04-08T14:00:00Z",
  "executive_summary": "SafeCouncil reviewed VeriMedia and concluded it needs changes before it can be deployed safely. The most urgent issues are audit trail gaps observed in app.py and access control in finetune.py. Recommended next step: implement server-side audit logging...",
  "verdict": {
    "final_verdict": "REVIEW",
    "confidence": 87,
    "agreement_rate": 84
  },
  "expert_assessments": [...],
  "debate_transcript": [...],
  "agreements": [...],
  "disagreements": [...],
  "mitigations": [...],
  "audit": {
    "total_api_calls": 13,
    "total_tokens_used": 40000,
    "total_cost_usd": 0.18,
    "evaluation_time_seconds": 180.0,
    "demo_mode": false,
    "synthesis_fallback": false,
    "synthesizer_name": "Expert 1 (claude-sonnet-4-20250514)",
    "specificity": {
      "agent_name_referenced": true,
      "conversation_evidence_cited": true,
      "debate_transcript_present": true,
      "enforcement": {
        "findings_text_patched": 0,
        "findings_evidence_patched": 0,
        "debate_messages_patched": 0,
        "dimension_details_patched": 0
      }
    }
  }
}
```

- **`executive_summary`** — plain-English 3–5 sentence summary for non-technical readers, rendered as a persistent card above every tab on the Results page.
- **`audit.demo_mode`** — `true` when the evaluation ran offline via `OfflineProvider`.
- **`audit.synthesis_fallback`** — `true` if the synthesizer's JSON couldn't be parsed and a deterministic fallback summary was used.
- **`audit.synthesizer_name`** — which expert generated the synthesis (useful when the synthesis provider differs from the council experts).
- **`audit.specificity.enforcement`** — count of findings/debate messages that the output-specificity enforcer patched in place to guarantee agent-specific references, regardless of what the LLM returned.

---

## Results Page

Every result lives at `/results/{eval_id}` with a layout designed for two very different readers in one page: UN/IGO policy officers (plain-language, no jargon) and AI/ML reviewers (per-expert scores, debate transcript, evidence log).

**Persistent header** (visible on every tab):
- **Verdict banner** — APPROVE / REVIEW / REJECT with confidence + agreement rate, method tag, and a short narrative explanation
- **Executive Summary card** — plain-English 3–5 sentence summary of the council's findings. Sits directly below the verdict banner and renders on every tab, so the stakeholder view is always one glance away.

**8 tabs** (default active tab = **Overview**, the plain-language landing):

| Tab | Content | Primary audience |
|---|---|---|
| **Overview** | Top 3 risks in plain language + top 3 recommended next steps (numbered cards) | Non-technical stakeholders |
| **Expert Panel** | Per-expert cards with initial → final scores, revision rationales, Council Consensus + Points of Contention | Reviewers tracking per-expert reasoning |
| **Score Comparison** | 10 dimensions × N experts score matrix with hover tooltips | Analysts comparing expert disagreement |
| **Compliance** | Per-framework pass / partial / fail derived from findings | Governance / legal |
| **Evidence Log** | Numbered probe/response conversations, amber-highlighted when a finding is attached | Auditors |
| **Council Deliberation** *(deliberative)* / **Expert Comparison** *(aggregate)* | Full debate transcript with topic dividers and speaker filters, or side-by-side expert comparison for aggregate method | Method researchers |
| **All Findings** | Severity-grouped finding list with source-conversation drilldown | Security reviewers |
| **Action Items** | Prioritized mitigations in plain language, PDF download button | Engineering |

The **Overview tab is the default** so a non-technical reader lands on the plain-language view; technical users click into the other tabs for depth. No view-mode toggle is needed — progressive disclosure happens through normal tab navigation.

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
│   │   ├── github_ingestion_service.py # Parse GitHub URL → fetch README/code → profile extraction
│   │   └── pdf_service.py              # Server-side PDF report generation
│   └── logs/                           # Evaluation audit logs (backend/logs/*.json is gitignored)
├── frontend/
│   ├── src/
│   │   ├── pages/                      # LandingPage, EvaluatorPage, ResultsPage (8 tabs), DashboardPage, AboutPage
│   │   ├── components/                 # Nav, Footer, VerdictBadge, SeverityBadge, Badge, SectionHead, CompanyIcon
│   │   ├── utils/generatePDF.js        # Client-side PDF export template
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

## Local LLM Support

SafeCouncil supports on-premise LLM evaluation via LM Studio, Ollama, vLLM, or any OpenAI-compatible local endpoint. **There is no default endpoint** — point SafeCouncil at your own server.

1. Start your local LLM server and load a model
2. Add to `backend/.env` (replace the example with your actual endpoint and model):
   ```
   LOCAL_ENDPOINT=http://localhost:1234/v1
   LOCAL_MODEL=llama-3.1-8b-instruct
   LOCAL_API_KEY=lm-studio        # optional — only if your server requires auth
   ```
3. Restart the backend.
4. In the evaluation request, set an expert to `{"llm": "local", "enabled": true}`.

If you enable the local expert without setting `LOCAL_ENDPOINT` / `LOCAL_MODEL`, the backend fails fast with a clear error telling you which variable is missing.

The system automatically adapts: compact prompts, reduced token limits, extended timeouts.

### On-premise synthesis (cloud evaluation, on-prem report)

SafeCouncil also supports running **only the synthesis step** on a local LLM while keeping cross-critique evaluation on cloud APIs (or vice versa). On the Evaluator page under "Council Method", switch **Synthesis runs on** to **On-Premise (local LLM)** to route the final report generation to your `LOCAL_ENDPOINT`. This is useful for UN/IGO scenarios where the consolidated verdict document must stay on your hardware even when evaluation runs cloud.

Synthesis is the most demanding prompt in the system (long context, structured JSON output). It works best with 70B-class local models (Llama 3.1 70B, Qwen 2.5 72B). Smaller models may produce truncated reports — if local synthesis fails JSON parsing, SafeCouncil automatically falls back to a deterministic summary and surfaces a warning badge in the result page.

---

## Demo Mode (run without API keys)

SafeCouncil's demo mode runs **the real `SimpleOrchestrator` pipeline end-to-end** without any LLM API keys. It is not a deepcopy of a pre-built JSON template — every step that would normally call an LLM (evaluate, critique, revise, position statement, synthesize) executes against an `OfflineProvider` that returns deterministic, expert-seeded JSON responses. The orchestrator's parallel `ThreadPoolExecutor` runs, the critique round produces real disagreements, the revision round emits real `score_changes`, and the synthesis step produces a real `debate_transcript` — all computed by orchestrator code paths, not hard-coded.

The pre-built JSON templates under `backend/demo_fixtures/` exist only as a safety-net fallback if the offline orchestrator throws an exception.

**Configuration via `DEMO_MODE` environment variable in `backend/.env`:**

| Value | Behavior |
|---|---|
| `true` | Force demo mode regardless of API keys |
| `false` | Force real mode — backend will fail evaluations if no real keys are configured |
| `auto` | *(default)* Demo mode when all three cloud API keys are missing **OR still set to the `.env.example` placeholders** (`your_anthropic_api_key_here` etc.). As soon as you set even one real key, real evaluation runs |

The auto detection treats placeholder values as "not set" so a first-time grader who runs `make setup` and never touches `.env` lands in demo mode automatically — the previous footgun where placeholder strings passed a `bool()` check is fixed.

**For graders / first-time evaluators:**

```bash
make setup       # creates backend/.env from .env.example (empty keys)
make install-frontend
make dev         # starts backend + frontend
```

Open the evaluator page → submit any agent → the **real** SimpleOrchestrator runs end-to-end via the offline provider and returns a result with real arbitration artifacts. **No API keys required.** Or use the one-command path:

```bash
make demo        # runs a VeriMedia demo end-to-end and prints verdict + summary to stdout
```

**For developers switching modes:**

Edit `backend/.env` to change `DEMO_MODE` or add API keys, then **restart the backend** with `make dev` for the changes to take effect. Environment variables are loaded once at startup.

**Verifying which mode the backend is in:**

```bash
curl http://localhost:5000/api/health
```

The response includes a `demo_mode: true|false` field.

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
| `make dev` | **Default** — start backend (:5000) then poll `/api/health` until ready, then start frontend (:3000). Fails fast if backend doesn't come up within 30s. |
| `make setup` | Create venv, install deps, copy `.env.example` (which ships with empty keys → DEMO_MODE auto-engages on first run) |
| `make run` | Start backend server only |
| `make install-frontend` | Install frontend dependencies |
| `make run-frontend` | Start frontend dev server only |
| `make test` | Run unit tests (no server, no API keys needed) |
| `make test-api` | Run integration tests (requires live server) |
| `make test-all` | Run all tests (requires server + API keys) |
| `make demo` | **One-command grader path** — wipe `.env` so DEMO_MODE auto-engages, start backend, POST a VeriMedia evaluation, poll for completion, pretty-print verdict + executive summary + count of `score_changes` to prove the real orchestrator ran. Then stops the backend. No API keys required. |
| `make clean` | Remove venv and cache files |

---

## Credits

- **NYU SPS × UNICC AI Governance Capstone** — Spring 2026
- Governance frameworks: EU AI Act, NIST AI RMF, UNESCO AI Ethics, OWASP Top 10 for LLMs, ISO 42001, UNICC AI Governance

---

## Project Contributors

SafeCouncil is a 3-student capstone where each contributor owns a distinct project area. The codebase is organized so each student's work maps to a clear set of modules:

| Contributor | Project Area | Owns these modules |
|---|---|---|
| **Pengyun (Jimmy) Ma** | Platform & Infrastructure | `backend/config.py`, `backend/governance/`, `backend/dimensions/`, `backend/services/github_ingestion_service.py`, `backend/experts/llm_providers/` (provider abstractions, local LLM support, modular architecture) |
| **Gilang Laba** | AI Orchestration & Synthesis | `backend/orchestrators/`, `backend/experts/expert.py`, `backend/experts/base_expert.py`, `backend/prompts/` (council-of-experts, deliberative pipeline, cross-critique, score revision, synthesis) |
| **Iris Zhang** | UX & Integration | `frontend/`, `backend/services/evaluation_service.py`, `backend/app.py` (React UI, evaluator/results pages, API integration, end-to-end user flow) |

Shared infrastructure (`backend/models/schemas.py`, `backend/demo_data.py`, `tests/`, `Makefile`) is owned jointly. The three projects integrate through the platform's modular architecture — each layer can be developed and tested independently.

---
## License

MIT License — see LICENSE for details.
