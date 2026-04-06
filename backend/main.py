"""
AceTrack - FastAPI Application Entry Point.

Run with::

    uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.db.connection import create_all_tables

logger = logging.getLogger(__name__)

# ── Logging setup ───────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

# ── Lifespan (startup / shutdown) ──────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables and start the scheduler.  Shutdown: clean up."""

    # -- Startup ----------------------------------------------------------
    logger.info("Starting AceTrack API ...")
    create_all_tables()

    # Start APScheduler (safe import; jobs package may not exist yet)
    try:
        from backend.jobs.scheduler import start_scheduler  # type: ignore[import-untyped]

        start_scheduler()
        logger.info("Background scheduler started.")
    except (ImportError, ModuleNotFoundError):
        logger.warning(
            "Scheduler module not found (backend.jobs.scheduler). "
            "Background jobs will not run."
        )
    except Exception:
        logger.exception("Failed to start scheduler.")

    yield  # ← app is running

    # -- Shutdown ---------------------------------------------------------
    logger.info("Shutting down AceTrack API ...")
    try:
        from backend.jobs.scheduler import shutdown_scheduler  # type: ignore[import-untyped]

        shutdown_scheduler()
    except (ImportError, ModuleNotFoundError, Exception):
        pass


# ── FastAPI app ─────────────────────────────────────────────────────────

app = FastAPI(
    title="AceTrack API",
    description=(
        "Backend for AceTrack - Acetech India Sales & Production "
        "Monitoring System.  Tracks performance across AMC, APE, and AHF "
        "companies and sends WhatsApp alerts via WaSender."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ─────────────────────────────────────────────────────────────
# Each router is imported inside a try/except so the app can boot even
# when a route module has not been created yet.

_routers: list[tuple[str, str]] = [
    ("backend.routes.managers", "router"),
    ("backend.routes.uploads", "router"),
    ("backend.routes.dashboard", "router"),
    ("backend.routes.alerts", "router"),
]

for _module_path, _attr in _routers:
    try:
        import importlib

        _mod = importlib.import_module(_module_path)
        _router = getattr(_mod, _attr)
        app.include_router(_router)
        logger.info("Registered router: %s", _module_path)
    except (ImportError, ModuleNotFoundError, AttributeError):
        logger.warning("Router not available yet: %s", _module_path)


# ── Health check ────────────────────────────────────────────────────────


@app.get("/health", tags=["Health"])
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok", "service": "AceTrack API"}
