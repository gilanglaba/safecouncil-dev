---
name: dev
description: Start both backend and frontend dev servers and verify health
---

Start the SafeCouncil development environment by running both servers simultaneously.

## Steps

1. **Start the backend** (Flask on port 5000) as a background process:
   ```bash
   cd /Users/gilang/Project/Capstone/safecouncil-dev/backend && python app.py
   ```

2. **Start the frontend** (Vite on port 3000) as a background process:
   ```bash
   cd /Users/gilang/Project/Capstone/safecouncil-dev/frontend && npm run dev
   ```

3. **Wait a few seconds**, then verify the backend is healthy:
   ```bash
   curl -s http://localhost:5000/api/health | python3 -m json.tool
   ```

4. Report to the user:
   - Which servers are running
   - Which AI provider API keys are configured (from health check response)
   - URLs: backend at http://localhost:5000, frontend at http://localhost:3000
