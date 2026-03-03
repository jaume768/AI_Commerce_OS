from app.llm.provider import LLMProvider
from app.config import settings
import structlog

log = structlog.get_logger(service="agent-service", module="llm.factory")


def create_llm_provider() -> LLMProvider:
    provider = settings.LLM_PROVIDER.lower()

    if provider == "anthropic":
        from app.llm.anthropic_provider import AnthropicProvider
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic")
        log.info("llm_provider_created", provider="anthropic", model=settings.LLM_MODEL)
        return AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            model=settings.LLM_MODEL,
            max_tokens=settings.LLM_MAX_TOKENS,
            temperature=settings.LLM_TEMPERATURE,
        )

    elif provider == "openai":
        from app.llm.openai_provider import OpenAIProvider
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        log.info("llm_provider_created", provider="openai", model=settings.LLM_MODEL)
        return OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            model=settings.LLM_MODEL,
            max_tokens=settings.LLM_MAX_TOKENS,
            temperature=settings.LLM_TEMPERATURE,
        )

    elif provider == "mock":
        from app.llm.mock_provider import MockProvider
        log.info("llm_provider_created", provider="mock")
        return MockProvider(model=settings.LLM_MODEL)

    else:
        raise ValueError(f"Unknown LLM_PROVIDER: {provider}")
