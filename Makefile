.PHONY: setup run dev install-frontend run-frontend test test-api clean

VENV := .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip

# Default target — run both backend and frontend
dev: $(VENV)
	@$(PYTHON) -c "import dotenv" 2>/dev/null || $(PIP) install -r backend/requirements.txt
	@echo "Starting SafeCouncil (backend :5000 + frontend :3000)..."
	@cd backend && ../$(PYTHON) app.py &
	@sleep 2
	@cd frontend && npm run dev

run: $(VENV)
	$(PYTHON) -c "import dotenv" 2>/dev/null || $(PIP) install -r backend/requirements.txt
	cd backend && ../$(PYTHON) app.py

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

# Unit tests only (no live server required)
test: $(VENV)
	cd backend && ../$(PYTHON) -m pytest ../tests/test_expert.py -v

# Integration tests (requires live server on localhost:5000)
test-api: $(VENV)
	cd backend && ../$(PYTHON) -m pytest ../tests/test_api.py -v

clean:
	rm -rf $(VENV) __pycache__ backend/__pycache__ .pytest_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
