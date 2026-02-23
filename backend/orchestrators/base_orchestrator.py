from abc import ABC, abstractmethod
from typing import List, Optional, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from experts.base_expert import BaseExpert
    from models.schemas import EvaluationInput, CouncilResult


class BaseOrchestrator(ABC):
    """
    Abstract base class for evaluation orchestrators.

    Orchestrators define HOW the evaluation pipeline is executed:
    - Sequential (SimpleOrchestrator): one expert at a time
    - Parallel (future): all experts simultaneously
    - Debate-first (future): debate before synthesis
    - Weighted (future): different weight per expert

    Orchestrators do NOT know about job queues, HTTP, or progress tracking.
    They accept an on_progress callback for the EvaluationService to hook into.
    """

    def __init__(self, experts: List["BaseExpert"]):
        self.experts = experts

    @abstractmethod
    def run_evaluation(
        self,
        input: "EvaluationInput",
        on_progress: Optional[Callable] = None,
    ) -> "CouncilResult":
        """
        Execute the full evaluation pipeline.

        Args:
            input: The evaluation input containing agent details and conversations.
            on_progress: Optional callback for progress reporting.
                         Signature: on_progress(step_index: int, status: str,
                                                message: str, progress_pct: int)

        Returns:
            CouncilResult with all expert assessments, debate, and final verdict.
        """
        pass

    def _fire_progress(
        self,
        on_progress: Optional[Callable],
        step_index: int,
        status: str,
        message: str,
        progress_pct: int,
    ):
        """Safely invoke the progress callback if provided."""
        if on_progress is not None:
            try:
                on_progress(step_index, status, message, progress_pct)
            except Exception:
                pass  # Never let progress callback crash the evaluation
