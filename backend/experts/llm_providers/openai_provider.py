import logging
import time

from openai import OpenAI, APIError

from experts.llm_providers.base_provider import LLMProvider, LLMResponse

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """
    LLM provider for OpenAI models and any OpenAI-compatible API.
    Handles: GPT-4o, LM Studio (localhost:1234), Ollama, vLLM, etc.
    """

    def __init__(self, model: str, api_key: str, endpoint: str = "", **kwargs):
        super().__init__(model=model, api_key=api_key, endpoint=endpoint)
        client_kwargs = {"api_key": api_key}
        if endpoint:
            client_kwargs["base_url"] = endpoint
        self.client = OpenAI(**client_kwargs)

    def call(self, system_prompt: str, user_message: str, max_tokens: int = 4096) -> LLMResponse:
        start = time.time()
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            )
            latency = time.time() - start
            usage = response.usage
            result = LLMResponse(
                text=response.choices[0].message.content or "",
                input_tokens=usage.prompt_tokens if usage else 0,
                output_tokens=usage.completion_tokens if usage else 0,
                latency=latency,
            )
            self._track(result)
            return result
        except APIError as e:
            logger.error(f"OpenAI API error: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error calling OpenAI-compatible API: {e}")
            raise

    @property
    def provider_name(self) -> str:
        if self.endpoint and "localhost" in self.endpoint:
            return "local"
        return "openai"
