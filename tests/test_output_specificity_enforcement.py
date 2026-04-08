"""
Regression tests for the output-specificity enforcer.

The professor flagged a runtime risk: in live (non-demo) mode, output quality
depends entirely on LLM behavior. _validate_output_specificity() only logs a
warning. If the LLM returns generic boilerplate with no agent-specific
references, the final report is not grounded in the agent under evaluation.

_enforce_output_specificity() is the deterministic post-processor that
guarantees every finding, evidence field, dimension detail, and debate
message references the actual agent — patching in architectural facts from
eval_input.environment when the LLM leaves them blank.
"""
import pytest

from orchestrators.simple_orchestrator import SimpleOrchestrator
from models.schemas import (
    Conversation,
    DimensionScore,
    EvaluationInput,
    ExpertAssessment,
    ExpertConfig,
    Finding,
    Severity,
    Verdict,
    DebateMessage,
)


def _make_eval_input(agent_name="VeriMedia"):
    return EvaluationInput(
        agent_name=agent_name,
        use_case="AI media ethics analyzer",
        system_prompt="You analyze media for bias.",
        conversations=[
            Conversation(label="demo", prompt="Analyze this", output="Analysis result"),
        ],
        environment=(
            "Flask web application.\n\n"
            "Architecture notes (extracted from source code):\n"
            "- Flask /upload route in `app.py` accepts multipart/form-data with no auth middleware\n"
            "- GPT-4o is called via openai.ChatCompletion in `app.py:87`\n"
            "- No rate limiting, no CSRF protection on any POST route\n"
        ),
        data_sensitivity="High",
        frameworks=["eu_ai_act"],
        experts=[ExpertConfig(llm="claude", enabled=True)],
    )


def _make_generic_assessment(expert_name="Expert 1 (claude)"):
    """A simulated LLM response that is maximally generic — no agent ref."""
    return ExpertAssessment(
        expert_name=expert_name,
        llm_provider="claude",
        overall_score=65,
        verdict=Verdict.REVIEW,
        dimension_scores=[
            DimensionScore(dimension="Accountability & Auditability", category="Transparency & Accountability", score=50, detail="The agent has weaknesses in audit trail."),
            DimensionScore(dimension="Human Oversight & Privacy", category="Governance & Compliance", score=55, detail="Gaps observed in oversight."),
        ],
        findings=[
            Finding(dimension="Accountability & Auditability", severity=Severity.HIGH, text="The agent has audit trail gaps.", evidence="No evidence provided.", framework_ref="EU AI Act Art. 12"),
            Finding(dimension="Human Oversight & Privacy", severity=Severity.MEDIUM, text="Missing oversight controls.", evidence="", framework_ref="EU AI Act Art. 14"),
        ],
        raw_response="{}",
    )


@pytest.mark.unit
class TestOutputSpecificityEnforcer:
    def test_enforcer_patches_findings_missing_agent_name(self):
        orc = SimpleOrchestrator(experts=[], eval_id="test", agent_name="VeriMedia")
        eval_input = _make_eval_input()
        assessments = [_make_generic_assessment()]
        debate = []

        stats = orc._enforce_output_specificity("VeriMedia", assessments, debate, eval_input)

        # Both findings should have been patched
        assert stats["findings_text_patched"] == 2
        for f in assessments[0].findings:
            assert "verimedia" in f.text.lower(), f"finding text should reference VeriMedia: {f.text}"

    def test_enforcer_fills_generic_evidence_with_arch_notes(self):
        orc = SimpleOrchestrator(experts=[], eval_id="test", agent_name="VeriMedia")
        eval_input = _make_eval_input()
        assessments = [_make_generic_assessment()]

        stats = orc._enforce_output_specificity("VeriMedia", assessments, [], eval_input)

        assert stats["findings_evidence_patched"] == 2
        # Evidence should now reference the architecture notes from environment
        ev_joined = " ".join(f.evidence for f in assessments[0].findings)
        assert "flask" in ev_joined.lower() or "app.py" in ev_joined.lower(), (
            f"evidence should cite arch notes: {ev_joined}"
        )

    def test_enforcer_patches_dimension_details(self):
        orc = SimpleOrchestrator(experts=[], eval_id="test", agent_name="VeriMedia")
        eval_input = _make_eval_input()
        assessments = [_make_generic_assessment()]

        stats = orc._enforce_output_specificity("VeriMedia", assessments, [], eval_input)

        assert stats["dimension_details_patched"] >= 1
        has_ref = any(
            "verimedia" in (ds.detail or "").lower()
            for ds in assessments[0].dimension_scores
        )
        assert has_ref

    def test_enforcer_patches_debate_transcript(self):
        orc = SimpleOrchestrator(experts=[], eval_id="test", agent_name="VeriMedia")
        eval_input = _make_eval_input()
        debate = [
            DebateMessage(speaker="Expert 1", topic="Audit", message="This is a major concern.", message_type="argument"),
            DebateMessage(speaker="Expert 2", topic="Audit", message="I agree.", message_type="agreement"),
            DebateMessage(speaker="Council", topic="Audit", message="Consensus HIGH.", message_type="resolution"),
        ]

        stats = orc._enforce_output_specificity("VeriMedia", [], debate, eval_input)

        # Argument + resolution messages missing agent name should be patched
        assert stats["debate_messages_patched"] == 2  # argument + resolution
        patched = [m for m in debate if m.message_type in ("argument", "resolution")]
        for m in patched:
            assert "verimedia" in m.message.lower()
        # Agreement message is not touched by the enforcer
        agreement = next(m for m in debate if m.message_type == "agreement")
        assert "i agree" in agreement.message.lower()

    def test_enforcer_is_idempotent_on_already_specific_output(self):
        """A good LLM response should not be rewritten."""
        orc = SimpleOrchestrator(experts=[], eval_id="test", agent_name="VeriMedia")
        eval_input = _make_eval_input()
        assessments = [ExpertAssessment(
            expert_name="Expert 1 (claude)",
            llm_provider="claude",
            overall_score=65,
            verdict=Verdict.REVIEW,
            dimension_scores=[
                DimensionScore(dimension="Accountability & Auditability", category="Transparency & Accountability", score=55, detail="VeriMedia's Flask app has no audit trail."),
            ],
            findings=[
                Finding(
                    dimension="Accountability & Auditability",
                    severity=Severity.HIGH,
                    text="VeriMedia's /upload endpoint has no authentication.",
                    evidence="Architecture review: Flask routes in app.py lack auth middleware; verified via manual code review of the repository.",
                    framework_ref="EU AI Act Art. 12",
                ),
            ],
            raw_response="{}",
        )]

        original_text = assessments[0].findings[0].text
        original_evidence = assessments[0].findings[0].evidence

        stats = orc._enforce_output_specificity("VeriMedia", assessments, [], eval_input)

        assert stats["findings_text_patched"] == 0
        assert stats["findings_evidence_patched"] == 0
        assert assessments[0].findings[0].text == original_text
        assert assessments[0].findings[0].evidence == original_evidence
