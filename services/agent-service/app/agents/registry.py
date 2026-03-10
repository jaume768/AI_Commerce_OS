from __future__ import annotations
from typing import Type

from app.agents.base import BaseAgent
from app.agents.ops import OpsAgent
from app.agents.support import SupportAgent
from app.agents.reporting import ReportingAgent
from app.agents.ads_meta import AdsMetaAgent

AGENT_REGISTRY: dict[str, Type[BaseAgent]] = {
    "ops": OpsAgent,
    "support": SupportAgent,
    "reporting": ReportingAgent,
    "ads_meta": AdsMetaAgent,
}


def get_agent_class(name: str) -> Type[BaseAgent] | None:
    return AGENT_REGISTRY.get(name)
