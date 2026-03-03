from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LLMMessage:
    role: str  # system, user, assistant, tool
    content: str
    tool_call_id: str | None = None
    tool_calls: list[ToolCall] | None = None


@dataclass
class ToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class LLMResult:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    model: str = ""
    stop_reason: str = ""


class LLMProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        messages: list[LLMMessage],
        tools: list[ToolDefinition] | None = None,
    ) -> LLMResult:
        ...
