from abc import ABC, abstractmethod
from typing import List, Optional, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from experts.base_expert import BaseExpert
    from models.schemas import EvaluationInput, CouncilResult


# ── SafeCouncil Arbitration Architecture ─────────────────────────────────
# SafeCouncil synthesizes the final APPROVE/REVIEW/REJECT verdict through an
# explicit multi-agent arbitration process. The system accepts any AI agent
# (including third-party agents like VeriMedia) as dynamic input without
# friction, then evaluates it through the following pipeline:
#
#   1. Each expert independently evaluates the agent across all safety dimensions
#   2. Experts cross-critique each other's assessments
#   3. Experts revise their scores based on peer critiques
#   4. Each expert submits a final position statement with their individual verdict
#   5. A synthesizer generates a structured debate transcript from all expert
#      positions, critiques, and score changes
#   6. The final verdict is computed from the council's collective deliberation
#
# This ensures all three expert modules produce distinct, independent assessments
# and the council synthesis reflects genuine arbitration — not a single opinion.


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
