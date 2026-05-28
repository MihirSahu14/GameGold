from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.db.mongodb import connect_db, close_db
from app.routers import auth, projects, gdd


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

# CORS
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


@app.get("/")
async def root():
    return {"status": "ok", "app": settings.app_name, "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
