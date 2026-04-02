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
from prompts.revision_prompt import build_revision_prompt

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
        self.is_local = provider.provider_name == "local"

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """Delegate to the provider."""
        response = self.provider.call(system_prompt, user_message)
        self._track_call(response.input_tokens, response.output_tokens, response.latency)
        return response.text

    def _call_with_retry(self, system_prompt: str, user_message: str, parse_fn, max_retries: int = 1):
        """Call LLM and parse response, retrying on JSON parse failure."""
        last_error = None
        for attempt in range(1 + max_retries):
            raw_response = self._call_llm(system_prompt, user_message)
            try:
                return raw_response, parse_fn(raw_response)
            except (ValueError, KeyError) as e:
                last_error = e
                if attempt < max_retries:
                    logger.warning(f"[{self.name}] JSON parse failed (attempt {attempt + 1}), retrying: {e}")
                else:
                    logger.error(f"[{self.name}] JSON parse failed after {1 + max_retries} attempts: {e}")
        raise last_error

    def evaluate(self, eval_input: "EvaluationInput", governance_context: str) -> ExpertAssessment:
        """Run full evaluation using dimensions from YAML."""
        logger.info(f"[{self.name}] Starting evaluation of '{eval_input.agent_name}'"
                     + (" (compact prompt for local LLM)" if self.is_local else ""))

        system_prompt, user_message = build_evaluation_prompt(
            eval_input, governance_context, self.dimensions, compact=self.is_local
        )

        raw_response, data = self._call_with_retry(system_prompt, user_message, self._parse_evaluation_response)

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
                    conversation_index=f.get("conversation_index"),
                )
            )

        verdict_str = data.get("verdict", "REVIEW").upper()
        try:
            verdict = Verdict[verdict_str]
        except KeyError:
            verdict = Verdict.REVIEW

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

    def revise(
        self,
        eval_input: "EvaluationInput",
        own_assessment: ExpertAssessment,
        critiques: List[str],
    ) -> ExpertAssessment:
        """Revise scores after receiving cross-critiques. Returns updated assessment."""
        logger.info(f"[{self.name}] Starting score revision")

        system_prompt, user_message = build_revision_prompt(
            eval_input, own_assessment, critiques
        )

        raw_response, data = self._call_with_retry(system_prompt, user_message, self._parse_evaluation_response)

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
                    conversation_index=f.get("conversation_index"),
                )
            )

        verdict_str = data.get("verdict", "REVIEW").upper()
        try:
            verdict = Verdict[verdict_str]
        except KeyError:
            verdict = Verdict.REVIEW

        revised = ExpertAssessment(
            expert_name=own_assessment.expert_name,
            llm_provider=own_assessment.llm_provider,
            overall_score=int(data.get("overall_score", own_assessment.overall_score)),
            verdict=verdict,
            dimension_scores=dimension_scores if dimension_scores else own_assessment.dimension_scores,
            findings=findings if findings else own_assessment.findings,
            raw_response=raw_response,
            initial_overall_score=own_assessment.overall_score,
            initial_dimension_scores=own_assessment.dimension_scores,
            revision_rationale=data.get("revision_rationale", ""),
            score_changes=data.get("score_changes", []),
        )

        logger.info(
            f"[{self.name}] Revision complete: {own_assessment.overall_score} → {revised.overall_score}"
        )
        return revised

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
        position_statements: List[dict] = None,
    ) -> str:
        """Generate synthesis, debate transcript, and final verdict."""
        logger.info(f"[{self.name}] Starting synthesis")

        system_prompt, user_message = build_synthesis_prompt(
            eval_input, assessments, critiques, position_statements
        )

        raw_response = self._call_llm(system_prompt, user_message)
        logger.debug(f"[{self.name}] Raw synthesis response length: {len(raw_response)}")
        return raw_response
