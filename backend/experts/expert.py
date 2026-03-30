"""
Expert — single provider-agnostic expert class.
Takes any LLMProvider and uses it for evaluate/critique/synthesize.
Replaces the need for separate ClaudeExpert, OpenAIExpert, GeminiExpert classes.
"""
import logging
from typing import List, TYPE_CHECKING

from experts.base_expert import BaseExpert
from experts.llm_providers.base_provider import LLMProvider
from models.schemas import (
    ExpertAssessment,
    DimensionScore,
    Finding,
    Severity,
    Verdict,
)
from prompts.prompt_builder import build_evaluation_prompt
from prompts.critique_prompt import build_critique_prompt
from prompts.synthesis_prompt import build_synthesis_prompt

if TYPE_CHECKING:
    from models.schemas import EvaluationInput
    from dimensions.loader import DimensionDef

logger = logging.getLogger(__name__)


class Expert(BaseExpert):
    """
    Provider-agnostic expert. Works with any LLMProvider (Claude, GPT-4o, Gemini, local LLM).
    All experts share the same evaluation logic — only the underlying LLM differs.
    """

    def __init__(self, name: str, provider: LLMProvider, dimensions: List["DimensionDef"] = None):
        super().__init__(name=name, llm_provider=provider.provider_name, api_key="")
        self.provider = provider
        self.dimensions = dimensions  # If None, will be loaded at eval time

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """Delegate to the provider."""
        response = self.provider.call(system_prompt, user_message)
        self._track_call(response.input_tokens, response.output_tokens, response.latency)
        return response.text

    def evaluate(self, eval_input: "EvaluationInput", governance_context: str) -> ExpertAssessment:
        """Run full evaluation using dimensions from YAML."""
        logger.info(f"[{self.name}] Starting evaluation of '{eval_input.agent_name}'")

        system_prompt, user_message = build_evaluation_prompt(
            eval_input, governance_context, self.dimensions
        )

        raw_response = self._call_llm(system_prompt, user_message)
        logger.debug(f"[{self.name}] Raw evaluation response length: {len(raw_response)}")

        data = self._parse_evaluation_response(raw_response)

        dimension_scores = []
        for ds in data.get("dimension_scores", []):
            dimension_scores.append(
                DimensionScore(
                    dimension=ds.get("dimension", "Unknown"),
                    category=ds.get("category", "Unknown"),
                    score=int(ds.get("score", 50)),
                    detail=ds.get("detail", ""),
                )
            )

        findings = []
        for f in data.get("findings", []):
            severity_str = f.get("severity", "MEDIUM").upper()
            try:
                severity = Severity[severity_str]
            except KeyError:
                severity = Severity.MEDIUM
            findings.append(
                Finding(
                    dimension=f.get("dimension", "Unknown"),
                    severity=severity,
                    text=f.get("text", ""),
                    evidence=f.get("evidence", ""),
                    framework_ref=f.get("framework_ref"),
                )
            )

        verdict_str = data.get("verdict", "CONDITIONAL").upper()
        if verdict_str == "NO-GO":
            verdict = Verdict.NO_GO
        elif verdict_str == "GO":
            verdict = Verdict.GO
        else:
            verdict = Verdict.CONDITIONAL

        assessment = ExpertAssessment(
            expert_name=self.name,
            llm_provider=self.provider.provider_name,
            overall_score=int(data.get("overall_score", 50)),
            verdict=verdict,
            dimension_scores=dimension_scores,
            findings=findings,
            raw_response=raw_response,
        )

        logger.info(
            f"[{self.name}] Evaluation complete: score={assessment.overall_score}, "
            f"verdict={assessment.verdict.value}"
        )
        return assessment

    def critique(
        self,
        eval_input: "EvaluationInput",
        own_assessment: ExpertAssessment,
        other_assessments: List[ExpertAssessment],
    ) -> str:
        """Critique other experts' assessments."""
        logger.info(f"[{self.name}] Starting cross-critique")

        system_prompt, user_message = build_critique_prompt(
            eval_input, own_assessment, other_assessments
        )

        raw_response = self._call_llm(system_prompt, user_message)
        logger.debug(f"[{self.name}] Raw critique response length: {len(raw_response)}")
        return raw_response

    def synthesize(
        self,
        eval_input: "EvaluationInput",
        assessments: List[ExpertAssessment],
        critiques: List[str],
    ) -> str:
        """Generate synthesis, debate transcript, and final verdict."""
        logger.info(f"[{self.name}] Starting synthesis")

        system_prompt, user_message = build_synthesis_prompt(
            eval_input, assessments, critiques
        )

        raw_response = self._call_llm(system_prompt, user_message)
        logger.debug(f"[{self.name}] Raw synthesis response length: {len(raw_response)}")
        return raw_response
