from __future__ import annotations
import json
import structlog
from typing import Any
from datetime import datetime, timedelta

from app.agents.base import BaseAgent
from app.models.agent import AgentContext, AgentResult, ActionItem, RiskLevel, TokenUsage
from app.llm.provider import ToolDefinition
from app.tools.shopify import ShopifyTools
from app.tools.database import DatabaseTools
from app.services.storage import upload_artifact

log = structlog.get_logger(service="agent-service", module="agents.reporting")


class ReportingAgent(BaseAgent):
    name = "reporting"
    description = "Generates daily sales report with KPIs, top products, alerts and suggested actions"
    risk_level = RiskLevel.LOW

    def get_system_prompt(self, ctx: AgentContext) -> str:
        return """You are the Reporting Agent for an e-commerce store running on Shopify.
Your job is to generate a concise daily report analyzing store performance.

You have tools to:
1. Get the store overview (products count, orders count, recent orders, revenue)
2. Get orders for a specific date range
3. Get order and refund statistics from the audit logs
4. Get historical daily metrics

Your report MUST include:
- **KPIs**: Total orders, total revenue, average order value (AOV), refund count
- **Top products**: Identify which products sold the most (by quantity and revenue)
- **Alerts**: Flag anything unusual (big drop in orders, spike in refunds, etc.)
- **3 suggested actions**: Prioritized, actionable recommendations

Respond with a JSON object with this structure:
{
  "date": "YYYY-MM-DD",
  "kpis": {
    "total_orders": number,
    "total_revenue": number,
    "currency": "EUR",
    "aov": number,
    "refund_count": number
  },
  "top_products": [{"title": "...", "quantity": N, "revenue": N}],
  "alerts": ["..."],
  "suggested_actions": ["...", "...", "..."],
  "summary": "2-3 sentence executive summary"
}

Always use the tools to get real data. Do not make up numbers."""

    def get_tools(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_store_overview",
                description="Get store overview including product/order/customer counts and recent orders with revenue",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
            ToolDefinition(
                name="get_orders",
                description="Get orders within a date range",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "description": "Max orders to return", "default": 50},
                        "status": {"type": "string", "description": "Order status filter", "default": "any"},
                        "created_at_min": {"type": "string", "description": "ISO date string for min created date"},
                        "created_at_max": {"type": "string", "description": "ISO date string for max created date"},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_orders_summary",
                description="Get order events summary from audit logs for the last N days",
                input_schema={
                    "type": "object",
                    "properties": {
                        "days_back": {"type": "integer", "description": "Number of days to look back", "default": 1},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_refund_stats",
                description="Get refund statistics for the last N days",
                input_schema={
                    "type": "object",
                    "properties": {
                        "days_back": {"type": "integer", "description": "Number of days to look back", "default": 7},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_metrics_daily",
                description="Get historical daily metrics (revenue, orders, etc.)",
                input_schema={
                    "type": "object",
                    "properties": {
                        "days_back": {"type": "integer", "default": 7},
                        "metric_type": {"type": "string", "description": "Filter by metric type"},
                    },
                    "required": [],
                },
            ),
        ]

    async def execute_tool(self, tool_name: str, tool_input: dict[str, Any], ctx: AgentContext) -> str:
        shopify = ShopifyTools(ctx.store_id)
        db_tools = DatabaseTools(ctx.store_id)

        if tool_name == "get_store_overview":
            result = await shopify.get_overview()
            return json.dumps(result, default=str)

        elif tool_name == "get_orders":
            result = await shopify.get_orders(
                limit=tool_input.get("limit", 50),
                status=tool_input.get("status", "any"),
                created_at_min=tool_input.get("created_at_min"),
                created_at_max=tool_input.get("created_at_max"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_orders_summary":
            result = await db_tools.get_orders_summary(days_back=tool_input.get("days_back", 1))
            return json.dumps(result, default=str)

        elif tool_name == "get_refund_stats":
            result = await db_tools.get_refund_stats(days_back=tool_input.get("days_back", 7))
            return json.dumps(result, default=str)

        elif tool_name == "get_metrics_daily":
            result = await db_tools.get_metrics_daily(
                days_back=tool_input.get("days_back", 7),
                metric_type=tool_input.get("metric_type"),
            )
            return json.dumps(result, default=str)

        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    async def run(self, ctx: AgentContext) -> AgentResult:
        run_log = log.bind(run_id=ctx.run_id, store_id=ctx.store_id)
        run_log.info("reporting_agent_started")

        from app.services.runner import AgentRunner
        runner = AgentRunner()
        tokens = TokenUsage()

        report_date = ctx.params.get("date", (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d"))

        user_message = (
            f"Generate the daily report for date {report_date}. "
            f"Use the tools to gather real data from the store. "
            f"The store currency is EUR."
        )

        llm_response, actions = await runner.run_tool_loop(
            agent=self,
            ctx=ctx,
            system_prompt=self.get_system_prompt(ctx),
            user_message=user_message,
            tools=self.get_tools(),
            tokens=tokens,
        )

        # Try to parse the JSON report from LLM response
        report_data: dict[str, Any] = {}
        try:
            # Extract JSON from response (might be wrapped in markdown code blocks)
            content = llm_response.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            report_data = json.loads(content)
        except (json.JSONDecodeError, IndexError):
            run_log.warning("report_json_parse_failed", response_len=len(llm_response))
            report_data = {"raw_response": llm_response, "date": report_date}

        # Store metrics from the report
        db_tools = DatabaseTools(ctx.store_id)
        kpis = report_data.get("kpis", {})
        metrics_to_store = []
        if kpis.get("total_orders") is not None:
            metrics_to_store.append({"date": report_date, "metric_type": "orders_total", "value": kpis["total_orders"], "unit": "count"})
        if kpis.get("total_revenue") is not None:
            metrics_to_store.append({"date": report_date, "metric_type": "revenue_total", "value": kpis["total_revenue"], "unit": "EUR"})
        if kpis.get("aov") is not None:
            metrics_to_store.append({"date": report_date, "metric_type": "aov", "value": kpis["aov"], "unit": "EUR"})
        if kpis.get("refund_count") is not None:
            metrics_to_store.append({"date": report_date, "metric_type": "refunds_total", "value": kpis["refund_count"], "unit": "count"})

        if metrics_to_store and not ctx.dry_run:
            await db_tools.store_metrics(metrics_to_store)

        # Upload report to S3
        artifacts = []
        if not ctx.dry_run:
            try:
                report_json = json.dumps(report_data, indent=2, default=str)
                key = f"stores/{ctx.store_id}/reports/daily/{report_date}/report.json"
                artifact = await upload_artifact(
                    key=key,
                    content=report_json,
                    content_type="application/json",
                )
                artifacts.append(artifact)
                run_log.info("report_uploaded", key=key)
            except Exception as e:
                run_log.error("report_upload_failed", error=str(e))

        actions_taken = [
            ActionItem(
                action_type="generate_report",
                description=f"Daily report generated for {report_date}",
                risk_level=RiskLevel.LOW,
                payload={"date": report_date},
                executed=True,
                result={"kpis": kpis},
            ),
        ]

        return AgentResult(
            success=True,
            summary=report_data.get("summary", f"Daily report for {report_date} generated successfully."),
            actions_taken=actions_taken,
            actions_proposed=[],
            artifacts=artifacts,
            metrics=kpis,
            tokens=tokens,
        )
