import logging
import time

import anthropic

from experts.llm_providers.base_provider import LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class AnthropicProvider(LLMProvider):
    """LLM provider for Anthropic Claude models."""

    def __init__(self, model: str, api_key: str, **kwargs):
        super().__init__(model=model, api_key=api_key)
        self.client = anthropic.Anthropic(api_key=api_key)

    def call(self, system_prompt: str, user_message: str, max_tokens: int = 4096) -> LLMResponse:
        start = time.time()
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
            )
            latency = time.time() - start
            result = LLMResponse(
                text=response.content[0].text,
                input_tokens=response.usage.input_tokens,
                output_tokens=response.usage.output_tokens,
                latency=latency,
            )
            self._track(result)
            return result
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error calling Claude: {e}")
            raise

    @property
    def provider_name(self) -> str:
        return "claude"
