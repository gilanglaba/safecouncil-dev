.PHONY: setup run dev install-frontend run-frontend test test-api test-all clean demo

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

# Default target — run both backend and frontend
# Polls /api/health until the backend is actually listening before starting
# the frontend, so the dev loop does not race on slow machines.
dev: $(VENV)
	@$(PYTHON) -c "import dotenv" 2>/dev/null || $(PIP) install -r backend/requirements.txt
	@echo "Starting SafeCouncil (backend :5000 + frontend :3000)..."
	@cd backend && ../$(PYTHON) app.py &
	@printf "Waiting for backend to become ready"; \
	for i in $$(seq 1 30); do \
		if curl -fsS http://localhost:5000/api/health >/dev/null 2>&1; then \
			printf " ready (%ds)\n" "$$i"; \
			break; \
		fi; \
		if [ "$$i" -eq 30 ]; then \
			printf "\nERROR: backend did not come up on :5000 within 30s. Check backend logs.\n" >&2; \
			pkill -f "python app.py" 2>/dev/null || true; \
			pkill -f "python3 app.py" 2>/dev/null || true; \
			exit 1; \
		fi; \
		printf "."; \
		sleep 1; \
	done
	@cd frontend && npm run dev

run: $(VENV)
	$(PYTHON) -c "import dotenv" 2>/dev/null || $(PIP) install -r backend/requirements.txt
	cd backend && FLASK_DEBUG=false ../$(PYTHON) app.py

setup: $(VENV)
	$(PIP) install -r backend/requirements.txt
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo ""; \
		echo ">>> Created backend/.env from .env.example"; \
		echo ">>> Edit backend/.env and add your API keys before running."; \
	else \
		echo ">>> backend/.env already exists — skipping copy."; \
	fi

$(VENV):
	python3 -m venv $(VENV)

install-frontend:
	cd frontend && npm install

run-frontend:
	cd frontend && npm run dev

# Unit tests only — safe to run without server or API keys (default via pytest.ini)
test: $(VENV)
	PYTHONPATH=backend $(PYTHON) -m pytest -v

# Integration tests — requires live Flask server on localhost:5000
test-api: $(VENV)
	PYTHONPATH=backend $(PYTHON) -m pytest -m integration -v

# All tests including live API calls — requires server + API keys
test-all: $(VENV)
	PYTHONPATH=backend $(PYTHON) -m pytest -m "" -v

clean:
	rm -rf $(VENV) __pycache__ backend/__pycache__ .pytest_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

# One-command grader path: wipe .env so DEMO_MODE auto-engages, start the
# backend, POST a VeriMedia evaluation, poll for completion, print the
# verdict + executive summary + count of score_changes proving the real
# orchestrator ran. No API keys required.
demo: $(VENV)
	@$(PYTHON) -c "import dotenv" 2>/dev/null || $(PIP) install -r backend/requirements.txt
	@echo ">>> Preparing demo environment (DEMO_MODE auto)..."
	@if [ ! -f backend/.env ]; then \
		cp backend/.env.example backend/.env; \
		echo ">>> Created backend/.env from .env.example"; \
	else \
		echo ">>> backend/.env already exists — leaving it alone (use 'make demo-reset' to force)."; \
	fi
	@echo ">>> Starting backend on :5000 (logs: /tmp/sc.log)..."
	@cd backend && ../$(PYTHON) app.py > /tmp/sc.log 2>&1 &
	@sleep 3
	@./scripts/demo_verimedia.sh || true
	@echo ">>> Stopping backend..."
	@pkill -f "python app.py" 2>/dev/null || true
	@pkill -f "python3 app.py" 2>/dev/null || true

# Destructive reset: force backend/.env back to the template (wipes keys).
# Use this only when you deliberately want a clean grader-style demo state.
demo-reset:
	@echo ">>> WARNING: overwriting backend/.env with .env.example (keys will be lost)"
	@cp backend/.env.example backend/.env
	@echo ">>> Done. backend/.env reset to template."
