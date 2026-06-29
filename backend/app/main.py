from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.core.csrf import CSRFMiddleware
from app.core.rate_limit import limiter
from app.db.mongodb import connect_db, close_db
from app.routers import auth, projects, gdd, systems, assets, playtest, deployment


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
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
)

# Routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(gdd.router)
app.include_router(systems.router)
app.include_router(assets.router)
app.include_router(playtest.router)
app.include_router(playtest.bugs_router)
app.include_router(deployment.router)
app.include_router(deployment.export_router)


@app.get("/")
async def root():
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
