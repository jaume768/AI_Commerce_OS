from pydantic import BaseModel
from typing import Any, Optional
from datetime import datetime


class RunAgentRequest(BaseModel):
    agent_name: str
    store_id: str
    params: dict[str, Any] = {}
    dry_run: Optional[bool] = None
    user_note: Optional[str] = None


class RunAgentResponse(BaseModel):
    run_id: str
    agent_name: str
    store_id: str
    status: str
    summary: str = ""
    actions_taken: list[dict] = []
    actions_proposed: list[dict] = []
    artifacts: list[dict] = []
    tokens_used: dict[str, Any] = {}
    duration_ms: Optional[int] = None
    dry_run: bool = True
    error: Optional[str] = None


class AgentInfo(BaseModel):
    name: str
    description: str
    risk_level: str
    enabled: bool
    last_run: Optional[dict] = None
    run_count: int = 0


class AgentListResponse(BaseModel):
    agents: list[AgentInfo]


class AgentToggleRequest(BaseModel):
    enabled: bool


class AgentRunSummary(BaseModel):
    id: str
    store_id: str
    agent_name: str
    status: str
    trigger: str
    summary: str = ""
    duration_ms: Optional[int] = None
    tokens_used: dict[str, Any] = {}
    dry_run: bool = True
    error: Optional[str] = None
    started_at: str
    completed_at: Optional[str] = None


class AgentRunListResponse(BaseModel):
    runs: list[AgentRunSummary]
    total: int


class AgentRunDetailResponse(BaseModel):
    id: str
    store_id: str
    agent_name: str
    status: str
    trigger: str
    input_payload: dict[str, Any] = {}
    output_payload: dict[str, Any] = {}
    actions_taken: list[dict] = []
    actions_proposed: list[dict] = []
    artifacts: list[dict] = []
    tokens_used: dict[str, Any] = {}
    duration_ms: Optional[int] = None
    dry_run: bool = True
    error: Optional[str] = None
    started_at: str
    completed_at: Optional[str] = None
    audit_logs: list[dict] = []
