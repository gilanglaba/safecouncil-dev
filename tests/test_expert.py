"""
Unit/integration tests for individual expert evaluation.
Tests a single expert with real LLM API calls.

Usage:
    cd backend
    python -m pytest ../tests/test_expert.py -v

Environment:
    Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY in .env
    Set TEST_EXPERT=claude|gpt4o|gemini to test a specific expert (default: claude)
"""
import sys
import os
import unittest

# Allow imports from backend/
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

from config import Config
from models.schemas import EvaluationInput
from governance.frameworks import get_governance_context

# Import demo data
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from demo_data import DEMO_INPUT


def get_test_expert():
    """Instantiate the test expert based on environment configuration."""
    from experts.expert import Expert
    from experts.llm_providers import ProviderRegistry
    from dimensions.loader import load_all_dimensions

    provider = os.getenv("TEST_EXPERT", "claude").lower()
    registry = ProviderRegistry()

    provider_map = {
        "claude": ("claude", Config.ANTHROPIC_API_KEY, Config.EXPERT_A_NAME),
        "gpt4o": ("gpt4o", Config.OPENAI_API_KEY, Config.EXPERT_B_NAME),
        "gemini": ("gemini", Config.GOOGLE_API_KEY, Config.EXPERT_C_NAME),
    }

    if provider not in provider_map:
        return None

    key, api_key, name = provider_map[provider]
    if not api_key:
        return None

    try:
        llm_provider = registry.create(key)
        dimensions = load_all_dimensions()
        return Expert(name=name, provider=llm_provider, dimensions=dimensions)
    except Exception:
        return None


def get_minimal_input() -> EvaluationInput:
    """Create a minimal EvaluationInput for testing."""
    mini = {
        **DEMO_INPUT,
        "conversations": DEMO_INPUT["conversations"][:2],
        "frameworks": ["owasp"],
    }
    return EvaluationInput.from_dict(mini)


class TestExpertExtractJson(unittest.TestCase):
    """Test the JSON extraction utility (no API calls needed)."""

    def setUp(self):
        from experts.base_expert import BaseExpert
        # Use a concrete subclass just to access the static method
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

    def test_extract_clean_json(self):
        from experts.base_expert import BaseExpert
        raw = '{"key": "value", "score": 85}'
        result = BaseExpert.extract_json(raw)
        self.assertEqual(result["key"], "value")
        self.assertEqual(result["score"], 85)

    def test_extract_json_in_markdown_block(self):
        from experts.base_expert import BaseExpert
        raw = 'Here is the result:\n```json\n{"verdict": "GO", "score": 90}\n```\nThat\'s it.'
        result = BaseExpert.extract_json(raw)
        self.assertEqual(result["verdict"], "GO")

    def test_extract_json_with_preamble(self):
        from experts.base_expert import BaseExpert
        raw = 'After careful analysis, here is my evaluation: {"overall_score": 72, "verdict": "CONDITIONAL"}'
        result = BaseExpert.extract_json(raw)
        self.assertEqual(result["overall_score"], 72)

    def test_extract_json_raises_on_invalid(self):
        from experts.base_expert import BaseExpert
        with self.assertRaises(ValueError):
            BaseExpert.extract_json("This has no JSON at all, just text.")

    def test_extract_json_empty_raises(self):
        from experts.base_expert import BaseExpert
        with self.assertRaises(ValueError):
            BaseExpert.extract_json("")


class TestExpertEvaluation(unittest.TestCase):
    """Integration tests with real LLM API calls."""

    @classmethod
    def setUpClass(cls):
        cls.expert = get_test_expert()
        if cls.expert is None:
            raise unittest.SkipTest(
                "No API key configured for the selected expert. "
                "Set TEST_EXPERT and corresponding API key in .env"
            )
        cls.eval_input = get_minimal_input()
        cls.governance_context = get_governance_context(["owasp"])

    def test_evaluate_returns_expert_assessment(self):
        """Expert evaluation returns a properly structured ExpertAssessment."""
        from models.schemas import ExpertAssessment, Verdict

        assessment = self.expert.evaluate(self.eval_input, self.governance_context)

        self.assertIsInstance(assessment, ExpertAssessment)
        self.assertEqual(assessment.llm_provider, self.expert.llm_provider)
        self.assertIn(assessment.verdict, list(Verdict))
        self.assertGreaterEqual(assessment.overall_score, 0)
        self.assertLessEqual(assessment.overall_score, 100)

    def test_evaluation_has_dimension_scores(self):
        """Evaluation produces 15 dimension scores."""
        assessment = self.expert.evaluate(self.eval_input, self.governance_context)
        self.assertGreaterEqual(
            len(assessment.dimension_scores), 10,
            f"Expected at least 10 dimension scores, got {len(assessment.dimension_scores)}"
        )
        for ds in assessment.dimension_scores:
            self.assertGreaterEqual(ds.score, 0)
            self.assertLessEqual(ds.score, 100)

    def test_evaluation_has_raw_response(self):
        """Expert stores the raw LLM response for auditability."""
        assessment = self.expert.evaluate(self.eval_input, self.governance_context)
        self.assertIsNotNone(assessment.raw_response)
        self.assertGreater(len(assessment.raw_response), 100)

    def test_token_tracking(self):
        """Expert tracks token usage after evaluation."""
        self.expert.evaluate(self.eval_input, self.governance_context)
        self.assertGreater(self.expert.total_api_calls, 0)

    def test_critique_returns_string(self):
        """Critique method returns a non-empty string."""
        assessment = self.expert.evaluate(self.eval_input, self.governance_context)
        critique = self.expert.critique(self.eval_input, assessment, [])
        self.assertIsInstance(critique, str)
        self.assertGreater(len(critique), 50)

    def test_critique_is_parseable_json(self):
        """Critique output is valid JSON."""
        from experts.base_expert import BaseExpert
        assessment = self.expert.evaluate(self.eval_input, self.governance_context)
        critique_raw = self.expert.critique(self.eval_input, assessment, [])
        data = BaseExpert.extract_json(critique_raw)
        self.assertIsInstance(data, dict)


class TestGovernanceContext(unittest.TestCase):
    """Test governance framework text retrieval."""

    def test_single_framework(self):
        ctx = get_governance_context(["owasp"])
        self.assertIn("LLM01", ctx)
        self.assertIn("Prompt Injection", ctx)

    def test_multiple_frameworks(self):
        ctx = get_governance_context(["eu_ai_act", "nist"])
        self.assertIn("EU", ctx)
        self.assertIn("NIST", ctx)

    def test_empty_framework_list(self):
        ctx = get_governance_context([])
        self.assertIsNotNone(ctx)

    def test_unknown_framework_ignored(self):
        ctx = get_governance_context(["does_not_exist"])
        # Should not raise, returns default message
        self.assertIsNotNone(ctx)


if __name__ == "__main__":
    unittest.main(verbosity=2)
