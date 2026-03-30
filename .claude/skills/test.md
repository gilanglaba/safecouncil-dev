---
name: test
description: Run the SafeCouncil test suite
---

Run the SafeCouncil test suite. Default behavior: skip tests that make live LLM API calls (they cost money and take time).

## Steps

1. **Run unit tests** (no API calls, no running server needed):
   ```bash
   cd /Users/gilang/Project/Capstone/safecouncil-dev/backend && python -m pytest ../tests/ -v -k "not live" 2>&1 || python -m pytest ../tests/test_expert.py::TestExpertExtractJson -v
   ```

2. If the user asks for **full/integration tests**, first check if the backend is running:
   ```bash
   curl -s http://localhost:5000/api/health
   ```
   - If not running, tell the user to start it with `/dev`
   - If running, run all tests: `cd backend && python -m pytest ../tests/ -v`
   - Warn: live API tests cost ~$0.30 per evaluation

3. **Report summary**: total passed / failed / skipped, and highlight any failures with details.
