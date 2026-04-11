"""
Unit tests for the OfflineProvider + demo-mode orchestrator integration.

These tests prove that DEMO_MODE actually runs the real SimpleOrchestrator
pipeline (critique → revise → synthesize) offline — no API keys, no
deepcopy shortcut.
"""
import importlib
import json
import os
import time
from unittest.mock import patch

import pytest


DEMO_SEATS = [
    ("Expert A (Claude-simulation)", "claude"),
    ("Expert B (GPT-4o-simulation)", "gpt4o"),
    ("Expert C (Gemini-simulation)", "gemini"),
]


@pytest.mark.unit
class TestOfflineProvider:
    def _provider(self):
        from experts.llm_providers.offline_provider import OfflineProvider
        p = OfflineProvider()
        p.bound_expert_name = DEMO_SEATS[0][0]
        p.simulated_provider = DEMO_SEATS[0][1]
        return p

    def test_provider_returns_valid_json_for_evaluate(self):
        p = self._provider()
        system = "## EVALUATION RUBRIC\n(10 dimensions)"
        user = "**Agent Name:** TestAgent\n\nConversations..."
        resp = p.call(system, user)
        data = json.loads(resp.text)
        assert "overall_score" in data
        assert "verdict" in data
        assert "dimension_scores" in data
        assert len(data["dimension_scores"]) == 10
        assert data["verdict"] in ("APPROVE", "REVIEW", "REJECT")

    def test_provider_returns_text_for_critique(self):
        p = self._provider()
        system = "You are an AI safety expert... reviewing your colleagues' assessments"
        user = "### Expert 2\n..."
        resp = p.call(system, user)
        # Critique returns narrative text, not JSON
        assert isinstance(resp.text, str)
        assert "critique" in resp.text.lower() or "council" in resp.text.lower() or len(resp.text) > 50

    def test_provider_returns_position_json(self):
        p = self._provider()
        system = "You are an AI safety expert on the SafeCouncil. Based on your evaluation and the cross-critique round, provide your final position statement."
        user = "Agent: VeriMedia\nYour verdict: REVIEW"
        resp = p.call(system, user)
        data = json.loads(resp.text)
        assert data["verdict"] in ("APPROVE", "REVIEW", "REJECT")
        assert "statement" in data

    def test_provider_returns_synthesis_json(self):
        p = self._provider()
        system = "You are the SafeCouncil Synthesis Engine."
        user = "**Agent Name:** TestAgent\n\n## ASSESSMENTS\n..."
        resp = p.call(system, user)
        data = json.loads(resp.text)
        for key in ("debate_transcript", "agreements", "disagreements", "mitigations", "final_verdict"):
            assert key in data, f"missing {key} in synthesis output"
        assert len(data["debate_transcript"]) >= 4
        assert data["final_verdict"] in ("APPROVE", "REVIEW", "REJECT")

    def test_three_experts_share_same_framework_pool_but_produce_different_scores(self):
        """
        Per project design: all experts evaluate with the SAME rubric, SAME
        prompts, and the SAME framework pool. Disagreement comes from score
        variance (model-level judgment), not from different lenses.
        """
        from experts.llm_providers.offline_provider import OfflineProvider, _SHARED_FRAMEWORKS
        user = "**Agent Name:** VeriMedia\n\nConversations..."
        results = {}
        for name, sim_key in DEMO_SEATS:
            p = OfflineProvider()
            p.bound_expert_name = name
            p.simulated_provider = sim_key
            resp = p.call("## EVALUATION RUBRIC", user)
            results[name] = json.loads(resp.text)

        # All experts must produce dimension scores and findings.
        for name, _ in DEMO_SEATS:
            assert results[name]["dimension_scores"], f"{name} produced no scores"

        # Per-expert overall scores must differ — that's what gives the
        # critique round something to resolve.
        overalls = {results[name]["overall_score"] for name, _ in DEMO_SEATS}
        assert len(overalls) >= 2, f"Expected score variance across experts, got {overalls}"

        # All framework citations must come from the shared pool; NO
        # framework should be uniquely tied to one expert.
        for name, _ in DEMO_SEATS:
            for f in results[name].get("findings", []):
                assert f["framework_ref"] in _SHARED_FRAMEWORKS

    def test_provider_name_reflects_simulated_provider(self):
        """
        When simulated_provider is bound, provider_name returns the simulated
        label (for UI distinguishability). When unset, it stays "offline".
        """
        from experts.llm_providers.offline_provider import OfflineProvider
        p = OfflineProvider()
        assert p.provider_name == "offline"
        assert p.is_offline is True

        p.simulated_provider = "claude"
        assert p.provider_name == "claude"
        # is_offline is class-identity, not label-based
        assert p.is_offline is True


@pytest.mark.unit
class TestDemoModeRunsRealOrchestrator:
    def _reload_with_demo(self):
        os.environ["ANTHROPIC_API_KEY"] = ""
        os.environ["OPENAI_API_KEY"] = ""
        os.environ["GOOGLE_API_KEY"] = ""
        os.environ["DEMO_MODE"] = "true"
        import config
        importlib.reload(config)

    def test_demo_mode_invokes_simple_orchestrator(self):
        """Proves DEMO_MODE no longer short-circuits with deepcopy of a template."""
        self._reload_with_demo()
        from services.evaluation_service import EvaluationService
        from models.schemas import EvaluationInput
        from orchestrators.simple_orchestrator import SimpleOrchestrator

        svc = EvaluationService()
        inp = EvaluationInput.from_dict({
            "agent_name": "TestAgent",
            "experts": [{"llm": "offline", "enabled": True}],
            "conversations": [{"label": "demo", "prompt": "hi", "output": "hello"}],
            "orchestration_method": "deliberative",
            "frameworks": [],
        })

        with patch.object(SimpleOrchestrator, "run_evaluation", wraps=SimpleOrchestrator.run_evaluation, autospec=True) as spy:
            eid = svc.submit_evaluation(inp)
            deadline = time.time() + 20
            while time.time() < deadline:
                status = svc.get_status(eid)
                if status and status.status.value in ("complete", "failed"):
                    break
                time.sleep(0.1)
            assert spy.called, "DEMO_MODE did not invoke SimpleOrchestrator.run_evaluation"

    def test_demo_mode_produces_real_score_changes(self):
        """Proves the revision round actually ran — score_changes come from orchestrator code, not a template."""
        self._reload_with_demo()
        from services.evaluation_service import EvaluationService
        from models.schemas import EvaluationInput

        svc = EvaluationService()
        inp = EvaluationInput.from_dict({
            "agent_name": "TestAgent",
            "experts": [{"llm": "offline", "enabled": True}],
            "conversations": [{"label": "demo", "prompt": "hi", "output": "hello"}],
            "orchestration_method": "deliberative",
            "frameworks": [],
        })
        eid = svc.submit_evaluation(inp)
        deadline = time.time() + 20
        while time.time() < deadline:
            status = svc.get_status(eid)
            if status and status.status.value in ("complete", "failed"):
                break
            time.sleep(0.1)
        result = svc.get_result(eid)
        assert result is not None
        # Real orchestrator output
        assert len(result["expert_assessments"]) == 3
        assert len(result["debate_transcript"]) >= 4
        total_changes = sum(len(a.get("score_changes", [])) for a in result["expert_assessments"])
        assert total_changes > 0, "expected real score_changes from revision round"
        assert result["audit"]["demo_mode"] is True
        assert result["audit"]["synthesis_fallback"] is False
