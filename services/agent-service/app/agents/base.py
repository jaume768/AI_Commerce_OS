from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any

from app.models.agent import AgentContext, AgentResult, RiskLevel
from app.llm.provider import ToolDefinition


class BaseAgent(ABC):
    """Abstract base class for all agents."""

    name: str = ""
    description: str = ""
    risk_level: RiskLevel = RiskLevel.LOW

    @abstractmethod
    def get_system_prompt(self, ctx: AgentContext) -> str:
        """Return the system prompt for this agent."""
        ...

    @abstractmethod
    def get_tools(self) -> list[ToolDefinition]:
        """Return the list of tool definitions this agent can use."""
        ...

    @abstractmethod
    async def run(self, ctx: AgentContext) -> AgentResult:
        """Execute the agent logic. Must be implemented by subclasses."""
        ...

    @abstractmethod
    async def execute_tool(self, tool_name: str, tool_input: dict[str, Any], ctx: AgentContext) -> str:
        """Execute a tool call and return the result as a string."""
        ...
