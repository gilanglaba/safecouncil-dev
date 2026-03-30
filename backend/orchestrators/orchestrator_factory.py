"""
OrchestratorFactory — creates orchestrator instances by strategy name.
Supports adding new orchestration methods without changing calling code.
"""
import logging
from typing import List

from experts.base_expert import BaseExpert
from orchestrators.base_orchestrator import BaseOrchestrator
from orchestrators.simple_orchestrator import SimpleOrchestrator
from orchestrators.aggregate_orchestrator import AggregateOrchestrator

logger = logging.getLogger(__name__)

# Map strategy names to orchestrator classes
ORCHESTRATOR_REGISTRY = {
    "deliberative": SimpleOrchestrator,   # Method B: debate & deliberate (current default)
    "aggregate": AggregateOrchestrator,   # Method A: vote & average
    "simple": SimpleOrchestrator,         # Alias for backward compatibility
}


class OrchestratorFactory:
    """
    Creates orchestrator instances by strategy name.

    Usage:
        orchestrator = OrchestratorFactory.create("aggregate", experts)
        orchestrator = OrchestratorFactory.create("deliberative", experts)
    """

    @staticmethod
    def create(strategy: str, experts: List[BaseExpert]) -> BaseOrchestrator:
        """Create an orchestrator by strategy name."""
        strategy = strategy.lower().strip()

        if strategy not in ORCHESTRATOR_REGISTRY:
            available = ", ".join(ORCHESTRATOR_REGISTRY.keys())
            raise ValueError(f"Unknown orchestrator strategy '{strategy}'. Available: {available}")

        orchestrator_class = ORCHESTRATOR_REGISTRY[strategy]
        logger.info(f"Creating orchestrator: strategy='{strategy}', class={orchestrator_class.__name__}, experts={len(experts)}")
        return orchestrator_class(experts)

    @staticmethod
    def list_strategies() -> list:
        """Return list of available strategy names."""
        return list(ORCHESTRATOR_REGISTRY.keys())
