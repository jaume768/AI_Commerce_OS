from __future__ import annotations
import structlog
from typing import Any

log = structlog.get_logger(service="agent-service", module="tools.notifications")


class NotificationTools:
    """Notification stubs — will be extended with Slack/email/push in future phases."""

    def __init__(self, store_id: str):
        self.store_id = store_id

    async def send_dashboard_alert(self, title: str, message: str, severity: str = "info") -> dict:
        log.info(
            "dashboard_alert",
            store_id=self.store_id,
            title=title,
            severity=severity,
            message=message[:200],
        )
        # In future: push to Redis pub/sub or WebSocket for real-time dashboard alerts
        return {"sent": True, "channel": "dashboard", "title": title, "severity": severity}

    async def log_agent_action(self, agent_name: str, action: str, details: dict[str, Any]) -> dict:
        log.info(
            "agent_action_logged",
            store_id=self.store_id,
            agent=agent_name,
            action=action,
            details=details,
        )
        return {"logged": True, "agent": agent_name, "action": action}
