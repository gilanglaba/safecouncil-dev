import logging
import time

import google.generativeai as genai
from google.generativeai.types import GenerationConfig

from experts.llm_providers.base_provider import LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class GoogleProvider(LLMProvider):
    """LLM provider for Google Gemini models."""

    def __init__(self, model: str, api_key: str, **kwargs):
        super().__init__(model=model, api_key=api_key)
        genai.configure(api_key=api_key)
        self.generation_config = GenerationConfig(
            response_mime_type="application/json",
            max_output_tokens=4096,
        )

    def call(self, system_prompt: str, user_message: str, max_tokens: int = 4096) -> LLMResponse:
        start = time.time()
        try:
            config = GenerationConfig(
                response_mime_type="application/json",
                max_output_tokens=max_tokens,
            )
            model = genai.GenerativeModel(
                model_name=self.model,
                generation_config=config,
            )
            # Gemini combines system + user in a single message
            combined = f"{system_prompt}\n\n---\n\n{user_message}"
            response = model.generate_content(combined)
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
