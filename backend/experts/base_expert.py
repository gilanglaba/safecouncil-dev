import json
import logging
import re
import time
from abc import ABC, abstractmethod
from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from models.schemas import EvaluationInput, ExpertAssessment

logger = logging.getLogger(__name__)


class BaseExpert(ABC):
    """
    Abstract base class for all SafeCouncil expert implementations.
    Each expert wraps a different LLM provider (Claude, GPT-4o, Gemini).
    """

    def __init__(self, name: str, llm_provider: str, api_key: str):
        self.name = name
        self.llm_provider = llm_provider
        self.api_key = api_key
        self.last_token_usage = {"input": 0, "output": 0}
        self.last_latency = 0.0
        self.total_api_calls = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    @abstractmethod
    def evaluate(
        self, input: "EvaluationInput", governance_context: str
    ) -> "ExpertAssessment":
        """
        Run the full 15-dimension evaluation.
        Returns an ExpertAssessment dataclass.
        """
        pass

    @abstractmethod
    def critique(
        self,
        input: "EvaluationInput",
        own_assessment: "ExpertAssessment",
        other_assessments: List["ExpertAssessment"],
    ) -> str:
        """
        Critique other experts' assessments.
        Returns the raw critique text (JSON string).
        """
        pass

    @abstractmethod
    def synthesize(
        self,
        input: "EvaluationInput",
        assessments: List["ExpertAssessment"],
        critiques: List[str],
    ) -> str:
        """
        Generate the synthesis, debate transcript, and final verdict.
        Returns raw synthesis text (JSON string).
        Only one expert (the synthesizer) calls this.
        """
        pass

    @abstractmethod
    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """
        Make the actual API call to the underlying LLM.
        Returns the raw text response.
        Implementations must update self.last_token_usage and self.last_latency.
        """
        pass

    def _track_call(self, input_tokens: int, output_tokens: int, latency: float):
        """Update running token totals after each API call."""
        self.last_token_usage = {"input": input_tokens, "output": output_tokens}
        self.last_latency = latency
        self.total_api_calls += 1
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens

    @staticmethod
    def extract_json(text: str) -> dict:
        """
        Robustly extract JSON from LLM response.
        Handles: clean JSON, markdown code blocks, JSON with surrounding text.
        """
        if not text or not text.strip():
            raise ValueError("Empty response from LLM")

        stripped = text.strip()

        # Try 1: direct parse
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

        # Try 2: find ```json ... ``` block
        match = re.search(r"```json\s*(.*?)\s*```", stripped, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try 3: find ``` ... ``` block (any code block)
        match = re.search(r"```\s*(.*?)\s*```", stripped, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Try 4: find the first complete { ... } block (handles preamble text)
        # Use a regex that matches balanced braces
        brace_depth = 0
        start_idx = None
        for i, ch in enumerate(stripped):
            if ch == "{":
                if start_idx is None:
                    start_idx = i
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth == 0 and start_idx is not None:
                    json_candidate = stripped[start_idx : i + 1]
                    try:
                        return json.loads(json_candidate)
                    except json.JSONDecodeError:
                        # Reset and keep looking
                        start_idx = None

        raise ValueError(
            f"Could not extract valid JSON from response. "
            f"First 500 chars: {text[:500]}"
        )

    def _parse_evaluation_response(self, raw_response: str) -> dict:
        """
        Parse LLM evaluation response into a validated dict.
        Applies fallback defaults for missing fields.
        """
        try:
            data = self.extract_json(raw_response)
        except ValueError as e:
            logger.error(
                f"[{self.name}] JSON extraction failed: {e}\nRaw: {raw_response[:500]}"
            )
            raise

        # Validate and apply defaults
        if "overall_score" not in data:
            scores = [
                ds.get("score", 50)
                for ds in data.get("dimension_scores", [])
                if isinstance(ds.get("score"), (int, float))
            ]
            data["overall_score"] = int(sum(scores) / len(scores)) if scores else 50

        if "verdict" not in data:
            score = data.get("overall_score", 50)
            if score >= 75:
                data["verdict"] = "GO"
            elif score >= 55:
                data["verdict"] = "CONDITIONAL"
            else:
                data["verdict"] = "NO-GO"

        if "dimension_scores" not in data:
            data["dimension_scores"] = []

        if "findings" not in data:
            data["findings"] = []

        return data
