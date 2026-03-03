from __future__ import annotations
import json
import structlog
from typing import Any
from datetime import datetime, timedelta

from app import db

log = structlog.get_logger(service="agent-service", module="tools.database")


class DatabaseTools:
    """Direct DB queries for metrics, audit logs, and agent-specific data."""

    def __init__(self, store_id: str):
        self.store_id = store_id

    async def get_orders_summary(self, days_back: int = 1) -> dict[str, Any]:
        log.info("tool_call", tool="get_orders_summary", days_back=days_back)
        date_from = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

        rows = await db.fetch_all(
            """
            SELECT
                action,
                count(*) as count,
                jsonb_agg(changes) as changes_list
            FROM audit_logs
            WHERE store_id = $1
              AND entity_type = 'order'
              AND created_at >= $2::timestamptz
            GROUP BY action
            """,
            self.store_id, date_from,
        )
        result = {}
        for row in rows:
            result[row["action"]] = {
                "count": row["count"],
            }
        return {"store_id": self.store_id, "days_back": days_back, "summary": result}

    async def get_refund_stats(self, days_back: int = 7) -> dict[str, Any]:
        log.info("tool_call", tool="get_refund_stats", days_back=days_back)
        date_from = (datetime.utcnow() - timedelta(days=days_back)).isoformat()

        rows = await db.fetch_all(
            """
            SELECT count(*) as refund_count
            FROM audit_logs
            WHERE store_id = $1
              AND entity_type = 'refund'
              AND created_at >= $2::timestamptz
            """,
            self.store_id, date_from,
        )
        return {
            "store_id": self.store_id,
            "days_back": days_back,
            "refund_count": rows[0]["refund_count"] if rows else 0,
        }

    async def get_recent_audit_logs(self, entity_type: str | None = None, limit: int = 50) -> list[dict]:
        log.info("tool_call", tool="get_recent_audit_logs", entity_type=entity_type, limit=limit)
        if entity_type:
            rows = await db.fetch_all(
                """
                SELECT id, entity_type, entity_id, action, actor_type, changes, created_at
                FROM audit_logs
                WHERE store_id = $1 AND entity_type = $2
                ORDER BY created_at DESC
                LIMIT $3
                """,
                self.store_id, entity_type, limit,
            )
        else:
            rows = await db.fetch_all(
                """
                SELECT id, entity_type, entity_id, action, actor_type, changes, created_at
                FROM audit_logs
                WHERE store_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                self.store_id, limit,
            )
        for row in rows:
            row["id"] = str(row["id"])
            row["created_at"] = row["created_at"].isoformat() if row.get("created_at") else None
        return rows

    async def get_metrics_daily(self, days_back: int = 7, metric_type: str | None = None) -> list[dict]:
        log.info("tool_call", tool="get_metrics_daily", days_back=days_back, metric_type=metric_type)
        date_from = (datetime.utcnow() - timedelta(days=days_back)).date().isoformat()

        if metric_type:
            rows = await db.fetch_all(
                """
                SELECT metric_date, metric_type, channel, value, unit
                FROM metrics_daily
                WHERE store_id = $1 AND metric_date >= $2::date AND metric_type = $3
                ORDER BY metric_date DESC
                """,
                self.store_id, date_from, metric_type,
            )
        else:
            rows = await db.fetch_all(
                """
                SELECT metric_date, metric_type, channel, value, unit
                FROM metrics_daily
                WHERE store_id = $1 AND metric_date >= $2::date
                ORDER BY metric_date DESC
                """,
                self.store_id, date_from,
            )
        for row in rows:
            row["metric_date"] = row["metric_date"].isoformat() if row.get("metric_date") else None
            row["value"] = float(row["value"]) if row.get("value") is not None else 0
        return rows

    async def store_metrics(self, metrics: list[dict[str, Any]]) -> int:
        log.info("tool_call", tool="store_metrics", count=len(metrics))
        inserted = 0
        for m in metrics:
            await db.execute(
                """
                INSERT INTO metrics_daily (store_id, metric_date, metric_type, channel, value, unit, dimensions)
                VALUES ($1, $2::date, $3, $4, $5, $6, $7)
                ON CONFLICT (store_id, metric_date, metric_type, channel)
                DO UPDATE SET value = EXCLUDED.value, dimensions = EXCLUDED.dimensions
                """,
                self.store_id,
                m.get("date", datetime.utcnow().date().isoformat()),
                m["metric_type"],
                m.get("channel", "shopify"),
                m.get("value", 0),
                m.get("unit"),
                json.dumps(m.get("dimensions", {})),
            )
            inserted += 1
        return inserted

    async def get_webhook_events(self, topic: str | None = None, limit: int = 50) -> list[dict]:
        log.info("tool_call", tool="get_webhook_events", topic=topic, limit=limit)
        if topic:
            rows = await db.fetch_all(
                """
                SELECT id, topic, shopify_id, status, created_at
                FROM webhook_events
                WHERE store_id = $1 AND topic = $2
                ORDER BY created_at DESC LIMIT $3
                """,
                self.store_id, topic, limit,
            )
        else:
            rows = await db.fetch_all(
                """
                SELECT id, topic, shopify_id, status, created_at
                FROM webhook_events
                WHERE store_id = $1
                ORDER BY created_at DESC LIMIT $2
                """,
                self.store_id, limit,
            )
        for row in rows:
            row["id"] = str(row["id"])
            row["created_at"] = row["created_at"].isoformat() if row.get("created_at") else None
        return rows

    async def create_approval(
        self,
        title: str,
        description: str,
        approval_type: str,
        diff_payload: dict,
        task_id: str | None = None,
    ) -> str:
        log.info("tool_call", tool="create_approval", title=title, approval_type=approval_type)
        row = await db.fetch_one(
            """
            INSERT INTO approvals (store_id, title, description, approval_type, diff_payload, task_id, actor_type, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'agent', 'pending')
            RETURNING id
            """,
            self.store_id, title, description, approval_type,
            json.dumps(diff_payload), task_id,
        )
        approval_id = str(row["id"]) if row else ""
        log.info("approval_created", approval_id=approval_id)
        return approval_id
