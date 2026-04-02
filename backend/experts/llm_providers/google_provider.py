import logging
import time

from google import genai
from google.genai import types

from experts.llm_providers.base_provider import LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class GoogleProvider(LLMProvider):
    """LLM provider for Google Gemini models."""

    def __init__(self, model: str, api_key: str, **kwargs):
        super().__init__(model=model, api_key=api_key)
        self.client = genai.Client(api_key=api_key)

    def call(self, system_prompt: str, user_message: str, max_tokens: int = 8192) -> LLMResponse:
        start = time.time()
        try:
            config = types.GenerateContentConfig(
                response_mime_type="application/json",
                max_output_tokens=max_tokens,
            )
            # Gemini combines system + user in a single message
            combined = f"{system_prompt}\n\n---\n\n{user_message}"
            response = self.client.models.generate_content(
                model=self.model,
                contents=combined,
                config=config,
            )
            latency = time.time() - start

            input_tokens = 0
            output_tokens = 0
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                input_tokens = getattr(response.usage_metadata, "prompt_token_count", 0) or 0
                output_tokens = getattr(response.usage_metadata, "candidates_token_count", 0) or 0

            result = LLMResponse(
                text=response.text,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency=latency,
            )
            self._track(result)
            return result
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise

    @property
    def provider_name(self) -> str:
        return "gemini"
