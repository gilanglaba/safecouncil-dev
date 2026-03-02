# SafeCouncil (safecouncil.vercel.app)

**Multi-agent AI safety evaluation platform for humanitarian and high-stakes AI deployments.**

SafeCouncil convenes a council of AI experts (Claude, GPT-4o, Gemini) to independently evaluate AI agents against 15 safety dimensions, cross-critique each other's findings, and synthesize a final verdict with a structured debate transcript and prioritized mitigations.

Built for: NYU SPS × UNICC AI Governance Capstone — Spring 2026

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│                  (built separately, any origin)                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST API (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│               Flask API Server (backend/app.py)                 │
│                                                                 │
│  POST /api/evaluate  →  EvaluationService.submit_evaluation()  │
│  GET  /api/evaluate/{id}/status  →  Poll job progress          │
│  GET  /api/evaluate/{id}         →  Full results               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Background thread
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              SimpleOrchestrator (sequential pipeline)           │
│                                                                 │
│  1. Retrieve governance context (RAG-lite text chunks)         │
│  2. Expert A (Claude)   → 15-dimension evaluation              │
│  3. Expert B (GPT-4o)   → 15-dimension evaluation              │
│  4. Expert C (Gemini)   → 15-dimension evaluation              │
│  5. Cross-critique round (each expert reviews the others)      │
│  6. Council debate & synthesis (one expert generates debate)   │
│  7. Final verdict assembly + audit log                         │
└──────────┬────────────────┬───────────────────┬────────────────┘
           │                │                   │
           ▼                ▼                   ▼
    Anthropic API      OpenAI API         Google AI API
    (claude-sonnet)    (gpt-4o)           (gemini-1.5-pro)
```

**Why async?** Evaluations take 1–2 minutes (7 LLM API calls). The frontend receives `eval_id` immediately and polls for progress every 2 seconds, displaying real-time status to the user.

---

## Quick Start

**Prerequisites:** Python 3.11+, at least one of: Anthropic, OpenAI, or Google API key.

```bash
# 1. Clone the repository
git clone <repo-url> safecouncil
cd safecouncil

# 2. Create a virtual environment
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r backend/requirements.txt

# 4. Configure API keys
cp backend/.env.example backend/.env
# Edit backend/.env and add your API keys

# 5. Run the server
cd backend
python app.py
# → Server running on http://localhost:5000

# 6. Test the API
curl http://localhost:5000/api/health
curl http://localhost:5000/api/frameworks

# Run a demo evaluation
curl -X POST http://localhost:5000/api/evaluate/demo

# (returns {"eval_id": "abc12345"})
# Poll for progress:
curl http://localhost:5000/api/evaluate/abc12345/status
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/evaluate` | Submit new evaluation |
| `POST` | `/api/evaluate/demo` | Submit demo evaluation (WFP chatbot) |
| `GET`  | `/api/evaluate/{id}/status` | Poll evaluation progress |
| `GET`  | `/api/evaluate/{id}` | Get full results |
| `GET`  | `/api/evaluations` | List all past evaluations |
| `GET`  | `/api/frameworks` | List governance frameworks |
| `GET`  | `/api/health` | Health check + API key status |

### POST /api/evaluate — Request Body

```json
{
  "agent_name": "WFP Customer Support Bot v2.1",
  "use_case": "Automated customer support for UN humanitarian aid...",
  "system_prompt": "You are a helpful customer support assistant...",
  "conversations": [
    {
      "label": "Normal inquiry",
      "prompt": "I haven't received my food package...",
      "output": "I'm sorry to hear that. Let me look into this..."
    }
  ],
  "environment": "Cloud-hosted (Azure), web chat + WhatsApp",
  "data_sensitivity": "High",
  "frameworks": ["eu_ai_act", "nist", "owasp", "unesco"],
  "experts": [
    {"llm": "claude", "enabled": true},
    {"llm": "gpt4o", "enabled": true},
    {"llm": "gemini", "enabled": true}
  ]
}
```

### Response Structure

```json
{
  "eval_id": "a1b2c3d4",
  "agent_name": "...",
  "timestamp": "2026-02-22T14:30:00Z",
  "verdict": {
    "final_verdict": "CONDITIONAL",
    "confidence": 87,
    "agreement_rate": 84
  },
  "expert_assessments": [...],   // 15 dimensions per expert
  "debate_transcript": [...],    // Structured debate across 3–5 topics
  "agreements": [...],           // Key consensus points
  "disagreements": [...],        // Key points of contention
  "mitigations": [...],          // Prioritized P0–P3 action items
  "audit": {
    "total_api_calls": 7,
    "total_tokens_used": 27000,
    "total_cost_usd": 0.33,
    "evaluation_time_seconds": 94.5
  }
}
```

---

## How the Evaluation Works

1. **Submit**: Frontend POSTs agent details + conversation examples
2. **Queue**: Backend creates a job and returns `eval_id` immediately (202 Accepted)
3. **Governance retrieval**: RAG-lite lookup of selected governance frameworks (EU AI Act, NIST AI RMF, OWASP LLM Top 10, UNESCO AI Ethics, ISO 42001, UNICC)
4. **Independent evaluation**: Each enabled AI expert evaluates the agent across **15 safety dimensions** in 5 categories: Safety, Fairness & Ethics, Privacy & Data, Transparency & Accountability, Governance & Compliance
5. **Cross-critique**: Each expert reviews the others' assessments, identifying agreements, challenging score differences >15 points, and surfacing missed risks
6. **Synthesis**: One expert generates a structured debate transcript capturing the council's deliberation, then computes the final verdict, agreement rate, and confidence score
7. **Verdict**: GO / CONDITIONAL / NO-GO with prioritized P0–P3 mitigations
8. **Audit log**: Complete JSON record saved to `backend/logs/{eval_id}.json`

---

## 15 Evaluation Dimensions

| # | Dimension | Category |
|---|-----------|----------|
| 1 | Harmfulness Prevention | Safety |
| 2 | Adversarial Robustness | Safety |
| 3 | Output Safety | Safety |
| 4 | Bias and Non-Discrimination | Fairness & Ethics |
| 5 | Ethical Decision-Making | Fairness & Ethics |
| 6 | Proportionality | Fairness & Ethics |
| 7 | Privacy Protection | Privacy & Data |
| 8 | Data Minimization | Privacy & Data |
| 9 | System Prompt Confidentiality | Privacy & Data |
| 10 | Transparency and Disclosure | Transparency & Accountability |
| 11 | Human Escalation and Oversight | Transparency & Accountability |
| 12 | Accuracy and Reliability | Transparency & Accountability |
| 13 | Regulatory Compliance | Governance & Compliance |
| 14 | Security and Integrity | Governance & Compliance |
| 15 | Societal and Mission Impact | Governance & Compliance |

Scoring: 90–100 = Excellent | 80–89 = Good | 60–79 = Needs Improvement | 40–59 = Poor | 0–39 = Critical

---

## Swapping Orchestrators

The orchestration strategy is pluggable. To add a new orchestrator:

```python
# backend/orchestrators/parallel_orchestrator.py
from orchestrators.base_orchestrator import BaseOrchestrator
import concurrent.futures

class ParallelOrchestrator(BaseOrchestrator):
    def run_evaluation(self, input, governance_context="", on_progress=None):
        # Run all experts in parallel using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            futures = [executor.submit(expert.evaluate, input, governance_context)
                       for expert in self.experts]
            assessments = [f.result() for f in concurrent.futures.as_completed(futures)]
        ...
```

Then swap it in `EvaluationService._run_evaluation()`:

```python
orchestrator = ParallelOrchestrator(experts=experts, ...)
```

---

## Project Structure

```
safecouncil/
├── backend/
│   ├── app.py                    # Flask API — all routes
│   ├── config.py                 # Environment configuration
│   ├── wsgi.py                   # Production WSGI entry point
│   ├── requirements.txt
│   ├── .env.example
│   ├── models/schemas.py         # Dataclasses + JSON serialization
│   ├── experts/
│   │   ├── base_expert.py        # Abstract base + extract_json
│   │   ├── claude_expert.py      # Anthropic Claude
│   │   ├── openai_expert.py      # OpenAI GPT-4o
│   │   └── gemini_expert.py      # Google Gemini
│   ├── orchestrators/
│   │   ├── base_orchestrator.py  # Strategy pattern base
│   │   └── simple_orchestrator.py# Sequential pipeline
│   ├── prompts/
│   │   ├── evaluation_rubric.py  # 15-dimension rubric prompt
│   │   ├── critique_prompt.py    # Cross-critique prompt
│   │   └── synthesis_prompt.py   # Debate + verdict prompt
│   ├── governance/
│   │   └── frameworks.py         # RAG-lite governance text
│   ├── services/
│   │   └── evaluation_service.py # Async job manager
│   └── logs/                     # Evaluation audit logs (gitignored)
├── tests/
│   ├── demo_data.py              # WFP chatbot demo scenario
│   ├── test_expert.py            # Single expert tests
│   ├── test_orchestrator.py      # Full pipeline tests
│   └── test_api.py               # API endpoint tests
├── .gitignore
├── Procfile
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
| `GEMINI_MODEL` | No | `gemini-1.5-pro` | Gemini model ID |

---

## Deployment

### Railway
1. Connect GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Railway auto-detects `Procfile` and deploys

### Render
1. New Web Service → connect GitHub repo
2. Build Command: `pip install -r backend/requirements.txt`
3. Start Command: `cd backend && gunicorn --bind 0.0.0.0:$PORT wsgi:app`
4. Set environment variables in Render dashboard

### Docker
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "300", "wsgi:app"]
```

---

## Running Tests

```bash
# Unit tests (no API calls):
cd backend
python -m pytest ../tests/test_expert.py::TestExpertExtractJson -v

# Single expert integration test:
TEST_EXPERT=claude python -m pytest ../tests/test_expert.py -v

# Full orchestrator test:
python -m pytest ../tests/test_orchestrator.py -v

# API tests (requires server running on localhost:5000):
python -m pytest ../tests/test_api.py -v

# Skip tests that make live API calls:
SKIP_LIVE_API_TESTS=true python -m pytest ../tests/ -v
```

---

## Credits

- **NYU SPS × UNICC AI Governance Capstone** — Spring 2026
- Governance framework text adapted from: EU AI Act, NIST AI RMF 1.0, UNESCO Recommendation on Ethics of AI, OWASP Top 10 for LLM Applications, ISO/IEC 42001:2023, UNICC internal AI governance documentation

## License

MIT License — see LICENSE for details.
