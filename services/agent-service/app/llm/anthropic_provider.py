from __future__ import annotations
import httpx
import structlog
import asyncio
from typing import Any

from app.llm.provider import LLMProvider, LLMMessage, ToolDefinition, ToolCall, LLMResult

log = structlog.get_logger(service="agent-service", module="llm.anthropic")


class AnthropicProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 4096,
        temperature: float = 0.3,
    ):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.base_url = "https://api.anthropic.com"
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                timeout=300.0,
            )
        return self._client

    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
    ) -> LLMResult:
        system_prompt: str | None = None
        api_messages: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "system":
                system_prompt = msg.content
            elif msg.role == "tool":
                api_messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": msg.tool_call_id or "",
                        "content": msg.content,
                    }],
                })
            elif msg.role == "assistant" and msg.tool_calls:
                blocks: list[dict] = []
                if msg.content:
                    blocks.append({"type": "text", "text": msg.content})
                for tc in msg.tool_calls:
                    blocks.append({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.input,
                    })
                api_messages.append({"role": "assistant", "content": blocks})
            else:
                api_messages.append({"role": msg.role, "content": msg.content})

        body: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": api_messages,
        }
        if system_prompt:
            body["system"] = system_prompt
        if tools:
            body["tools"] = [
                {
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                }
                for t in tools
            ]

        result = await self._request_with_retry(body)
        return result

    async def _request_with_retry(self, body: dict, max_retries: int = 5) -> LLMResult:
        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                client = self._get_client()
                resp = await client.post("/v1/messages", json=body)

                if resp.status_code == 429:
                    retry_after = resp.headers.get("retry-after")
                    delay = int(retry_after) if retry_after and retry_after.isdigit() else min(2 ** attempt * 3, 60)
                    log.warning("anthropic_rate_limited", delay=delay, attempt=attempt)
                    await asyncio.sleep(delay)
                    continue

                resp.raise_for_status()
                data = resp.json()

                text_content = ""
                tool_calls: list[ToolCall] = []

                for block in data.get("content", []):
                    if block["type"] == "text":
                        text_content += block.get("text", "")
                    elif block["type"] == "tool_use":
                        tool_calls.append(ToolCall(
                            id=block["id"],
                            name=block["name"],
                            input=block.get("input", {}),
                        ))

                usage = data.get("usage", {})
                prompt_tokens = usage.get("input_tokens", 0)
                completion_tokens = usage.get("output_tokens", 0)

                log.info(
                    "anthropic_response",
                    model=data.get("model"),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    tool_calls=len(tool_calls),
                    stop_reason=data.get("stop_reason"),
                )

                return LLMResult(
                    content=text_content,
                    tool_calls=tool_calls,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens,
                    model=data.get("model", self.model),
                    stop_reason=data.get("stop_reason", ""),
                )

            except httpx.HTTPStatusError as e:
                last_error = e
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    log.error("anthropic_client_error", status=e.response.status_code, body=e.response.text)
                    raise
                delay = min(2 ** attempt * 2, 30)
                log.warning("anthropic_retry", attempt=attempt, status=e.response.status_code, delay=delay)
                await asyncio.sleep(delay)
            except Exception as e:
                last_error = e
                delay = min(2 ** attempt * 2, 30)
                log.warning("anthropic_retry", attempt=attempt, error=str(e), delay=delay)
                await asyncio.sleep(delay)

        raise last_error or Exception("Anthropic API request failed after retries")
