"""
Integration tests for SafeCouncil API endpoints.
Requires the Flask server to be running on localhost:5000.

Usage:
    # Start the server first:
    cd backend && python app.py

    # Then run tests:
    python tests/test_api.py
    # or:
    pytest tests/test_api.py -v
"""
import sys
import os
import time
import json
import unittest

# Allow running from project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not installed. Run: pip install requests")
    sys.exit(1)

BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000")


def wait_for_completion(eval_id: str, timeout: int = 300, poll_interval: int = 2) -> dict:
    """Poll status endpoint until evaluation completes or times out."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = requests.get(f"{BASE_URL}/api/evaluate/{eval_id}/status")
        assert resp.status_code == 200, f"Status poll failed: {resp.status_code} {resp.text}"
        data = resp.json()
        status = data.get("status")
        print(f"  [{eval_id}] Status: {status} | Progress: {data.get('progress')}% | {data.get('current_step')}")
        if status == "complete":
            return data
        if status == "failed":
            raise AssertionError(f"Evaluation failed: {data.get('error')}")
        time.sleep(poll_interval)
    raise TimeoutError(f"Evaluation {eval_id} did not complete within {timeout} seconds")


class TestHealthEndpoint(unittest.TestCase):
    """Test /api/health"""

    def test_health_returns_200(self):
        resp = requests.get(f"{BASE_URL}/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("status", data)
        self.assertIn("version", data)
        self.assertIn("experts", data)
        print(f"\n  Health: {data['status']} | Experts: {data['experts']}")

    def test_health_has_all_expert_keys(self):
        resp = requests.get(f"{BASE_URL}/api/health")
        data = resp.json()
        experts = data.get("experts", {})
        for provider in ["claude", "gpt4o", "gemini"]:
            self.assertIn(provider, experts)
            self.assertIn("available", experts[provider])


class TestFrameworksEndpoint(unittest.TestCase):
    """Test /api/frameworks"""

    def test_frameworks_returns_200(self):
        resp = requests.get(f"{BASE_URL}/api/frameworks")
        self.assertEqual(resp.status_code, 200)

    def test_frameworks_has_all_six(self):
        resp = requests.get(f"{BASE_URL}/api/frameworks")
        data = resp.json()
        frameworks = data.get("frameworks", [])
        self.assertGreaterEqual(len(frameworks), 6)
        ids = [f["id"] for f in frameworks]
        for expected_id in ["eu_ai_act", "nist", "owasp", "unesco", "iso42001", "unicc"]:
            self.assertIn(expected_id, ids, f"Missing framework: {expected_id}")

    def test_frameworks_have_required_fields(self):
        resp = requests.get(f"{BASE_URL}/api/frameworks")
        data = resp.json()
        for fw in data.get("frameworks", []):
            self.assertIn("id", fw)
            self.assertIn("label", fw)
            self.assertIn("description", fw)
            self.assertIn("default", fw)


class TestEvaluationSubmission(unittest.TestCase):
    """Test POST /api/evaluate"""

    def test_submit_returns_202_with_eval_id(self):
        from tests.demo_data import DEMO_INPUT
        # Use only one expert to keep test faster (unless we want full test)
        test_input = {
            **DEMO_INPUT,
            "experts": [{"llm": "claude", "enabled": True}],
        }
        resp = requests.post(f"{BASE_URL}/api/evaluate", json=test_input)
        self.assertEqual(resp.status_code, 202, f"Expected 202, got {resp.status_code}: {resp.text}")
        data = resp.json()
        self.assertIn("eval_id", data)
        self.assertEqual(data["status"], "queued")
        self.assertIsInstance(data["eval_id"], str)
        print(f"\n  Submitted evaluation: {data['eval_id']}")

    def test_submit_validates_missing_agent_name(self):
        resp = requests.post(f"{BASE_URL}/api/evaluate", json={
            "conversations": [{"prompt": "test", "output": "test"}],
            "experts": [{"llm": "claude", "enabled": True}],
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.json())

    def test_submit_validates_no_conversations(self):
        resp = requests.post(f"{BASE_URL}/api/evaluate", json={
            "agent_name": "Test Agent",
            "conversations": [],
            "experts": [{"llm": "claude", "enabled": True}],
        })
        self.assertEqual(resp.status_code, 400)

    def test_submit_validates_no_enabled_experts(self):
        resp = requests.post(f"{BASE_URL}/api/evaluate", json={
            "agent_name": "Test Agent",
            "conversations": [{"label": "test", "prompt": "hello", "output": "world"}],
            "experts": [{"llm": "claude", "enabled": False}],
        })
        self.assertEqual(resp.status_code, 400)

    def test_submit_invalid_json(self):
        resp = requests.post(
            f"{BASE_URL}/api/evaluate",
            data="not json",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(resp.status_code, 400)


class TestStatusPolling(unittest.TestCase):
    """Test GET /api/evaluate/{id}/status"""

    def test_status_returns_404_for_unknown_id(self):
        resp = requests.get(f"{BASE_URL}/api/evaluate/doesnotexist/status")
        self.assertEqual(resp.status_code, 404)

    def test_status_polling_flow(self):
        """Submit, poll, verify structure."""
        from tests.demo_data import DEMO_INPUT
        # Single expert for speed
        test_input = {
            **DEMO_INPUT,
            "agent_name": "Status Test Agent",
            "conversations": [DEMO_INPUT["conversations"][0]],  # Just one conversation
            "experts": [{"llm": "claude", "enabled": True}],
            "frameworks": ["owasp"],
        }

        # Submit
        submit_resp = requests.post(f"{BASE_URL}/api/evaluate", json=test_input)
        self.assertEqual(submit_resp.status_code, 202)
        eval_id = submit_resp.json()["eval_id"]

        # Immediate status check
        status_resp = requests.get(f"{BASE_URL}/api/evaluate/{eval_id}/status")
        self.assertEqual(status_resp.status_code, 200)
        status_data = status_resp.json()
        self.assertIn("eval_id", status_data)
        self.assertIn("status", status_data)
        self.assertIn("progress", status_data)
        self.assertIn("steps_completed", status_data)
        self.assertEqual(status_data["eval_id"], eval_id)
        self.assertIn(status_data["status"], ["queued", "running", "complete"])

        print(f"\n  Eval ID: {eval_id}, Initial status: {status_data['status']}")


class TestResultRetrieval(unittest.TestCase):
    """Test GET /api/evaluate/{id} and full end-to-end flow."""

    def test_result_404_for_unknown_id(self):
        resp = requests.get(f"{BASE_URL}/api/evaluate/doesnotexist")
        self.assertEqual(resp.status_code, 404)

    def test_full_evaluation_flow(self):
        """
        Full end-to-end test: submit → poll → verify result structure.
        NOTE: This test makes real LLM API calls and takes 30-120 seconds.
        Skip in CI without API keys (SKIP_LIVE_API_TESTS=true).
        """
        if os.getenv("SKIP_LIVE_API_TESTS", "").lower() == "true":
            self.skipTest("Skipping live API test (SKIP_LIVE_API_TESTS=true)")

        from tests.demo_data import DEMO_INPUT

        # Use minimal input for speed
        test_input = {
            **DEMO_INPUT,
            "agent_name": "E2E Test Agent",
            "conversations": DEMO_INPUT["conversations"][:2],
            "experts": [{"llm": "claude", "enabled": True}],
            "frameworks": ["owasp"],
        }

        print(f"\n  Submitting e2e evaluation...")
        submit_resp = requests.post(f"{BASE_URL}/api/evaluate", json=test_input)
        self.assertEqual(submit_resp.status_code, 202)
        eval_id = submit_resp.json()["eval_id"]
        print(f"  Eval ID: {eval_id}")

        # Poll until complete
        final_status = wait_for_completion(eval_id, timeout=300)
        self.assertEqual(final_status["status"], "complete")

        # Fetch full result
        result_resp = requests.get(f"{BASE_URL}/api/evaluate/{eval_id}")
        self.assertEqual(result_resp.status_code, 200)
        result = result_resp.json()

        # Validate result structure
        self.assertIn("eval_id", result)
        self.assertIn("agent_name", result)
        self.assertIn("timestamp", result)
        self.assertIn("verdict", result)
        self.assertIn("expert_assessments", result)
        self.assertIn("debate_transcript", result)
        self.assertIn("mitigations", result)
        self.assertIn("audit", result)

        verdict = result["verdict"]
        self.assertIn("final_verdict", verdict)
        self.assertIn(verdict["final_verdict"], ["APPROVE", "REVIEW", "REJECT"])
        self.assertIn("confidence", verdict)
        self.assertIn("agreement_rate", verdict)

        assessments = result["expert_assessments"]
        self.assertGreater(len(assessments), 0)
        for assessment in assessments:
            self.assertIn("expert_name", assessment)
            self.assertIn("overall_score", assessment)
            self.assertIn("verdict", assessment)
            self.assertIn("dimension_scores", assessment)
            self.assertGreaterEqual(len(assessment["dimension_scores"]), 15)

        audit = result["audit"]
        self.assertIn("total_api_calls", audit)
        self.assertIn("total_tokens_used", audit)
        self.assertIn("evaluation_time_seconds", audit)

        print(f"\n  ✓ E2E test passed!")
        print(f"  Verdict: {verdict['final_verdict']} (confidence: {verdict['confidence']}%)")
        print(f"  Score: {assessments[0]['overall_score']}/100")
        print(f"  Time: {audit['evaluation_time_seconds']}s")
        print(f"  Cost: ${audit.get('total_cost_usd', 0):.4f}")


class TestEvaluationsList(unittest.TestCase):
    """Test GET /api/evaluations"""

    def test_list_returns_200(self):
        resp = requests.get(f"{BASE_URL}/api/evaluations")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("evaluations", data)
        self.assertIsInstance(data["evaluations"], list)


if __name__ == "__main__":
    print(f"Running SafeCouncil API tests against: {BASE_URL}")
    print("=" * 60)
    unittest.main(verbosity=2)
