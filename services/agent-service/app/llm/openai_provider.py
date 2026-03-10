from __future__ import annotations
import httpx
import json
import structlog
import asyncio
from typing import Any

from app.llm.provider import LLMProvider, LLMMessage, ToolDefinition, ToolCall, LLMResult

log = structlog.get_logger(service="agent-service", module="llm.openai")

# Models that require the Responses API (/v1/responses) instead of Chat Completions
RESPONSES_API_MODELS = {"o1", "o1-mini", "o1-preview", "o3", "o3-mini", "o4-mini",
                        "gpt-5", "gpt-5-mini", "gpt-5.4"}


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
        self.model = model.lower()
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.base_url = base_url
        self._client: httpx.AsyncClient | None = None
        model_lower = model.lower()
        self._use_responses_api = any(model_lower.startswith(r) for r in RESPONSES_API_MODELS)

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
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
        if self._use_responses_api:
            return await self._chat_responses_api(messages, tools)
        return await self._chat_completions_api(messages, tools)

    # ------------------------------------------------------------------ #
    #  Chat Completions API  (/v1/chat/completions)  —  gpt-4o, gpt-4.1  #
    # ------------------------------------------------------------------ #
    async def _chat_completions_api(
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

        return await self._request_with_retry("/v1/chat/completions", body, self._parse_completions)

    @staticmethod
    def _parse_completions(data: dict) -> LLMResult:
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

        return LLMResult(
            content=message.get("content") or "",
            tool_calls=tool_calls,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            model=data.get("model", ""),
            stop_reason=choice.get("finish_reason", ""),
        )

    # ------------------------------------------------------------------ #
    #  Responses API  (/v1/responses)  —  gpt-5, gpt-5.4, o3, o4-mini   #
    # ------------------------------------------------------------------ #
    async def _chat_responses_api(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
    ) -> LLMResult:
        instructions: str | None = None
        input_items: list[dict[str, Any]] = []

        for msg in messages:
            if msg.role == "system":
                instructions = msg.content
            elif msg.role == "user":
                input_items.append({"role": "user", "content": msg.content})
            elif msg.role == "assistant":
                if msg.content:
                    input_items.append({"role": "assistant", "content": msg.content})
                if msg.tool_calls:
                    for tc in msg.tool_calls:
                        input_items.append({
                            "type": "function_call",
                            "call_id": tc.id,
                            "name": tc.name,
                            "arguments": json.dumps(tc.input) if isinstance(tc.input, dict) else str(tc.input),
                        })
            elif msg.role == "tool":
                input_items.append({
                    "type": "function_call_output",
                    "call_id": msg.tool_call_id or "",
                    "output": msg.content,
                })

        body: dict[str, Any] = {
            "model": self.model,
            "input": input_items,
        }
        if instructions:
            body["instructions"] = instructions
        if self.max_tokens:
            body["max_output_tokens"] = self.max_tokens
        if tools:
            body["tools"] = [
                {
                    "type": "function",
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                    "strict": False,
                }
                for t in tools
            ]

        return await self._request_with_retry("/v1/responses", body, self._parse_responses)

    @staticmethod
    def _parse_responses(data: dict) -> LLMResult:
        text_content = ""
        tool_calls: list[ToolCall] = []

        for item in data.get("output", []):
            item_type = item.get("type", "")
            if item_type == "message":
                for content_block in item.get("content", []):
                    if content_block.get("type") == "output_text":
                        text_content += content_block.get("text", "")
            elif item_type == "function_call":
                args_str = item.get("arguments", "{}")
                try:
                    args = json.loads(args_str)
                except json.JSONDecodeError:
                    args = {"raw": args_str}
                tool_calls.append(ToolCall(
                    id=item.get("call_id", ""),
                    name=item.get("name", ""),
                    input=args,
                ))

        usage = data.get("usage", {})
        prompt_tokens = usage.get("input_tokens", 0)
        completion_tokens = usage.get("output_tokens", 0)

        return LLMResult(
            content=text_content,
            tool_calls=tool_calls,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            model=data.get("model", ""),
            stop_reason=data.get("status", ""),
        )

    # ------------------------------------------------------------------ #
    #  Shared retry logic                                                 #
    # ------------------------------------------------------------------ #
    async def _request_with_retry(
        self,
        endpoint: str,
        body: dict,
        parser: Any,
        max_retries: int = 5,
    ) -> LLMResult:
        last_error: Exception | None = None
        for attempt in range(max_retries):
            try:
                client = self._get_client()
                resp = await client.post(endpoint, json=body)

                if resp.status_code == 429:
                    resp_body = resp.text
                    retry_after = resp.headers.get("retry-after")
                    delay = int(retry_after) if retry_after and retry_after.isdigit() else min(2 ** attempt * 3, 60)
                    log.warning("openai_rate_limited", delay=delay, attempt=attempt, body=resp_body[:500])
                    await asyncio.sleep(delay)
                    continue

                resp.raise_for_status()
                data = resp.json()

                result = parser(data)

                log.info(
                    "openai_response",
                    api=endpoint,
                    model=result.model,
                    prompt_tokens=result.prompt_tokens,
                    completion_tokens=result.completion_tokens,
                    tool_calls=len(result.tool_calls),
                    stop_reason=result.stop_reason,
                )

                return result

            except httpx.HTTPStatusError as e:
                last_error = e
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    log.error("openai_client_error", status=e.response.status_code, body=e.response.text)
                    raise
                delay = min(2 ** attempt * 3, 60)
                log.warning("openai_retry", attempt=attempt, status=e.response.status_code, delay=delay)
                await asyncio.sleep(delay)
            except Exception as e:
                last_error = e
                delay = min(2 ** attempt * 3, 60)
                log.warning("openai_retry", attempt=attempt, error=str(e), delay=delay)
                await asyncio.sleep(delay)

        raise last_error or Exception("OpenAI API request failed after retries")
