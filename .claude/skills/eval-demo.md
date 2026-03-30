---
name: eval-demo
description: Run a demo evaluation using the WFP chatbot example
---

Run a full demo evaluation against the SafeCouncil backend using pre-loaded WFP chatbot data. This makes real LLM API calls (~$0.30).

## Steps

1. **Check backend is running**:
   ```bash
   curl -s http://localhost:5000/api/health
   ```
   If not running, tell the user to start it with `/dev`.

2. **Submit demo evaluation**:
   ```bash
   curl -s -X POST http://localhost:5000/api/evaluate/demo | python3 -m json.tool
   ```
   Capture the `eval_id` from the response.

3. **Poll for status** every 5 seconds until complete or failed:
   ```bash
   curl -s http://localhost:5000/api/evaluate/{eval_id}/status | python3 -m json.tool
   ```

4. **Fetch full results** when complete:
   ```bash
   curl -s http://localhost:5000/api/evaluate/{eval_id} | python3 -m json.tool
   ```

5. **Report summary**:
   - Final verdict (GO / CONDITIONAL / NO-GO)
   - Confidence score
   - Agreement rate between experts
   - Evaluation time
   - Key findings or risk areas flagged
