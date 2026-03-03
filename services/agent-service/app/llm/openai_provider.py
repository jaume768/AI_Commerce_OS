from __future__ import annotations
import httpx
import json
import structlog
import asyncio
from typing import Any

from app.llm.provider import LLMProvider, LLMMessage, ToolDefinition, ToolCall, LLMResult

log = structlog.get_logger(service="agent-service", module="llm.openai")


class OpenAIProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        max_tokens: int = 4096,
        temperature: float = 0.3,
        base_url: str = "https://api.openai.com",
    ):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.base_url = base_url
        self._client: httpx.AsyncClient | None = None

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=120.0,
            )
        return self._client

    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
    ) -> LLMResult:
        oai_messages: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "tool":
                oai_messages.append({
                    "role": "tool",
                    "content": msg.content,
                    "tool_call_id": msg.tool_call_id or "",
                })
            elif msg.role == "assistant" and msg.tool_calls:
                oai_messages.append({
                    "role": "assistant",
                    "content": msg.content or None,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.input),
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                })
            else:
                oai_messages.append({"role": msg.role, "content": msg.content})

        body: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "messages": oai_messages,
        }
        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    },
                }
                for t in tools
            ]

        result = await self._request_with_retry(body)
        return result

    async def _request_with_retry(self, body: dict, max_retries: int = 3) -> LLMResult:
        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                client = self._get_client()
                resp = await client.post("/v1/chat/completions", json=body)

                if resp.status_code == 429:
                    delay = min(2 ** attempt * 2, 30)
                    log.warning("openai_rate_limited", delay=delay, attempt=attempt)
                    await asyncio.sleep(delay)
                    continue

                resp.raise_for_status()
                data = resp.json()

                choice = data["choices"][0]
                message = choice["message"]
                tool_calls: list[ToolCall] = []

                if message.get("tool_calls"):
                    for tc in message["tool_calls"]:
                        tool_calls.append(ToolCall(
                            id=tc["id"],
                            name=tc["function"]["name"],
                            input=json.loads(tc["function"]["arguments"]),
                        ))

                usage = data.get("usage", {})
                prompt_tokens = usage.get("prompt_tokens", 0)
                completion_tokens = usage.get("completion_tokens", 0)

                log.info(
                    "openai_response",
                    model=data.get("model"),
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    tool_calls=len(tool_calls),
                    finish_reason=choice.get("finish_reason"),
                )

                return LLMResult(
                    content=message.get("content") or "",
                    tool_calls=tool_calls,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    total_tokens=prompt_tokens + completion_tokens,
                    model=data.get("model", self.model),
                    stop_reason=choice.get("finish_reason", ""),
                )

            except httpx.HTTPStatusError as e:
                last_error = e
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    log.error("openai_client_error", status=e.response.status_code, body=e.response.text)
                    raise
                delay = min(2 ** attempt * 2, 30)
                log.warning("openai_retry", attempt=attempt, status=e.response.status_code, delay=delay)
                await asyncio.sleep(delay)
            except Exception as e:
                last_error = e
                delay = min(2 ** attempt * 2, 30)
                log.warning("openai_retry", attempt=attempt, error=str(e), delay=delay)
                await asyncio.sleep(delay)

        raise last_error or Exception("OpenAI API request failed after retries")
