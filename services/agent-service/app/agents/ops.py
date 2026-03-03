from __future__ import annotations
import json
import structlog
from typing import Any

from app.agents.base import BaseAgent
from app.models.agent import AgentContext, AgentResult, ActionItem, RiskLevel, TokenUsage
from app.llm.provider import ToolDefinition
from app.tools.shopify import ShopifyTools
from app.tools.database import DatabaseTools
from app.config import settings

log = structlog.get_logger(service="agent-service", module="agents.ops")


class OpsAgent(BaseAgent):
    name = "ops"
    description = "Detects at-risk orders (incomplete address, unpaid, high value, stock issues) and proposes actions"
    risk_level = RiskLevel.MEDIUM

    def get_system_prompt(self, ctx: AgentContext) -> str:
        return f"""You are the Operations Agent for an e-commerce store on Shopify.
Your job is to review recent orders and detect potential risks or issues that need attention.

Risk categories to check:
1. **Incomplete/suspicious addresses**: Missing fields, PO boxes for high-value orders
2. **Unpaid orders**: Orders pending payment for more than {settings.OPS_UNPAID_HOURS_THRESHOLD} hours
3. **High-value orders**: Orders over {settings.OPS_HIGH_VALUE_THRESHOLD} EUR (may need fraud review)
4. **Fulfillment delays**: Orders paid but not yet fulfilled after 48 hours
5. **Cancelled/refunded patterns**: Products with unusual cancellation rates

For each risk detected, classify it:
- LOW risk: Tag the order for monitoring (auto-execute)
- MEDIUM risk: Propose customer communication or manual review (requires approval)
- HIGH risk: Flag for immediate human attention (requires approval)

After analyzing, respond with a JSON object:
{{
  "orders_analyzed": number,
  "risks_found": [
    {{
      "order_id": number,
      "order_name": "#1234",
      "risk_type": "incomplete_address|unpaid|high_value|fulfillment_delay|refund_pattern",
      "risk_level": "low|medium|high",
      "description": "...",
      "suggested_action": "tag|communicate|review|hold",
      "action_details": {{}}
    }}
  ],
  "summary": "Brief summary of findings"
}}

{"DRY RUN MODE: Do not execute any actions, only analyze and report." if ctx.dry_run else "Execute low-risk actions automatically. Propose medium/high risk actions for approval."}"""

    def get_tools(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_recent_orders",
                description="Get recent orders from the store",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 50},
                        "status": {"type": "string", "default": "any"},
                        "created_at_min": {"type": "string", "description": "ISO date for min created date"},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_order_details",
                description="Get full details of a specific order",
                input_schema={
                    "type": "object",
                    "properties": {
                        "order_id": {"type": "integer", "description": "Shopify order ID"},
                    },
                    "required": ["order_id"],
                },
            ),
            ToolDefinition(
                name="get_refund_stats",
                description="Get refund statistics for the last N days",
                input_schema={
                    "type": "object",
                    "properties": {
                        "days_back": {"type": "integer", "default": 7},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_store_overview",
                description="Get store overview with counts and recent activity",
                input_schema={"type": "object", "properties": {}, "required": []},
            ),
        ]

    async def execute_tool(self, tool_name: str, tool_input: dict[str, Any], ctx: AgentContext) -> str:
        shopify = ShopifyTools(ctx.store_id)
        db_tools = DatabaseTools(ctx.store_id)

        if tool_name == "get_recent_orders":
            result = await shopify.get_orders(
                limit=tool_input.get("limit", 50),
                status=tool_input.get("status", "any"),
                created_at_min=tool_input.get("created_at_min"),
            )
            return json.dumps(result, default=str)

        elif tool_name == "get_order_details":
            result = await shopify.get_order(tool_input["order_id"])
            return json.dumps(result, default=str)

        elif tool_name == "get_refund_stats":
            result = await db_tools.get_refund_stats(days_back=tool_input.get("days_back", 7))
            return json.dumps(result, default=str)

        elif tool_name == "get_store_overview":
            result = await shopify.get_overview()
            return json.dumps(result, default=str)

        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    async def run(self, ctx: AgentContext) -> AgentResult:
        run_log = log.bind(run_id=ctx.run_id, store_id=ctx.store_id)
        run_log.info("ops_agent_started")

        from app.services.runner import AgentRunner
        runner = AgentRunner()
        tokens = TokenUsage()

        user_message = (
            "Analyze recent orders from the store and identify any at-risk orders. "
            "Check for incomplete addresses, unpaid orders, high-value orders, "
            "fulfillment delays, and unusual refund patterns. "
            "The store currency is EUR."
        )

        llm_response, _ = await runner.run_tool_loop(
            agent=self,
            ctx=ctx,
            system_prompt=self.get_system_prompt(ctx),
            user_message=user_message,
            tools=self.get_tools(),
            tokens=tokens,
        )

        # Parse the analysis
        analysis: dict[str, Any] = {}
        try:
            content = llm_response.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            analysis = json.loads(content)
        except (json.JSONDecodeError, IndexError):
            run_log.warning("ops_json_parse_failed", response_len=len(llm_response))
            analysis = {"raw_response": llm_response, "risks_found": []}

        # Process risks into actions
        actions_taken: list[ActionItem] = []
        actions_proposed: list[ActionItem] = []
        db_tools = DatabaseTools(ctx.store_id)

        for risk in analysis.get("risks_found", []):
            risk_level_str = risk.get("risk_level", "low")
            risk_level = {
                "low": RiskLevel.LOW,
                "medium": RiskLevel.MEDIUM,
                "high": RiskLevel.HIGH,
            }.get(risk_level_str, RiskLevel.LOW)

            action = ActionItem(
                action_type=f"ops_{risk.get('suggested_action', 'review')}",
                description=risk.get("description", "Risk detected"),
                risk_level=risk_level,
                payload={
                    "order_id": risk.get("order_id"),
                    "order_name": risk.get("order_name"),
                    "risk_type": risk.get("risk_type"),
                    "action_details": risk.get("action_details", {}),
                },
            )

            if risk_level == RiskLevel.LOW and not ctx.dry_run:
                action.executed = True
                action.result = {"status": "auto_executed", "action": "tagged_for_monitoring"}
                actions_taken.append(action)
            else:
                # Create approval for medium/high risk
                if not ctx.dry_run:
                    approval_id = await db_tools.create_approval(
                        title=f"Ops: {risk.get('risk_type', 'risk')} — {risk.get('order_name', 'order')}",
                        description=risk.get("description", ""),
                        approval_type=f"ops_{risk.get('risk_type', 'risk')}",
                        diff_payload={
                            "order_id": risk.get("order_id"),
                            "order_name": risk.get("order_name"),
                            "risk": risk,
                            "suggested_action": risk.get("suggested_action"),
                        },
                    )
                    action.approval_id = approval_id

                actions_proposed.append(action)

        return AgentResult(
            success=True,
            summary=analysis.get("summary", f"Analyzed orders, found {len(analysis.get('risks_found', []))} risks."),
            actions_taken=actions_taken,
            actions_proposed=actions_proposed,
            artifacts=[],
            metrics={
                "orders_analyzed": analysis.get("orders_analyzed", 0),
                "risks_found": len(analysis.get("risks_found", [])),
            },
            tokens=tokens,
        )
