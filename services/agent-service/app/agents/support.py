from __future__ import annotations
import json
import structlog
from typing import Any

from app.agents.base import BaseAgent
from app.models.agent import AgentContext, AgentResult, ActionItem, RiskLevel, TokenUsage
from app.llm.provider import ToolDefinition
from app.tools.shopify import ShopifyTools
from app.tools.database import DatabaseTools
from app.tools.email_tools import EmailTools

log = structlog.get_logger(service="agent-service", module="agents.support")


class SupportAgent(BaseAgent):
    name = "support"
    description = (
        "Checks store email inbox daily, classifies customer emails, sends auto-acknowledgment, "
        "investigates order/product issues, and suggests responses for human review"
    )
    risk_level = RiskLevel.MEDIUM

    def get_system_prompt(self, ctx: AgentContext) -> str:
        return """You are the Support Agent for an e-commerce store on Shopify.
Your job is to process incoming customer emails and help the support team respond efficiently.

Your workflow:
1. Review each new email from the inbox
2. Classify it: complaint, question, return_request, shipping_inquiry, order_status, spam, other
3. Determine if it's from a real customer (not spam/marketing)
4. For customer emails:
   - Look up relevant order/customer data to understand the context
   - Draft a suggested response that is professional, empathetic, and helpful
   - Identify if any store action is needed (refund, replacement, etc.)

For each email, respond with a JSON object:
{
  "emails_processed": [
    {
      "email_id": "uuid",
      "from_address": "email",
      "subject": "...",
      "is_customer": true/false,
      "classification": "complaint|question|return_request|shipping_inquiry|order_status|spam|other",
      "order_id": number or null,
      "customer_context": "Brief summary of relevant customer/order data",
      "suggested_response": "Full draft response text in the same language as the customer email",
      "requires_action": true/false,
      "action_needed": "refund|replacement|escalate|none",
      "priority": "low|medium|high"
    }
  ],
  "summary": "Brief summary of all emails processed"
}

Important rules:
- Always respond in the SAME LANGUAGE as the customer email
- Be empathetic and professional
- Reference specific order details when available
- If a refund/replacement is needed, this requires human approval — do NOT promise it
- For spam/marketing emails, classify and skip"""

    def get_tools(self) -> list[ToolDefinition]:
        return [
            ToolDefinition(
                name="get_pending_emails",
                description="Get new/unprocessed emails from the inbox",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 20},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="search_orders_by_email",
                description="Search for orders by customer email address",
                input_schema={
                    "type": "object",
                    "properties": {
                        "email": {"type": "string", "description": "Customer email address"},
                    },
                    "required": ["email"],
                },
            ),
            ToolDefinition(
                name="get_order_details",
                description="Get full details of a specific order by ID",
                input_schema={
                    "type": "object",
                    "properties": {
                        "order_id": {"type": "integer"},
                    },
                    "required": ["order_id"],
                },
            ),
            ToolDefinition(
                name="get_recent_orders",
                description="Get recent orders (useful for context)",
                input_schema={
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 20},
                    },
                    "required": [],
                },
            ),
            ToolDefinition(
                name="get_product_details",
                description="Get details of a specific product",
                input_schema={
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "integer"},
                    },
                    "required": ["product_id"],
                },
            ),
            ToolDefinition(
                name="get_refund_stats",
                description="Get refund statistics",
                input_schema={
                    "type": "object",
                    "properties": {
                        "days_back": {"type": "integer", "default": 30},
                    },
                    "required": [],
                },
            ),
        ]

    async def execute_tool(self, tool_name: str, tool_input: dict[str, Any], ctx: AgentContext) -> str:
        shopify = ShopifyTools(ctx.store_id)
        db_tools = DatabaseTools(ctx.store_id)
        email_tools = EmailTools(ctx.store_id)

        if tool_name == "get_pending_emails":
            result = await email_tools.get_pending_emails(limit=tool_input.get("limit", 20))
            return json.dumps(result, default=str)

        elif tool_name == "search_orders_by_email":
            # Get orders and filter by customer email
            all_orders = await shopify.get_orders(limit=50, status="any")
            customer_email = tool_input["email"].lower().strip()
            matching = []
            for order in all_orders.get("data", []):
                order_email = (order.get("email") or "").lower().strip()
                customer = order.get("customer") or {}
                cust_email = (customer.get("email") or "").lower().strip()
                if customer_email in (order_email, cust_email):
                    matching.append({
                        "id": order.get("id"),
                        "name": order.get("name"),
                        "total_price": order.get("total_price"),
                        "currency": order.get("currency"),
                        "financial_status": order.get("financial_status"),
                        "fulfillment_status": order.get("fulfillment_status"),
                        "created_at": order.get("created_at"),
                    })
            return json.dumps({"orders": matching, "count": len(matching)}, default=str)

        elif tool_name == "get_order_details":
            result = await shopify.get_order(tool_input["order_id"])
            return json.dumps(result, default=str)

        elif tool_name == "get_recent_orders":
            result = await shopify.get_orders(limit=tool_input.get("limit", 20))
            return json.dumps(result, default=str)

        elif tool_name == "get_product_details":
            result = await shopify.get_product(tool_input["product_id"])
            return json.dumps(result, default=str)

        elif tool_name == "get_refund_stats":
            result = await db_tools.get_refund_stats(days_back=tool_input.get("days_back", 30))
            return json.dumps(result, default=str)

        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    async def run(self, ctx: AgentContext) -> AgentResult:
        run_log = log.bind(run_id=ctx.run_id, store_id=ctx.store_id)
        run_log.info("support_agent_started")

        email_tools = EmailTools(ctx.store_id)
        db_tools = DatabaseTools(ctx.store_id)

        # Step 1: Fetch new emails from IMAP
        if email_tools.is_configured():
            fetched = await email_tools.fetch_new_emails(max_emails=50)
            run_log.info("emails_fetched_from_imap", count=len(fetched))
        else:
            run_log.info("imap_not_configured_skipping_fetch")

        # Step 2: Get pending emails from DB
        pending = await email_tools.get_pending_emails(limit=30)
        if not pending:
            run_log.info("no_pending_emails")
            return AgentResult(
                success=True,
                summary="No pending emails to process.",
                actions_taken=[],
                actions_proposed=[],
            )

        run_log.info("pending_emails_to_process", count=len(pending))

        # Step 3: LLM analysis with tool loop
        from app.services.runner import AgentRunner
        runner = AgentRunner()
        tokens = TokenUsage()

        # Build the user message with email data
        email_summaries = []
        for em in pending[:20]:  # Limit to 20 per run
            email_summaries.append(
                f"- Email ID: {em['id']}\n"
                f"  From: {em['from_address']}\n"
                f"  Subject: {em.get('subject', '(no subject)')}\n"
                f"  Body preview: {(em.get('body_text') or '')[:500]}\n"
            )

        user_message = (
            "Process the following incoming emails. For each one, classify it, "
            "determine if it's from a customer, look up relevant order data if applicable, "
            "and draft a suggested response.\n\n"
            "EMAILS TO PROCESS:\n\n"
            + "\n".join(email_summaries)
        )

        llm_response, _ = await runner.run_tool_loop(
            agent=self,
            ctx=ctx,
            system_prompt=self.get_system_prompt(ctx),
            user_message=user_message,
            tools=self.get_tools(),
            tokens=tokens,
        )

        # Parse LLM response
        analysis: dict[str, Any] = {}
        try:
            content = llm_response.strip()
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            analysis = json.loads(content)
        except (json.JSONDecodeError, IndexError):
            run_log.warning("support_json_parse_failed", response_len=len(llm_response))
            analysis = {"emails_processed": [], "raw_response": llm_response}

        # Step 4: Process results
        actions_taken: list[ActionItem] = []
        actions_proposed: list[ActionItem] = []

        for processed in analysis.get("emails_processed", []):
            email_id = processed.get("email_id", "")
            is_customer = processed.get("is_customer", False)
            classification = processed.get("classification", "other")
            suggested_response = processed.get("suggested_response", "")

            # Update email classification in DB
            if not ctx.dry_run and email_id:
                await email_tools.update_email_classification(
                    email_id=email_id,
                    is_customer=is_customer,
                    classification=classification,
                    suggested_response=suggested_response,
                    agent_run_id=ctx.run_id,
                )

            # Send auto-reply for customer emails
            if is_customer and classification != "spam" and not ctx.dry_run:
                auto_sent = await email_tools.send_auto_reply(email_id)
                if auto_sent:
                    actions_taken.append(ActionItem(
                        action_type="auto_reply_sent",
                        description=f"Auto-acknowledgment sent to {processed.get('from_address', '')}",
                        risk_level=RiskLevel.LOW,
                        payload={"email_id": email_id, "to": processed.get("from_address")},
                        executed=True,
                    ))

            # Create approval for actions that need human review
            if processed.get("requires_action") and processed.get("action_needed") != "none":
                priority_str = processed.get("priority", "medium")
                risk_level = {
                    "low": RiskLevel.LOW,
                    "medium": RiskLevel.MEDIUM,
                    "high": RiskLevel.HIGH,
                }.get(priority_str, RiskLevel.MEDIUM)

                action = ActionItem(
                    action_type=f"support_{processed.get('action_needed', 'review')}",
                    description=(
                        f"Email from {processed.get('from_address', '?')}: "
                        f"{processed.get('subject', '(no subject)')} — "
                        f"Action needed: {processed.get('action_needed', 'review')}"
                    ),
                    risk_level=risk_level,
                    payload={
                        "email_id": email_id,
                        "from_address": processed.get("from_address"),
                        "subject": processed.get("subject"),
                        "classification": classification,
                        "order_id": processed.get("order_id"),
                        "customer_context": processed.get("customer_context"),
                        "suggested_response": suggested_response,
                        "action_needed": processed.get("action_needed"),
                    },
                )

                if not ctx.dry_run:
                    approval_id = await db_tools.create_approval(
                        title=f"Support: {classification} — {processed.get('from_address', '?')}",
                        description=(
                            f"Customer email requires action: {processed.get('action_needed')}\n\n"
                            f"Subject: {processed.get('subject', '')}\n"
                            f"Context: {processed.get('customer_context', '')}\n\n"
                            f"Suggested response:\n{suggested_response}"
                        ),
                        approval_type=f"support_{processed.get('action_needed', 'review')}",
                        diff_payload={
                            "email": processed,
                            "suggested_response": suggested_response,
                        },
                    )
                    action.approval_id = approval_id

                actions_proposed.append(action)

            # If it's a classified customer email with no special action, just mark it
            elif is_customer and not ctx.dry_run and email_id:
                actions_taken.append(ActionItem(
                    action_type="email_classified",
                    description=f"Classified email from {processed.get('from_address', '')}: {classification}",
                    risk_level=RiskLevel.LOW,
                    payload={
                        "email_id": email_id,
                        "classification": classification,
                        "suggested_response": suggested_response[:200],
                    },
                    executed=True,
                ))

        total_processed = len(analysis.get("emails_processed", []))
        customer_count = sum(1 for e in analysis.get("emails_processed", []) if e.get("is_customer"))

        return AgentResult(
            success=True,
            summary=analysis.get("summary", f"Processed {total_processed} emails, {customer_count} from customers."),
            actions_taken=actions_taken,
            actions_proposed=actions_proposed,
            artifacts=[],
            metrics={
                "emails_processed": total_processed,
                "customer_emails": customer_count,
                "auto_replies_sent": sum(1 for a in actions_taken if a.action_type == "auto_reply_sent"),
                "approvals_created": len(actions_proposed),
            },
            tokens=tokens,
        )
