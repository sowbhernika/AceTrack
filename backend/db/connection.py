"""
Acetech Escalation System - Database Connection & Session Management.

Provides:
- ``engine``        – the SQLAlchemy async-compatible engine
- ``SessionLocal``  – scoped session factory
- ``get_db()``      – FastAPI dependency that yields a session per request
- ``create_all_tables()`` – creates every table defined in models.py
"""

from __future__ import annotations

import logging
from collections.abc import Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.config import settings
from backend.db.models import Base

logger = logging.getLogger(__name__)

# ── Engine ──────────────────────────────────────────────────────────────

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    echo=False,
)

# ── Session factory ─────────────────────────────────────────────────────

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

# ── FastAPI dependency ──────────────────────────────────────────────────


def get_db() -> Generator[Session, Any, None]:
    """Yield a database session and ensure it is closed after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Table creation ──────────────────────────────────────────────────────


def create_all_tables() -> None:
    """Create all tables that do not yet exist in the database."""
    logger.info("Creating database tables (if not present) ...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready.")
