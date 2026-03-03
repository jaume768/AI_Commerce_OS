import asyncpg
import structlog
from app.config import settings

log = structlog.get_logger(service="agent-service", module="db")

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            settings.DATABASE_URL,
            min_size=2,
            max_size=10,
        )
        log.info("database_pool_created")
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        log.info("database_pool_closed")


async def fetch_all(query: str, *args) -> list[dict]:
    pool = await get_pool()
    rows = await pool.fetch(query, *args)
    return [dict(r) for r in rows]


async def fetch_one(query: str, *args) -> dict | None:
    pool = await get_pool()
    row = await pool.fetchrow(query, *args)
    return dict(row) if row else None


async def execute(query: str, *args):
    pool = await get_pool()
    return await pool.execute(query, *args)


async def fetch_val(query: str, *args):
    pool = await get_pool()
    return await pool.fetchval(query, *args)
