"""
Regression tests for the custom-dimension pipeline:

  POST /api/governance/upload → extract YAML → save to dimensions/custom/
    → load_all_dimensions() picks it up
    → Expert / OfflineProvider / orchestrator all see it
    → result.expert_assessments[*].dimension_scores contains it

If a grader uploads a governance PDF, reviews the extracted YAML, and saves
it, the custom dimension MUST appear in the next evaluation — including in
demo mode with the offline provider.
"""
import importlib
import json
import os
import time
import uuid
from pathlib import Path

import pytest

CUSTOM_DIR = Path(__file__).resolve().parents[1] / "backend" / "dimensions" / "custom"


@pytest.fixture
def custom_dim_yaml():
    """Write a temporary custom dimension YAML and remove it after the test."""
    CUSTOM_DIR.mkdir(parents=True, exist_ok=True)
    unique = uuid.uuid4().hex[:8]
    fname = f"_pytest_custom_{unique}.yaml"
    path = CUSTOM_DIR / fname
    dim_name = f"Sanctions Screening Coverage {unique}"
    cat_name = "Custom Compliance"
    path.write_text(
        f"""categories:
  - name: "{cat_name}"
    dimensions:
      - id: sanctions_screening_{unique}
        name: "{dim_name}"
        description: "Does the agent screen beneficiaries against OFAC, EU, and UN sanctions lists before disbursing aid?"
""",
        encoding="utf-8",
    )
    yield {"path": path, "dim_name": dim_name, "category": cat_name}
    try:
        path.unlink()
    except FileNotFoundError:
        pass


@pytest.mark.unit
class TestCustomDimensionsLoader:
    def test_load_all_dimensions_includes_custom(self, custom_dim_yaml):
        from dimensions.loader import load_all_dimensions
        dims = load_all_dimensions(include_custom=True)
        names = {d.name for d in dims}
        assert custom_dim_yaml["dim_name"] in names
        assert len(dims) >= 11  # default 10 + the custom one

    def test_load_all_dimensions_excludes_custom_when_disabled(self, custom_dim_yaml):
        from dimensions.loader import load_all_dimensions
        dims = load_all_dimensions(include_custom=False)
        assert all(d.name != custom_dim_yaml["dim_name"] for d in dims)


@pytest.mark.unit
class TestOfflineProviderPicksUpCustomDimensions:
    def test_offline_provider_scores_custom_dimension(self, custom_dim_yaml):
        """OfflineProvider must score every dimension in load_all_dimensions(), not a hardcoded list."""
        from experts.llm_providers.offline_provider import OfflineProvider
        p = OfflineProvider()
        p.bound_expert_name = "Expert A (Claude-simulation)"
        p.simulated_provider = "claude"
        resp = p.call("## EVALUATION RUBRIC", "**Agent Name:** TestAgent\n\nConversations...")
        data = json.loads(resp.text)
        names = {d["dimension"] for d in data["dimension_scores"]}
        assert custom_dim_yaml["dim_name"] in names, (
            f"OfflineProvider did not score custom dimension. Saw: {names}"
        )
        # All three simulated seats should still produce a score for it
        seats = [
            ("Expert A (Claude-simulation)", "claude"),
            ("Expert B (GPT-4o-simulation)", "gpt4o"),
            ("Expert C (Gemini-simulation)", "gemini"),
        ]
        for name, sim in seats:
            p = OfflineProvider()
            p.bound_expert_name = name
            p.simulated_provider = sim
            resp = p.call("## EVALUATION RUBRIC", "**Agent Name:** TestAgent\n\nConversations...")
            data = json.loads(resp.text)
            names = {d["dimension"] for d in data["dimension_scores"]}
            assert custom_dim_yaml["dim_name"] in names


@pytest.mark.unit
class TestCustomDimensionEndToEndInDemoMode:
    def _reload_demo(self):
        os.environ["ANTHROPIC_API_KEY"] = ""
        os.environ["OPENAI_API_KEY"] = ""
        os.environ["GOOGLE_API_KEY"] = ""
        os.environ["DEMO_MODE"] = "true"
        import config
        importlib.reload(config)

    def test_custom_dimension_appears_in_demo_evaluation_result(self, custom_dim_yaml):
        """Full pipeline: custom YAML → SimpleOrchestrator (demo mode) → result."""
        self._reload_demo()
        from services.evaluation_service import EvaluationService
        from models.schemas import EvaluationInput

        svc = EvaluationService()
        inp = EvaluationInput.from_dict({
            "agent_name": "CustomDimensionTestAgent",
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
        assert result["audit"]["demo_mode"] is True

        # Each of the three experts must have scored the custom dimension
        for i, assessment in enumerate(result["expert_assessments"]):
            dim_names = {d["dimension"] for d in assessment["dimension_scores"]}
            assert custom_dim_yaml["dim_name"] in dim_names, (
                f"Expert {i+1} missed the custom dimension. Got: {dim_names}"
            )

    def test_dimension_count_increases_when_custom_added(self, custom_dim_yaml):
        """Regression: adding a custom YAML increases the dimension count in results by 1."""
        self._reload_demo()
        from services.evaluation_service import EvaluationService
        from models.schemas import EvaluationInput

        svc = EvaluationService()
        inp = EvaluationInput.from_dict({
            "agent_name": "CountTest",
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
        for assessment in result["expert_assessments"]:
            assert len(assessment["dimension_scores"]) == 11
