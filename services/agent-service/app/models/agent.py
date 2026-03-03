from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class RunStatus(str, Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TriggerType(str, Enum):
    MANUAL = "manual"
    SCHEDULE = "schedule"
    WEBHOOK = "webhook"
    APPROVAL = "approval"


@dataclass
class ActionItem:
    action_type: str
    description: str
    risk_level: RiskLevel = RiskLevel.LOW
    payload: dict[str, Any] = field(default_factory=dict)
    executed: bool = False
    approval_id: str | None = None
    result: dict[str, Any] | None = None


@dataclass
class AgentContext:
    store_id: str
    run_id: str = field(default_factory=lambda: str(uuid4()))
    trigger: TriggerType = TriggerType.MANUAL
    dry_run: bool = True
    goal: dict[str, Any] | None = None
    task: dict[str, Any] | None = None
    params: dict[str, Any] = field(default_factory=dict)
    user_note: str | None = None


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

    def add(self, prompt: int, completion: int):
        self.prompt_tokens += prompt
        self.completion_tokens += completion
        self.total_tokens += prompt + completion

    def to_dict(self) -> dict:
        return {
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
        }


@dataclass
class AgentResult:
    success: bool
    summary: str = ""
    actions_taken: list[ActionItem] = field(default_factory=list)
    actions_proposed: list[ActionItem] = field(default_factory=list)
    artifacts: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    tokens: TokenUsage = field(default_factory=TokenUsage)
    error: str | None = None


@dataclass
class AgentRun:
    id: str
    store_id: str
    agent_name: str
    status: RunStatus
    trigger: TriggerType
    input_payload: dict[str, Any]
    output_payload: dict[str, Any]
    actions_taken: list[dict]
    actions_proposed: list[dict]
    error: str | None
    tokens_used: dict[str, Any]
    artifacts: list[dict]
    duration_ms: int | None
    dry_run: bool
    started_at: datetime
    completed_at: datetime | None
    created_at: datetime


@dataclass
class AgentConfig:
    id: str
    store_id: str
    agent_name: str
    enabled: bool
    settings: dict[str, Any]
