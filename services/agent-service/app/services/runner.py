from __future__ import annotations
import json
import time
import structlog
from typing import Any
from uuid import uuid4

from app import db
from app.config import settings
from app.models.agent import (
    AgentContext, AgentResult, ActionItem, RiskLevel, TokenUsage, TriggerType,
)
from app.agents.base import BaseAgent
from app.llm import create_llm_provider, LLMMessage, ToolDefinition, LLMResult

log = structlog.get_logger(service="agent-service", module="runner")

MAX_TOOL_ITERATIONS = 15


class AgentRunner:
    """Orchestrates a full agent run: context → LLM → tools → actions → audit."""

    def __init__(self):
        self.llm = create_llm_provider()

    async def run(self, agent: BaseAgent, ctx: AgentContext) -> AgentResult:
        run_log = log.bind(run_id=ctx.run_id, agent=agent.name, store_id=ctx.store_id)
        start_time = time.monotonic()

        # Check kill switch
        is_enabled = await self._is_agent_enabled(ctx.store_id, agent.name)
        if not is_enabled:
            run_log.warning("agent_disabled")
            return AgentResult(success=False, error="Agent is disabled (kill switch)")

        # Create agent_run record
        input_payload = {**ctx.params}
        if ctx.user_note:
            input_payload["user_note"] = ctx.user_note

        await db.execute(
            """
            INSERT INTO agent_runs (id, store_id, agent_name, status, trigger, input_payload, dry_run)
            VALUES ($1::uuid, $2, $3, 'running', $4, $5, $6)
            """,
            ctx.run_id, ctx.store_id, agent.name, ctx.trigger.value,
            json.dumps(input_payload), ctx.dry_run,
        )

        # Audit log: run started
        audit_changes: dict = {"agent": agent.name, "trigger": ctx.trigger.value, "dry_run": ctx.dry_run}
        if ctx.user_note:
            audit_changes["user_note"] = ctx.user_note

        await db.execute(
            """
            INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes, run_id)
            VALUES ($1, 'agent_run', $2::uuid, 'started', 'agent', $3, $2::uuid)
            """,
            ctx.store_id, ctx.run_id,
            json.dumps(audit_changes),
        )

        try:
            run_log.info("agent_run_started", dry_run=ctx.dry_run, trigger=ctx.trigger.value)
            result = await agent.run(ctx)

            duration_ms = int((time.monotonic() - start_time) * 1000)

            # Update agent_run record
            await db.execute(
                """
                UPDATE agent_runs
                SET status = $1, output_payload = $2, actions_taken = $3,
                    actions_proposed = $4, tokens_used = $5, artifacts = $6,
                    duration_ms = $7, completed_at = NOW(), error = $8
                WHERE id = $9::uuid
                """,
                "completed" if result.success else "failed",
                json.dumps({"summary": result.summary, "metrics": result.metrics}),
                json.dumps([self._action_to_dict(a) for a in result.actions_taken]),
                json.dumps([self._action_to_dict(a) for a in result.actions_proposed]),
                json.dumps(result.tokens.to_dict()),
                json.dumps(result.artifacts),
                duration_ms,
                result.error,
                ctx.run_id,
            )

            # Audit log: run completed
            await db.execute(
                """
                INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes, run_id)
                VALUES ($1, 'agent_run', $2::uuid, 'completed', 'agent', $3, $2::uuid)
                """,
                ctx.store_id, ctx.run_id,
                json.dumps({
                    "success": result.success,
                    "actions_taken": len(result.actions_taken),
                    "actions_proposed": len(result.actions_proposed),
                    "duration_ms": duration_ms,
                    "tokens": result.tokens.to_dict(),
                }),
            )

            run_log.info(
                "agent_run_completed",
                success=result.success,
                duration_ms=duration_ms,
                actions_taken=len(result.actions_taken),
                actions_proposed=len(result.actions_proposed),
                tokens=result.tokens.to_dict(),
            )

            return result

        except Exception as e:
            duration_ms = int((time.monotonic() - start_time) * 1000)
            error_msg = str(e)
            run_log.error("agent_run_failed", error=error_msg, duration_ms=duration_ms)

            await db.execute(
                """
                UPDATE agent_runs
                SET status = 'failed', error = $1, duration_ms = $2, completed_at = NOW()
                WHERE id = $3::uuid
                """,
                error_msg, duration_ms, ctx.run_id,
            )

            await db.execute(
                """
                INSERT INTO audit_logs (store_id, entity_type, entity_id, action, actor_type, changes, run_id)
                VALUES ($1, 'agent_run', $2::uuid, 'failed', 'agent', $3, $2::uuid)
                """,
                ctx.store_id, ctx.run_id,
                json.dumps({"error": error_msg, "duration_ms": duration_ms}),
            )

            return AgentResult(success=False, error=error_msg)

    async def run_tool_loop(
        self,
        agent: BaseAgent,
        ctx: AgentContext,
        system_prompt: str,
        user_message: str,
        tools: list[ToolDefinition],
        tokens: TokenUsage,
    ) -> tuple[str, list[ActionItem]]:
        """Run the LLM tool-calling loop until the model stops calling tools."""
        # If there's a user note from the operator, append it to the system prompt
        effective_prompt = system_prompt
        if ctx.user_note:
            effective_prompt += f"\n\n--- OPERATOR NOTE ---\nThe store operator has left the following note for this run. Take it into account:\n\"{ctx.user_note}\"\n--- END NOTE ---"

        messages: list[LLMMessage] = [
            LLMMessage(role="system", content=effective_prompt),
            LLMMessage(role="user", content=user_message),
        ]
        actions: list[ActionItem] = []
        run_log = log.bind(run_id=ctx.run_id, agent=agent.name)

        for iteration in range(MAX_TOOL_ITERATIONS):
            result: LLMResult = await self.llm.chat(messages, tools if tools else None)
            tokens.add(result.prompt_tokens, result.completion_tokens)

            if not result.tool_calls:
                run_log.info("tool_loop_finished", iterations=iteration + 1, final_content_len=len(result.content))
                return result.content, actions

            # Process tool calls
            assistant_msg = LLMMessage(
                role="assistant",
                content=result.content,
                tool_calls=result.tool_calls,
            )
            messages.append(assistant_msg)

            for tc in result.tool_calls:
                run_log.info("tool_call", tool=tc.name, input_keys=list(tc.input.keys()), iteration=iteration)
                try:
                    tool_result = await agent.execute_tool(tc.name, tc.input, ctx)
                    # Truncate very long tool results
                    if len(tool_result) > 8000:
                        tool_result = tool_result[:8000] + "\n...[truncated]"
                except Exception as e:
                    tool_result = f"Error executing tool {tc.name}: {str(e)}"
                    run_log.error("tool_error", tool=tc.name, error=str(e))

                messages.append(LLMMessage(
                    role="tool",
                    content=tool_result,
                    tool_call_id=tc.id,
                ))

        run_log.warning("tool_loop_max_iterations", max=MAX_TOOL_ITERATIONS)
        return "Agent reached maximum tool iterations.", actions

    async def _is_agent_enabled(self, store_id: str, agent_name: str) -> bool:
        row = await db.fetch_one(
            "SELECT enabled FROM agent_config WHERE store_id = $1 AND agent_name = $2",
            store_id, agent_name,
        )
        if row is None:
            return True  # Default: enabled if no config row exists
        return row["enabled"]

    @staticmethod
    def _action_to_dict(action: ActionItem) -> dict:
        return {
            "action_type": action.action_type,
            "description": action.description,
            "risk_level": action.risk_level.value,
            "payload": action.payload,
            "executed": action.executed,
            "approval_id": action.approval_id,
            "result": action.result,
        }
