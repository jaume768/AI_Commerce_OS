from __future__ import annotations
import asyncio
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from uuid import uuid4

from app.config import settings
from app.models.agent import AgentContext, TriggerType
from app.agents.registry import get_agent_class
from app.services.runner import AgentRunner
from app import db

log = structlog.get_logger(service="agent-service", module="scheduler")

_scheduler: AsyncIOScheduler | None = None


async def _get_default_store_id() -> str | None:
    row = await db.fetch_one(
        "SELECT id FROM stores WHERE status = 'active' ORDER BY created_at LIMIT 1"
    )
    return str(row["id"]) if row else None


async def _run_scheduled_agent(agent_name: str):
    """Run an agent as a scheduled job."""
    run_log = log.bind(agent=agent_name, trigger="schedule")
    run_log.info("scheduled_agent_triggered")

    store_id = await _get_default_store_id()
    if not store_id:
        run_log.error("no_active_store_found")
        return

    agent_cls = get_agent_class(agent_name)
    if not agent_cls:
        run_log.error("agent_not_found", agent_name=agent_name)
        return

    agent = agent_cls()
    ctx = AgentContext(
        store_id=store_id,
        run_id=str(uuid4()),
        trigger=TriggerType.SCHEDULE,
        dry_run=settings.DRY_RUN,
    )

    runner = AgentRunner()
    result = await runner.run(agent, ctx)

    run_log.info(
        "scheduled_agent_completed",
        success=result.success,
        summary=result.summary[:200],
        actions_taken=len(result.actions_taken),
        actions_proposed=len(result.actions_proposed),
    )


def setup_scheduler() -> AsyncIOScheduler | None:
    global _scheduler
    if not settings.SCHEDULER_ENABLED:
        log.info("scheduler_disabled")
        return None

    _scheduler = AsyncIOScheduler()

    # Reporting agent: daily at configured hour
    _scheduler.add_job(
        lambda: asyncio.ensure_future(_run_scheduled_agent("reporting")),
        trigger=CronTrigger(
            hour=settings.REPORTING_SCHEDULE_HOUR,
            minute=settings.REPORTING_SCHEDULE_MINUTE,
        ),
        id="reporting_daily",
        name="Daily Reporting Agent",
        replace_existing=True,
    )

    # Support agent (email check): daily at configured hour
    _scheduler.add_job(
        lambda: asyncio.ensure_future(_run_scheduled_agent("support")),
        trigger=CronTrigger(
            hour=settings.SUPPORT_EMAIL_SCHEDULE_HOUR,
            minute=settings.SUPPORT_EMAIL_SCHEDULE_MINUTE,
        ),
        id="support_email_daily",
        name="Daily Support Email Check",
        replace_existing=True,
    )

    _scheduler.start()
    log.info(
        "scheduler_started",
        reporting_schedule=f"{settings.REPORTING_SCHEDULE_HOUR:02d}:{settings.REPORTING_SCHEDULE_MINUTE:02d}",
        support_schedule=f"{settings.SUPPORT_EMAIL_SCHEDULE_HOUR:02d}:{settings.SUPPORT_EMAIL_SCHEDULE_MINUTE:02d}",
    )
    return _scheduler


def shutdown_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        log.info("scheduler_stopped")


def get_schedule_info() -> list[dict]:
    if not _scheduler:
        return []
    jobs = []
    for job in _scheduler.get_jobs():
        trigger = job.trigger
        next_run = job.next_run_time
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": next_run.isoformat() if next_run else None,
            "trigger": str(trigger),
        })
    return jobs
