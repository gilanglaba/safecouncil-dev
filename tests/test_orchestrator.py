"""
Integration tests for the full orchestration pipeline.
Tests the complete evaluation flow: governance → experts → critique → synthesis.

Usage:
    cd backend
    python -m pytest ../tests/test_orchestrator.py -v

NOTE: This runs the full pipeline and makes multiple LLM API calls.
Expect 1-3 minutes per test depending on number of experts enabled.
"""
import sys
import os
import unittest

# Allow imports from backend/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from config import Config
from models.schemas import EvaluationInput, CouncilResult, Verdict
from governance.frameworks import get_governance_context

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from demo_data import DEMO_INPUT


def build_available_experts() -> list:
    """Build list of expert instances for all configured API keys."""
    experts = []

    if Config.ANTHROPIC_API_KEY:
        from experts.claude_expert import ClaudeExpert
        experts.append(ClaudeExpert(Config.EXPERT_A_NAME, Config.ANTHROPIC_API_KEY, Config.CLAUDE_MODEL))

    if Config.OPENAI_API_KEY:
        from experts.openai_expert import OpenAIExpert
        experts.append(OpenAIExpert(Config.EXPERT_B_NAME, Config.OPENAI_API_KEY, Config.OPENAI_MODEL))

    if Config.GOOGLE_API_KEY:
        from experts.gemini_expert import GeminiExpert
        experts.append(GeminiExpert(Config.EXPERT_C_NAME, Config.GOOGLE_API_KEY, Config.GEMINI_MODEL))

    return experts


class TestSimpleOrchestrator(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.experts = build_available_experts()
        if not cls.experts:
            raise unittest.SkipTest(
                "No API keys configured. Set at least one of: "
                "ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY"
            )
        print(f"\n  Running orchestrator test with {len(cls.experts)} expert(s): "
              f"{[e.name for e in cls.experts]}")

        cls.eval_input = EvaluationInput.from_dict({
            **DEMO_INPUT,
            "conversations": DEMO_INPUT["conversations"][:2],
            "frameworks": ["owasp"],
        })
        cls.governance_context = get_governance_context(["owasp"])

    def test_orchestrator_returns_council_result(self):
        from orchestrators.simple_orchestrator import SimpleOrchestrator

        orchestrator = SimpleOrchestrator(
            experts=self.experts,
            synthesizer_expert=self.experts[0],
            eval_id="test001",
            agent_name="Test Agent",
        )

        result = orchestrator.run_evaluation(
            eval_input=self.eval_input,
            governance_context=self.governance_context,
        )

        self.assertIsInstance(result, CouncilResult)

    def test_result_has_all_required_fields(self):
        from orchestrators.simple_orchestrator import SimpleOrchestrator

        orchestrator = SimpleOrchestrator(
            experts=self.experts,
            synthesizer_expert=self.experts[0],
            eval_id="test002",
            agent_name="Test Agent",
        )
        result = orchestrator.run_evaluation(
            eval_input=self.eval_input,
            governance_context=self.governance_context,
        )

        self.assertIn(result.final_verdict, list(Verdict))
        self.assertGreaterEqual(result.confidence, 0)
        self.assertLessEqual(result.confidence, 100)
        self.assertGreater(len(result.expert_assessments), 0)
        self.assertGreater(result.evaluation_time_seconds, 0)

    def test_result_serializes_to_dict(self):
        from orchestrators.simple_orchestrator import SimpleOrchestrator

        orchestrator = SimpleOrchestrator(
            experts=self.experts,
            synthesizer_expert=self.experts[0],
            eval_id="test003",
            agent_name="Test Agent",
        )
        result = orchestrator.run_evaluation(
            eval_input=self.eval_input,
            governance_context=self.governance_context,
        )

        d = result.to_dict()
        self.assertIsInstance(d, dict)
        self.assertIn("eval_id", d)
        self.assertIn("verdict", d)
        self.assertIn("expert_assessments", d)
        self.assertIn("audit", d)

    def test_progress_callback_called(self):
        from orchestrators.simple_orchestrator import SimpleOrchestrator

        progress_calls = []

        def on_progress(step_index, status, message, progress_pct):
            progress_calls.append({
                "step_index": step_index,
                "status": status,
                "message": message,
                "progress": progress_pct,
            })

        orchestrator = SimpleOrchestrator(
            experts=self.experts,
            synthesizer_expert=self.experts[0],
            eval_id="test004",
            agent_name="Test Agent",
        )
        orchestrator.run_evaluation(
            eval_input=self.eval_input,
            governance_context=self.governance_context,
            on_progress=on_progress,
        )

        self.assertGreater(len(progress_calls), 0, "Progress callback was never called")
        # Final progress should be 100
        final = progress_calls[-1]
        self.assertEqual(final["progress"], 100)
        print(f"\n  Progress callback was called {len(progress_calls)} times")

    def test_audit_metrics_populated(self):
        from orchestrators.simple_orchestrator import SimpleOrchestrator

        orchestrator = SimpleOrchestrator(
            experts=self.experts,
            synthesizer_expert=self.experts[0],
            eval_id="test005",
            agent_name="Test Agent",
        )
        result = orchestrator.run_evaluation(
            eval_input=self.eval_input,
            governance_context=self.governance_context,
        )

        self.assertGreater(result.total_api_calls, 0)
        # Token usage: at minimum the evaluation calls (may be 0 for Gemini if usage not available)
        print(f"\n  API calls: {result.total_api_calls}")
        print(f"  Total tokens: {result.total_tokens_used}")
        print(f"  Estimated cost: ${result.total_cost_usd:.4f}")
        print(f"  Time: {result.evaluation_time_seconds:.1f}s")


if __name__ == "__main__":
    unittest.main(verbosity=2)
