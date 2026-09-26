import logging
import time

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.rate_limit import limiter, LLM_RATE_LIMIT
from app.db.mongodb import connect_db, close_db, get_db
from app.prompts.health_prompt import HEALTH_SYSTEM_PROMPT, HEALTH_USER_PROMPT
from app.routers import auth, oauth, projects, gdd, systems, assets, playtest, deployment, unity
from app.routers.auth import get_current_user
from app.services.llm_utils import complete
from scripts.migrate_emails import migrate as migrate_emails
from scripts.migrate_stages import migrate as migrate_stages

perf_logger = logging.getLogger("app.perf")
startup_logger = logging.getLogger("app.startup")


class TimingMiddleware(BaseHTTPMiddleware):
    """Logs method, path, and duration for every request — measurement only, no behavior change."""

    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        perf_logger.info(
            "request method=%s path=%s duration_ms=%.1f",
            request.method,
            request.url.path,
            duration_ms,
        )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    try:
        # ponytail: scans every project/asset doc each boot — fine at hundreds of
        # docs; move to a one-off run once prod is fully migrated. Never blocks
        # startup: ProjectOut's own legacy-stage mapping is the real safety net.
        await migrate_stages(get_db())
    except Exception:
        startup_logger.exception("Stage migration on startup failed; continuing")
    try:
        await migrate_emails(get_db())
    except Exception:
        startup_logger.exception("Email migration on startup failed; continuing")
    yield
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="GameGold API — AI-powered game design platform",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(CSRFMiddleware)

# CORS — added last so it wraps outermost and still sets headers on
# responses from the middleware above (rate limit / CSRF rejections included).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],  # export bundle filename
)

# Added last so it wraps outermost and times the full request, CORS included.
app.add_middleware(TimingMiddleware)

# Routers
app.include_router(auth.router)
app.include_router(oauth.router)
app.include_router(projects.router)
app.include_router(gdd.router)
app.include_router(systems.router)
app.include_router(assets.router)
app.include_router(playtest.router)
app.include_router(playtest.bugs_router)
app.include_router(deployment.router)
app.include_router(deployment.export_router)
app.include_router(unity.router)
app.include_router(unity.templates_router)


@app.get("/")
async def root():
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/health/llm")
@limiter.limit(LLM_RATE_LIMIT)
async def health_llm(request: Request, response: Response, _user: dict = Depends(get_current_user)):
    """One tiny real completion, so a retired/misconfigured model shows up in one click.
    Auth-gated: every hit costs a (tiny) LLM call."""
    start = time.perf_counter()
    try:
        await complete(HEALTH_SYSTEM_PROMPT, HEALTH_USER_PROMPT, max_tokens=5)
    except ValueError as exc:
        # complete() wraps provider errors; the cause's class (NotFoundError, AuthenticationError…) is the signal.
        raise HTTPException(status_code=503, detail={
            "ok": False, "model": settings.llm_model, "error": type(exc.__cause__ or exc).__name__,
        })
    return {"ok": True, "model": settings.llm_model, "latency_ms": round((time.perf_counter() - start) * 1000)}
