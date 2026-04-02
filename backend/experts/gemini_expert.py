import logging
import time
from typing import List, TYPE_CHECKING

import google.generativeai as genai
from google.generativeai.types import GenerationConfig

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


class GeminiExpert(BaseExpert):
    """
    Expert C — Google Gemini.
    Uses the Google Generative AI SDK with JSON response mode.
    """

    def __init__(self, name: str, api_key: str, model: str):
        super().__init__(name=name, llm_provider="gemini", api_key=api_key)
        self.model_name = model
        genai.configure(api_key=api_key)
        self.generation_config = GenerationConfig(
            response_mime_type="application/json",
            max_output_tokens=4096,
        )

    def _get_model(self):
        """Get a configured Gemini model instance."""
        return genai.GenerativeModel(
            model_name=self.model_name,
            generation_config=self.generation_config,
        )

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """Call Google Gemini API."""
        start = time.time()
        try:
            model = self._get_model()
            # Gemini combines system + user prompt in a single message
            combined_prompt = f"{system_prompt}\n\n---\n\n{user_message}"
            response = model.generate_content(combined_prompt)
            latency = time.time() - start

            # Track token usage if available
            input_tokens = 0
            output_tokens = 0
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                input_tokens = getattr(
                    response.usage_metadata, "prompt_token_count", 0
                ) or 0
                output_tokens = getattr(
                    response.usage_metadata, "candidates_token_count", 0
                ) or 0

            self._track_call(input_tokens, output_tokens, latency)

            if response.text:
                return response.text
            # Fallback: extract text from parts
            for part in response.parts:
                if hasattr(part, "text") and part.text:
                    return part.text
            raise ValueError("Gemini returned empty response")

        except Exception as e:
            logger.error(f"[{self.name}] Gemini API error: {e}")
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
            llm_provider="gemini",
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
