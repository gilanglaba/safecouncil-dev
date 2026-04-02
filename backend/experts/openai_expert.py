import logging
import time
from typing import List, TYPE_CHECKING

from openai import OpenAI, APIError

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


class OpenAIExpert(BaseExpert):
    """
    Expert B — OpenAI GPT-4o.
    Uses the OpenAI Chat Completions API with JSON mode.
    """

    def __init__(self, name: str, api_key: str, model: str):
        super().__init__(name=name, llm_provider="gpt4o", api_key=api_key)
        self.model = model
        self.client = OpenAI(api_key=api_key)

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """Call OpenAI API with JSON response format."""
        start = time.time()
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                response_format={"type": "json_object"},
                max_tokens=4096,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            )
            latency = time.time() - start
            usage = response.usage
            input_tokens = usage.prompt_tokens if usage else 0
            output_tokens = usage.completion_tokens if usage else 0
            self._track_call(input_tokens, output_tokens, latency)
            return response.choices[0].message.content or ""
        except APIError as e:
            logger.error(f"[{self.name}] OpenAI API error: {e}")
            raise
        except Exception as e:
            logger.error(f"[{self.name}] Unexpected error calling GPT-4o: {e}")
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
        verdict_str = data.get("verdict", "REVIEW").upper()
        try:
            verdict = Verdict[verdict_str]
        except KeyError:
            verdict = Verdict.REVIEW

        assessment = ExpertAssessment(
            expert_name=self.name,
            llm_provider="gpt4o",
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
