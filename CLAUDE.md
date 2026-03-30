# SafeCouncil

Council-of-experts AI evaluation platform where multiple LLMs independently assess AI agents across safety, governance, compliance, risk, and security — specifically calibrated for UN/international organization deployment contexts including humanitarian operations, multi-jurisdictional compliance, and vulnerable population protection.

**Triple goal:** Graduate academic paper · UN whitepaper · Startup product

## Architecture

- **Backend:** Flask REST API (`backend/`) — Python 3.11
- **Frontend:** React 18 + Vite (`frontend/`) — inline styles only
- **Tests:** `tests/` directory (pytest)
- **Deploy:** Railway (backend) + Vercel (frontend)

### Core Design Principles

- **Provider-agnostic**: Experts extend `BaseExpert`, orchestrators extend `BaseOrchestrator` (Strategy pattern). Must support future local/on-premise LLMs.
- **Granular & reusable**: Each component (expert, orchestrator, prompt, governance framework) is independently swappable.
- **Multi-orchestrator**: Will have multiple orchestrator strategies for academic comparison. Keep orchestrator logic decoupled from service/step tracking.

### Adding a New Expert Provider

1. Create `backend/experts/new_expert.py` extending `BaseExpert`
2. Implement `_call_llm()`, `evaluate()`, `critique()`, `synthesize()`
3. Register in `evaluation_service.py` `_create_experts()`
4. Add config in `backend/config.py`

### Adding a New Orchestrator

1. Create `backend/orchestrators/new_orchestrator.py` extending `BaseOrchestrator`
2. Implement `run_evaluation()` with your debate/evaluation method
3. Wire up in `evaluation_service.py`

## Commands

```bash
# Backend
cd backend && python app.py                    # Dev server on :5000
cd backend && pip install -r requirements.txt  # Install deps

# Frontend
cd frontend && npm install                     # Install deps
cd frontend && npm run dev                     # Dev server on :3000 (proxies /api/* → :5000)
cd frontend && npm run build                   # Production build

# Tests
cd backend && python -m pytest ../tests/ -v
```

## Code Conventions

### Frontend

- **NO CSS files.** All styling via inline `style={{}}` props.
- All colors/tokens from `theme.js`. Import: `import { theme } from "../theme";`
- API calls through `frontend/src/api.js` only — never raw fetch in components.
- Functional components + hooks only. No class components, no state library.
- Font family: DM Sans (sans), DM Mono (monospace).
- Brand colors: NYU Violet (#57068C) and UN Blue (#5B92E5).

### Backend

- Strategy pattern for orchestrators and experts.
- Dataclasses in `models/schemas.py` with `from_dict()`/`to_dict()`.
- Async evaluations via `threading.Thread` with in-memory job dict.
- Type hints, `logging.getLogger(__name__)`, f-strings.
- Prompts in `backend/prompts/` — changes affect all evaluations, test thoroughly.
- API responses always return JSON with appropriate HTTP status codes.
- Never hardcode API keys — always use Config class from `backend/config.py`.

## Reference Projects
- **Project Team 1** (AI Safety Evaluation Framework) is available as a reference for brainstorming business logic and architecture patterns. Business logic summary is stored in `.claude/memory/reference_team1.md`. For deeper research into actual source code, use the `reference-team1` agent. When referring to ideas or patterns from this project, always mention it is **based on "Project Team 1"**. It is a reference only — do not copy or strictly follow its implementation. The original source files are in folder /reference/Team1.
- **Project Team 8** (UNICC AI Safety Governance Platform) is available as a reference for brainstorming business logic and architecture patterns. Business logic summary is stored in `.claude/memory/reference_team8.md`. For deeper research into actual source code, use the `reference-team8` agent. When referring to ideas or patterns from this project, always mention it is **based on "Project Team 8"**. It is a reference only — do not copy or strictly follow its implementation. The original source files are in folder /reference/Team8.

## Warnings

- **NEVER** commit `.env` files or API keys.
- **NEVER** commit `backend/logs/*.json`.
- `backend/prompts/evaluation_rubric.py` is the most impactful file — test after any edit.
- Evaluations make multiple real LLM API calls and cost money. Don't loop.
- Both servers must run for full dev experience (frontend proxies to backend).
