import logging
import time
from typing import List, TYPE_CHECKING

import anthropic

from experts.base_expert import BaseExpert
from models.schemas import (
    ExpertAssessment,
    DimensionScore,
    Finding,
    Severity,
    Verdict,
)
from prompts.evaluation_rubric import build_evaluation_prompt
from prompts.critique_prompt import build_critique_prompt
from prompts.synthesis_prompt import build_synthesis_prompt

if TYPE_CHECKING:
    from models.schemas import EvaluationInput

logger = logging.getLogger(__name__)


class ClaudeExpert(BaseExpert):
    """
    Expert A — Anthropic Claude.
    Uses the Anthropic Messages API.
    """

    def __init__(self, name: str, api_key: str, model: str):
        super().__init__(name=name, llm_provider="claude", api_key=api_key)
        self.model = model
        self.client = anthropic.Anthropic(api_key=api_key)

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """Call Anthropic Claude API."""
        start = time.time()
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            latency = time.time() - start
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            self._track_call(input_tokens, output_tokens, latency)
            return response.content[0].text
        except anthropic.APIError as e:
            logger.error(f"[{self.name}] Anthropic API error: {e}")
            raise
        except Exception as e:
            logger.error(f"[{self.name}] Unexpected error calling Claude: {e}")
            raise

    def evaluate(
        self, eval_input: "EvaluationInput", governance_context: str
    ) -> ExpertAssessment:
        """Run full 15-dimension evaluation."""
        logger.info(f"[{self.name}] Starting evaluation of '{eval_input.agent_name}'")

        system_prompt, user_message = build_evaluation_prompt(
            eval_input, governance_context
        )

        raw_response = self._call_llm(system_prompt, user_message)
        logger.debug(f"[{self.name}] Raw evaluation response length: {len(raw_response)}")

        data = self._parse_evaluation_response(raw_response)

        # Parse dimension scores
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

        # Parse findings
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

        # Parse verdict
        verdict_str = data.get("verdict", "CONDITIONAL").upper()
        if verdict_str == "NO-GO":
            verdict = Verdict.NO_GO
        elif verdict_str == "GO":
            verdict = Verdict.GO
        else:
            verdict = Verdict.CONDITIONAL

        assessment = ExpertAssessment(
            expert_name=self.name,
            llm_provider="claude",
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
