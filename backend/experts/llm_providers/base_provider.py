import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """Standard response from any LLM provider."""
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency: float = 0.0


class LLMProvider(ABC):
    """
    Abstract base for all LLM providers.
    Implementations handle provider-specific API calls.
    The Expert class uses this interface — it doesn't know which LLM is behind it.
    """

    def __init__(self, model: str, api_key: str = "", endpoint: str = ""):
        self.model = model
        self.api_key = api_key
        self.endpoint = endpoint
        self.total_api_calls = 0
        self.total_input_tokens = 0
        self.total_output_tokens = 0

    @abstractmethod
    def call(self, system_prompt: str, user_message: str, max_tokens: int = 4096) -> LLMResponse:
        """
        Send a system prompt + user message to the LLM and return the response.
        All providers must implement this single method.
        """
        pass

    def _track(self, response: LLMResponse):
        """Update running totals after each call."""
        self.total_api_calls += 1
        self.total_input_tokens += response.input_tokens
        self.total_output_tokens += response.output_tokens

    def get_usage(self) -> dict:
        """Return cumulative usage stats."""
        return {
            "api_calls": self.total_api_calls,
            "input_tokens": self.total_input_tokens,
            "output_tokens": self.total_output_tokens,
        }

    @property
    def provider_name(self) -> str:
        """Human-readable provider name for logging and display."""
        return self.__class__.__name__.replace("Provider", "").lower()
