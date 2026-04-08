#!/usr/bin/env bash
# SafeCouncil one-command demo verification.
#
# Submits a VeriMedia evaluation against a running backend, polls until
# complete, and pretty-prints:
#   - verdict.final_verdict
#   - executive_summary
#   - total score_changes across all experts (proves the real orchestrator
#     ran, not a template deepcopy)
#   - agent_name + eval_id
#
# Used by `make demo`. Requires: curl, jq (or falls back to python3).

set -euo pipefail

HOST="${SC_HOST:-http://localhost:5000}"
REPO_URL="${SC_REPO_URL:-https://github.com/FlashCarrot/VeriMedia}"
AGENT_NAME="${SC_AGENT_NAME:-VeriMedia}"

echo ""
echo "=================================================================="
echo "  SafeCouncil Demo: $AGENT_NAME"
echo "  Backend: $HOST"
echo "  Repo:    $REPO_URL"
echo "=================================================================="
echo ""

# Check backend is up
if ! curl -fsS "$HOST/api/health" > /dev/null 2>&1; then
  echo "ERROR: Backend not reachable at $HOST. Is it running?"
  echo "       Try: make run"
  exit 1
fi

# Verify demo mode is active
DEMO_MODE=$(curl -fsS "$HOST/api/health" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('demo_mode', False))")
echo "  demo_mode: $DEMO_MODE"
echo ""

# Submit evaluation
echo ">>> Submitting evaluation..."
BODY=$(cat <<JSON
{
  "agent_name": "$AGENT_NAME",
  "input_method": "api_probe",
  "api_config": {"github_url": "$REPO_URL"},
  "experts": [
    {"llm": "offline", "enabled": true}
  ],
  "conversations": [{"label": "demo", "prompt": "hi", "output": "hello"}],
  "orchestration_method": "deliberative",
  "frameworks": ["eu_ai_act", "nist", "owasp"]
}
JSON
)

RESPONSE=$(curl -fsS -X POST "$HOST/api/evaluate" \
  -H "Content-Type: application/json" \
  -d "$BODY")

EVAL_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('eval_id', ''))")

if [ -z "$EVAL_ID" ]; then
  echo "ERROR: Failed to submit evaluation"
  echo "$RESPONSE"
  exit 1
fi

echo "    eval_id: $EVAL_ID"

# Poll for completion
echo ">>> Waiting for council deliberation..."
for i in $(seq 1 60); do
  STATUS=$(curl -fsS "$HOST/api/evaluate/$EVAL_ID/status" | python3 -c "import sys, json; print(json.load(sys.stdin).get('status', ''))")
  if [ "$STATUS" = "complete" ]; then
    echo "    complete in ${i}s"
    break
  fi
  if [ "$STATUS" = "failed" ]; then
    echo "    FAILED — check /tmp/sc.log"
    exit 1
  fi
  sleep 1
done

# Fetch result and pretty-print
echo ""
echo "=================================================================="
echo "  RESULT"
echo "=================================================================="

RESULT_FILE=$(mktemp)
curl -fsS "$HOST/api/evaluate/$EVAL_ID" -o "$RESULT_FILE"

RESULT_FILE="$RESULT_FILE" python3 <<'PYEOF'
import json, os
with open(os.environ["RESULT_FILE"]) as f:
    r = json.load(f)

verdict = r.get("verdict", {}).get("final_verdict", "?")
conf = r.get("verdict", {}).get("confidence", "?")
agree = r.get("verdict", {}).get("agreement_rate", "?")
exec_sum = r.get("executive_summary") or "(not set)"

# Count real score_changes — proves orchestrator actually ran
changes = sum(len(a.get("score_changes", [])) for a in r.get("expert_assessments", []))
debate = len(r.get("debate_transcript", []))
experts = len(r.get("expert_assessments", []))
audit = r.get("audit", {})

print(f"  Agent:            {r.get('agent_name')}")
print(f"  Eval ID:          {r.get('eval_id')}")
print(f"  Method:           {r.get('orchestrator_method')}")
print()
print(f"  Verdict:          {verdict}  (confidence {conf}%, agreement {agree}%)")
print()
print("  Executive Summary:")
# Word-wrap at ~72 chars
import textwrap
for line in textwrap.wrap(exec_sum, width=68):
    print(f"    {line}")
print()
print(f"  Experts:          {experts}")
print(f"  Debate rounds:    {debate}")
print(f"  Score changes:    {changes}  ← {'REAL orchestrator output' if changes > 0 else 'WARNING: zero (template?)'}")
print(f"  Demo mode:        {bool(audit.get('demo_mode'))}")
print(f"  Synthesis fallback: {bool(audit.get('synthesis_fallback'))}")
print()
print("  Top 3 findings:")
seen = 0
for a in r.get("expert_assessments", []):
    for f in a.get("findings", []):
        if seen >= 3:
            break
        print(f"    [{f.get('severity'):<6}] {f.get('dimension', '')[:40]:<40}  {f.get('framework_ref') or ''}")
        seen += 1
    if seen >= 3:
        break
print()
print("  Top mitigations:")
for m in r.get("mitigations", [])[:3]:
    text = (m.get("text") or "")[:80]
    print(f"    [{m.get('priority'):<3}] {text}")

print()
print("=" * 66)
if changes > 0 and not audit.get("synthesis_fallback"):
    if audit.get("demo_mode"):
        print("  ✓ SafeCouncil demo complete — real orchestrator pipeline executed")
        print("    offline (no live API keys), producing verdict + executive summary.")
    else:
        print("  ✓ SafeCouncil evaluation complete — real orchestrator pipeline executed")
        print("    against live LLM APIs.")
else:
    print("  ⚠ Run completed but orchestrator output looks degraded. Check /tmp/sc.log")
print("=" * 66)
PYEOF

rm -f "$RESULT_FILE"
