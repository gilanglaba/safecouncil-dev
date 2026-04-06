"""
SafeCouncil test configuration.

Test categories:
  - unit: No API calls, no live server. Runs by default with `make test` or `pytest`.
  - integration: Requires Flask server running on localhost:5000. Run with `pytest -m integration`.
  - live_api: Makes real LLM API calls (costs money). Run with `pytest -m live_api`.

Usage:
  pytest                          # unit tests only (default)
  pytest -m integration           # integration tests (start server first)
  pytest -m live_api              # live API tests (requires API keys)
  pytest -m "not live_api"        # all tests except live API
"""
import sys
import os

# Allow imports from backend/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
