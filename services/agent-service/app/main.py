import json
import structlog
from datetime import datetime
from uuid import uuid4
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from typing import Optional

from app.config import settings
from app import db
from app.models.agent import AgentContext, TriggerType
from app.models.schemas import (
    RunAgentRequest,
    RunAgentResponse,
    AgentListResponse,
    AgentInfo,
    AgentToggleRequest,
    AgentRunListResponse,
    AgentRunSummary,
    AgentRunDetailResponse,
)
from app.agents.registry import AGENT_REGISTRY, get_agent_class
from app.services.runner import AgentRunner
from app.scheduler.jobs import setup_scheduler, shutdown_scheduler, get_schedule_info

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

log = structlog.get_logger(service="agent-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("agent-service starting", dry_run=settings.DRY_RUN, llm_provider=settings.LLM_PROVIDER)
    scheduler = setup_scheduler()
    yield
    shutdown_scheduler()
    await db.close_pool()
    log.info("agent-service shutting down")


app = FastAPI(
    title="AI Commerce OS — Agent Service",
    version="0.6.0",
    lifespan=lifespan,
)


# ============================================================
# Internal auth middleware — verifies INTERNAL_AUTH_TOKEN
# Skips /health and /ready endpoints
# ============================================================

@app.middleware("http")
async def verify_internal_auth(request: Request, call_next):
    # Allow health/ready without auth
    if request.url.path in ("/health", "/ready", "/docs", "/openapi.json"):
        return await call_next(request)

    token = settings.INTERNAL_AUTH_TOKEN
    if token:
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer ") or auth_header[7:] != token:
            return JSONResponse(
                status_code=401,
                content={"error": "Unauthorized", "message": "Invalid or missing internal auth token"},
            )

    return await call_next(request)


# ============================================================
# Health
# ============================================================

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "agent-service",
        "version": "0.6.0",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/ready")
async def ready():
    try:
        pool = await db.get_pool()
        await pool.fetchval("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ready" if db_ok else "degraded",
        "service": "agent-service",
        "checks": {"database": db_ok},
        "timestamp": datetime.utcnow().isoformat(),
    }


# ============================================================
# Agents CRUD
# ============================================================

@app.get("/agents", response_model=AgentListResponse)
async def list_agents(store_id: Optional[str] = Query(None)):
    agents: list[AgentInfo] = []
    for name, cls in AGENT_REGISTRY.items():
        agent = cls()
        enabled = True
        last_run = None
        run_count = 0

        if store_id:
            config_row = await db.fetch_one(
                "SELECT enabled FROM agent_config WHERE store_id = $1 AND agent_name = $2",
                store_id, name,
            )
            if config_row is not None:
                enabled = config_row["enabled"]

            last_run_row = await db.fetch_one(
                """SELECT id, status, trigger, duration_ms, started_at, completed_at
                   FROM agent_runs WHERE store_id = $1 AND agent_name = $2
                   ORDER BY created_at DESC LIMIT 1""",
                store_id, name,
            )
            if last_run_row:
                last_run = {
                    "id": str(last_run_row["id"]),
                    "status": last_run_row["status"],
                    "trigger": last_run_row["trigger"],
                    "duration_ms": last_run_row["duration_ms"],
                    "started_at": last_run_row["started_at"].isoformat() if last_run_row["started_at"] else None,
                }

            count_row = await db.fetch_one(
                "SELECT count(*) as c FROM agent_runs WHERE store_id = $1 AND agent_name = $2",
                store_id, name,
            )
            run_count = count_row["c"] if count_row else 0

        agents.append(AgentInfo(
            name=name,
            description=agent.description,
            risk_level=agent.risk_level.value,
            enabled=enabled,
            last_run=last_run,
            run_count=run_count,
        ))

    return AgentListResponse(agents=agents)


@app.patch("/agents/{agent_name}/toggle")
async def toggle_agent(agent_name: str, body: AgentToggleRequest, store_id: str = Query(...)):
    if agent_name not in AGENT_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    await db.execute(
        """
        INSERT INTO agent_config (store_id, agent_name, enabled)
        VALUES ($1, $2, $3)
        ON CONFLICT (store_id, agent_name)
        DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
        """,
        store_id, agent_name, body.enabled,
    )

    log.info("agent_toggled", agent=agent_name, store_id=store_id, enabled=body.enabled)
    return {"agent_name": agent_name, "store_id": store_id, "enabled": body.enabled}


# ============================================================
# Run agent
# ============================================================

@app.post("/agents/run", response_model=RunAgentResponse)
async def run_agent(body: RunAgentRequest):
    agent_cls = get_agent_class(body.agent_name)
    if not agent_cls:
        raise HTTPException(status_code=404, detail=f"Agent '{body.agent_name}' not found")

    agent = agent_cls()
    ctx = AgentContext(
        store_id=body.store_id,
        run_id=str(uuid4()),
        trigger=TriggerType.MANUAL,
        dry_run=body.dry_run if body.dry_run is not None else settings.DRY_RUN,
        params=body.params,
        user_note=body.user_note,
    )

    runner = AgentRunner()
    result = await runner.run(agent, ctx)

    return RunAgentResponse(
        run_id=ctx.run_id,
        agent_name=body.agent_name,
        store_id=body.store_id,
        status="completed" if result.success else "failed",
        summary=result.summary,
        actions_taken=[runner._action_to_dict(a) for a in result.actions_taken],
        actions_proposed=[runner._action_to_dict(a) for a in result.actions_proposed],
        artifacts=result.artifacts,
        tokens_used=result.tokens.to_dict(),
        dry_run=ctx.dry_run,
        error=result.error,
    )


# ============================================================
# Agent runs history
# ============================================================

@app.get("/agents/runs", response_model=AgentRunListResponse)
async def list_runs(
    store_id: str = Query(...),
    agent_name: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    conditions = ["store_id = $1"]
    params: list = [store_id]
    idx = 2

    if agent_name:
        conditions.append(f"agent_name = ${idx}")
        params.append(agent_name)
        idx += 1
    if status:
        conditions.append(f"status = ${idx}")
        params.append(status)
        idx += 1

    where = " AND ".join(conditions)

    count_row = await db.fetch_one(f"SELECT count(*) as c FROM agent_runs WHERE {where}", *params)
    total = count_row["c"] if count_row else 0

    params.append(limit)
    params.append(offset)
    rows = await db.fetch_all(
        f"""SELECT id, store_id, agent_name, status, trigger, output_payload,
                   duration_ms, tokens_used, dry_run, error, started_at, completed_at
            FROM agent_runs WHERE {where}
            ORDER BY created_at DESC LIMIT ${idx} OFFSET ${idx + 1}""",
        *params,
    )

    runs = []
    for r in rows:
        output = r.get("output_payload") or {}
        if isinstance(output, str):
            try:
                output = json.loads(output)
            except Exception:
                output = {}
        tokens = r.get("tokens_used") or {}
        if isinstance(tokens, str):
            try:
                tokens = json.loads(tokens)
            except Exception:
                tokens = {}

        runs.append(AgentRunSummary(
            id=str(r["id"]),
            store_id=str(r["store_id"]),
            agent_name=r["agent_name"],
            status=r["status"],
            trigger=r.get("trigger", "manual"),
            summary=output.get("summary", ""),
            duration_ms=r.get("duration_ms"),
            tokens_used=tokens,
            dry_run=r.get("dry_run", True),
            error=r.get("error"),
            started_at=r["started_at"].isoformat() if r.get("started_at") else "",
            completed_at=r["completed_at"].isoformat() if r.get("completed_at") else None,
        ))

    return AgentRunListResponse(runs=runs, total=total)


@app.get("/agents/runs/{run_id}", response_model=AgentRunDetailResponse)
async def get_run_detail(run_id: str, store_id: Optional[str] = Query(None)):
    if store_id:
        row = await db.fetch_one(
            "SELECT * FROM agent_runs WHERE id = $1::uuid AND store_id = $2",
            run_id, store_id,
        )
    else:
        row = await db.fetch_one("SELECT * FROM agent_runs WHERE id = $1::uuid", run_id)
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")

    audit_rows = await db.fetch_all(
        "SELECT id, action, actor_type, changes, created_at FROM audit_logs WHERE run_id = $1::uuid ORDER BY created_at",
        run_id,
    )
    audit_logs = []
    for a in audit_rows:
        audit_logs.append({
            "id": str(a["id"]),
            "action": a["action"],
            "actor_type": a["actor_type"],
            "changes": a.get("changes", {}),
            "created_at": a["created_at"].isoformat() if a.get("created_at") else None,
        })

    def _parse_json(val):
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return {}
        return val or {}

    def _parse_json_list(val):
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return []
        return val or []

    return AgentRunDetailResponse(
        id=str(row["id"]),
        store_id=str(row["store_id"]),
        agent_name=row["agent_name"],
        status=row["status"],
        trigger=row.get("trigger", "manual"),
        input_payload=_parse_json(row.get("input_payload")),
        output_payload=_parse_json(row.get("output_payload")),
        actions_taken=_parse_json_list(row.get("actions_taken")),
        actions_proposed=_parse_json_list(row.get("actions_proposed")),
        artifacts=_parse_json_list(row.get("artifacts")),
        tokens_used=_parse_json(row.get("tokens_used")),
        duration_ms=row.get("duration_ms"),
        dry_run=row.get("dry_run", True),
        error=row.get("error"),
        started_at=row["started_at"].isoformat() if row.get("started_at") else "",
        completed_at=row["completed_at"].isoformat() if row.get("completed_at") else None,
        audit_logs=audit_logs,
    )


# ============================================================
# Scheduler
# ============================================================

@app.get("/agents/schedule")
async def get_schedule():
    return {
        "enabled": settings.SCHEDULER_ENABLED,
        "jobs": get_schedule_info(),
    }


@app.post("/agents/schedule/trigger")
async def trigger_scheduled_agent(agent_name: str = Query(...), store_id: str = Query(...)):
    """Force-trigger a scheduled agent run."""
    agent_cls = get_agent_class(agent_name)
    if not agent_cls:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")

    agent = agent_cls()
    ctx = AgentContext(
        store_id=store_id,
        run_id=str(uuid4()),
        trigger=TriggerType.SCHEDULE,
        dry_run=settings.DRY_RUN,
    )

    runner = AgentRunner()
    result = await runner.run(agent, ctx)

    return {
        "run_id": ctx.run_id,
        "agent_name": agent_name,
        "status": "completed" if result.success else "failed",
        "summary": result.summary,
    }
