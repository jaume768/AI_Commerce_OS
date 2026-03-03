from __future__ import annotations
import structlog

from app.llm.provider import LLMProvider, LLMMessage, ToolDefinition, LLMResult

log = structlog.get_logger(service="agent-service", module="llm.mock")


class MockProvider(LLMProvider):
    def __init__(self, model: str = "mock-model"):
        self.model = model

    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
    ) -> LLMResult:
        last_msg = messages[-1] if messages else None
        content = (
            f"[MOCK] Received {len(messages)} messages. "
            f"Last: \"{(last_msg.content[:80] if last_msg else '')}...\""
        )
        if tools:
            content += f" ({len(tools)} tools available)"

        log.info("mock_response", messages=len(messages), tools=len(tools or []))

        return LLMResult(
            content=content,
            tool_calls=[],
            prompt_tokens=10,
            completion_tokens=20,
            total_tokens=30,
            model=self.model,
            stop_reason="end_turn",
        )
