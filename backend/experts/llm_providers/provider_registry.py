import logging
import os

from experts.llm_providers.base_provider import LLMProvider
from experts.llm_providers.anthropic_provider import AnthropicProvider
from experts.llm_providers.openai_provider import OpenAIProvider
from experts.llm_providers.google_provider import GoogleProvider
from experts.llm_providers.offline_provider import OfflineProvider

logger = logging.getLogger(__name__)

# Default provider configurations.
# Each entry maps a provider key to its class, env var names, and defaults.
# Env vars are resolved at create() time (not import time) so .env is loaded first.
# Add new providers here — no other code changes needed.
DEFAULT_PROVIDERS = {
    "claude": {
        "class": AnthropicProvider,
        "api_key_env": "ANTHROPIC_API_KEY",
        "model_env": "CLAUDE_MODEL",
        "model_default": "claude-sonnet-4-20250514",
    },
    "gpt4o": {
        "class": OpenAIProvider,
        "api_key_env": "OPENAI_API_KEY",
        "model_env": "OPENAI_MODEL",
        "model_default": "gpt-4o",
    },
    "gemini": {
        "class": GoogleProvider,
        "api_key_env": "GOOGLE_API_KEY",
        "model_env": "GEMINI_MODEL",
        "model_default": "gemini-1.5-pro",
    },
    "local": {
        "class": OpenAIProvider,
        "api_key_env": "LOCAL_API_KEY",
        "model_env": "LOCAL_MODEL",
        "endpoint_env": "LOCAL_ENDPOINT",
    },
    # Deterministic offline provider — powers DEMO_MODE by letting the real
    # orchestrator pipeline run end-to-end without any API keys. Returns
    # dimension-aware, expert-seeded JSON for evaluate/critique/revise/synthesize.
    "offline": {
        "class": OfflineProvider,
        "api_key_env": "",
        "model_default": "offline-deterministic",
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

        # Resolve at call time (not import time) so .env is loaded
        resolved_key = api_key or os.getenv(config.get("api_key_env", "") or "_NO_SUCH_ENV", "") or config.get("default_api_key", "")
        resolved_model = model or os.getenv(config.get("model_env", ""), config.get("model_default", ""))
        resolved_endpoint = endpoint or os.getenv(config.get("endpoint_env", ""), config.get("endpoint_default", ""))

        # Local LLM has no defaults — fail fast with an actionable error if user
        # enabled the local expert without configuring their own endpoint.
        if provider_key == "local":
            missing = []
            if not resolved_endpoint:
                missing.append("LOCAL_ENDPOINT")
            if not resolved_model:
                missing.append("LOCAL_MODEL")
            if missing:
                raise ValueError(
                    f"Local LLM expert is enabled but {', '.join(missing)} is not set. "
                    f"Add it to backend/.env (example: LOCAL_ENDPOINT=http://localhost:1234/v1, "
                    f"LOCAL_MODEL=llama-3.1-8b-instruct) and restart the backend."
                )

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
            model = os.getenv(config.get("model_env", ""), config.get("model_default", ""))
            result[key] = {
                "available": available,
                "model": model,
            }
            if not available:
                result[key]["error"] = "API key not configured"
        return result

    def list_providers(self) -> list:
        """Return list of all registered provider keys."""
        return list(self._providers.keys())
