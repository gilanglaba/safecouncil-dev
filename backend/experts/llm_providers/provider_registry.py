import logging
import os

from experts.llm_providers.base_provider import LLMProvider
from experts.llm_providers.anthropic_provider import AnthropicProvider
from experts.llm_providers.openai_provider import OpenAIProvider
from experts.llm_providers.google_provider import GoogleProvider

logger = logging.getLogger(__name__)

# Default provider configurations.
# Each entry maps a provider key to its class, env var for API key, and default model.
# Add new providers here — no other code changes needed.
DEFAULT_PROVIDERS = {
    "claude": {
        "class": AnthropicProvider,
        "api_key_env": "ANTHROPIC_API_KEY",
        "default_model": os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514"),
    },
    "gpt4o": {
        "class": OpenAIProvider,
        "api_key_env": "OPENAI_API_KEY",
        "default_model": os.getenv("OPENAI_MODEL", "gpt-4o"),
    },
    "gemini": {
        "class": GoogleProvider,
        "api_key_env": "GOOGLE_API_KEY",
        "default_model": os.getenv("GEMINI_MODEL", "gemini-1.5-pro"),
    },
    "local": {
        "class": OpenAIProvider,
        "api_key_env": "LOCAL_API_KEY",
        "default_model": os.getenv("LOCAL_MODEL", "local-model"),
        "endpoint": os.getenv("LOCAL_ENDPOINT", "http://localhost:1234/v1"),
        "default_api_key": "lm-studio",
    },
}


class ProviderRegistry:
    """
    Registry for LLM providers.
    Creates provider instances by name using config from environment variables.

    Usage:
        registry = ProviderRegistry()
        provider = registry.create("claude")           # Uses env config
        provider = registry.create("local")            # LM Studio at localhost:1234
        provider = registry.create("gpt4o", api_key="sk-...")  # Custom key
    """

    def __init__(self, providers: dict = None):
        self._providers = providers or DEFAULT_PROVIDERS

    def create(self, provider_key: str, api_key: str = "", model: str = "", endpoint: str = "") -> LLMProvider:
        """
        Create a provider instance by key.
        Falls back to env vars for api_key and default model if not provided.
        """
        if provider_key not in self._providers:
            available = ", ".join(self._providers.keys())
            raise ValueError(f"Unknown provider '{provider_key}'. Available: {available}")

        config = self._providers[provider_key]
        provider_class = config["class"]

        # Resolve API key: explicit param > env var > default
        resolved_key = api_key or os.getenv(config["api_key_env"], "") or config.get("default_api_key", "")
        resolved_model = model or config["default_model"]
        resolved_endpoint = endpoint or config.get("endpoint", "")

        kwargs = {
            "model": resolved_model,
            "api_key": resolved_key,
        }
        if resolved_endpoint:
            kwargs["endpoint"] = resolved_endpoint

        logger.info(f"Creating provider '{provider_key}': model={resolved_model}, endpoint={resolved_endpoint or 'default'}")
        return provider_class(**kwargs)

    def is_available(self, provider_key: str) -> bool:
        """Check if a provider has its API key configured."""
        if provider_key not in self._providers:
            return False
        config = self._providers[provider_key]
        key = os.getenv(config["api_key_env"], "") or config.get("default_api_key", "")
        return bool(key)

    def list_available(self) -> dict:
        """Return availability and model info for all registered providers."""
        result = {}
        for key, config in self._providers.items():
            available = self.is_available(key)
            result[key] = {
                "available": available,
                "model": config["default_model"],
            }
            if not available:
                result[key]["error"] = "API key not configured"
        return result

    def list_providers(self) -> list:
        """Return list of all registered provider keys."""
        return list(self._providers.keys())
