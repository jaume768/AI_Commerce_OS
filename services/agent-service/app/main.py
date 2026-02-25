import structlog
from datetime import datetime
from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.config import settings

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
    log.info("agent-service starting", dry_run=settings.DRY_RUN)
    yield
    log.info("agent-service shutting down")


app = FastAPI(
    title="AI Commerce OS — Agent Service",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "agent-service",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/ready")
async def ready():
    # Future: check DB + Redis connectivity
    return {
        "status": "ready",
        "service": "agent-service",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/plan")
async def create_plan(payload: dict):
    """
    Placeholder for agent planning endpoint.
    Will be implemented in Fase 6 (agent orchestration).
    """
    log.info("plan_requested", payload=payload, dry_run=settings.DRY_RUN)
    return {
        "status": "stub",
        "message": "Agent planning not yet implemented (Fase 6+)",
        "dry_run": settings.DRY_RUN,
        "received": payload,
    }
