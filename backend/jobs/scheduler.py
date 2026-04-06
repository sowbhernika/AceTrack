"""
Acetech Escalation System - APScheduler Configuration.

Defines the daily cron schedule for data loading, cleanup, and alert
dispatch.  Each job creates its own database session, executes the
relevant function, and ensures the session is closed regardless of outcome.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.config import settings
from backend.db.connection import SessionLocal

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None

TZ = settings.TIMEZONE  # "Asia/Kolkata"


# ---------------------------------------------------------------------------
# Generic wrapper that gives each job its own DB session
# ---------------------------------------------------------------------------

def _run_with_session(job_fn, job_name: str) -> None:
    """Execute *job_fn(db_session)* inside a fresh session with logging."""
    logger.info("=== JOB START: %s ===", job_name)
    db = SessionLocal()
    try:
        result = job_fn(db)
        logger.info("=== JOB END: %s | result=%s ===", job_name, result)
    except Exception:
        logger.exception("=== JOB FAILED: %s ===", job_name)
    finally:
        db.close()


def _run_no_session(job_fn, job_name: str) -> None:
    """Execute *job_fn()* (no DB session required) with logging."""
    logger.info("=== JOB START: %s ===", job_name)
    try:
        result = job_fn()
        logger.info("=== JOB END: %s | result=%s ===", job_name, result)
    except Exception:
        logger.exception("=== JOB FAILED: %s ===", job_name)


# ---------------------------------------------------------------------------
# Individual job wrappers (so APScheduler can pickle / reference them)
# ---------------------------------------------------------------------------

def _job_clear_sales():
    from backend.jobs.cleanup import clear_sales_data
    _run_with_session(clear_sales_data, "clear_sales_data")


def _job_clear_baywise():
    from backend.jobs.cleanup import clear_baywise_data
    _run_with_session(clear_baywise_data, "clear_baywise_data")


def _job_load_baywise():
    from backend.jobs.load_baywise import load_baywise_from_file
    _run_with_session(load_baywise_from_file, "load_baywise_from_file")


def _job_load_sales():
    from backend.jobs.load_sales import load_sales_from_file
    _run_with_session(load_sales_from_file, "load_sales_from_file")


def _job_production_daily():
    from backend.jobs.production_daily import run_production_daily_alert
    _run_with_session(run_production_daily_alert, "run_production_daily_alert")


def _job_sales_daily():
    from backend.jobs.sales_daily import run_sales_daily_alert
    _run_with_session(run_sales_daily_alert, "run_sales_daily_alert")


def _job_sales_mtd():
    from backend.jobs.sales_mtd import run_sales_mtd_alert
    _run_with_session(run_sales_mtd_alert, "run_sales_mtd_alert")


def _job_production_mtd():
    from backend.jobs.production_mtd import run_production_mtd_alert
    _run_with_session(run_production_mtd_alert, "run_production_mtd_alert")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def start_scheduler() -> BackgroundScheduler:
    """Create, configure, and start the APScheduler instance.

    The schedule (all times Asia/Kolkata):

    ========  ================================
    Time      Job
    ========  ================================
    07:50 AM  Clear sales_by_billing table
    07:55 AM  Clear baywise_output table
    08:00 AM  Load baywise CSV
    08:10 AM  Load sales CSV
    08:15 AM  Production daily alert
    08:30 AM  Sales daily alert
    09:00 AM  Sales MTD alert
    09:20 AM  Production MTD alert
    ========  ================================
    """
    global _scheduler  # noqa: PLW0603

    if _scheduler is not None and _scheduler.running:
        logger.warning("Scheduler is already running")
        return _scheduler

    _scheduler = BackgroundScheduler(timezone=TZ)

    # --- Data cleanup ---------------------------------------------------------
    _scheduler.add_job(
        _job_clear_sales,
        trigger=CronTrigger(hour=7, minute=50, timezone=TZ),
        id="clear_sales_data",
        name="Clear sales_by_billing table",
        replace_existing=True,
        misfire_grace_time=300,
    )
    _scheduler.add_job(
        _job_clear_baywise,
        trigger=CronTrigger(hour=7, minute=55, timezone=TZ),
        id="clear_baywise_data",
        name="Clear baywise_output table",
        replace_existing=True,
        misfire_grace_time=300,
    )

    # --- CSV loading ----------------------------------------------------------
    _scheduler.add_job(
        _job_load_baywise,
        trigger=CronTrigger(hour=8, minute=0, timezone=TZ),
        id="load_baywise_from_file",
        name="Load baywise CSV",
        replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.add_job(
        _job_load_sales,
        trigger=CronTrigger(hour=8, minute=10, timezone=TZ),
        id="load_sales_from_file",
        name="Load sales CSV",
        replace_existing=True,
        misfire_grace_time=600,
    )

    # --- Alert jobs -----------------------------------------------------------
    _scheduler.add_job(
        _job_production_daily,
        trigger=CronTrigger(hour=8, minute=15, timezone=TZ),
        id="run_production_daily_alert",
        name="Production daily alert",
        replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.add_job(
        _job_sales_daily,
        trigger=CronTrigger(hour=8, minute=30, timezone=TZ),
        id="run_sales_daily_alert",
        name="Sales daily alert",
        replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.add_job(
        _job_sales_mtd,
        trigger=CronTrigger(hour=9, minute=0, timezone=TZ),
        id="run_sales_mtd_alert",
        name="Sales MTD alert",
        replace_existing=True,
        misfire_grace_time=600,
    )
    _scheduler.add_job(
        _job_production_mtd,
        trigger=CronTrigger(hour=9, minute=20, timezone=TZ),
        id="run_production_mtd_alert",
        name="Production MTD alert",
        replace_existing=True,
        misfire_grace_time=600,
    )

    _scheduler.start()
    logger.info("Scheduler started with %d jobs", len(_scheduler.get_jobs()))

    for job in _scheduler.get_jobs():
        logger.info(
            "  Scheduled: %-35s  next run: %s", job.name, job.next_run_time
        )

    return _scheduler


def get_scheduler() -> BackgroundScheduler | None:
    """Return the current scheduler instance (or *None* if not started)."""
    return _scheduler


def shutdown_scheduler() -> None:
    """Gracefully shut down the scheduler if it is running."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")
        _scheduler = None
