import asyncio
from contextlib import asynccontextmanager

from fastapi import HTTPException

# ponytail: in-memory dict is correct only for the single-process Render
# deploy — Redis is the upgrade if this ever scales to multiple workers.
_locks: dict[str, asyncio.Lock] = {}


@asynccontextmanager
async def project_llm_slot(project_id: str):
    """At most one in-flight LLM call per project. A second overlapping call
    is rejected immediately (429) rather than queued."""
    lock = _locks.setdefault(project_id, asyncio.Lock())
    if lock.locked():
        raise HTTPException(
            status_code=429,
            detail="Another AI request is already running for this project.",
            headers={"Retry-After": "5"},
        )
    async with lock:
        yield
