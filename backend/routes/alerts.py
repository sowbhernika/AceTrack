"""
AceTrack - Alert routes.

Provides endpoints to list alert logs and manually trigger alert jobs.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.alerts.whatsapp_sender import send_whatsapp
from backend.db.connection import SessionLocal, get_db
from backend.db.models import AlertLog
from backend.db.schemas import AlertLogResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


# ── List alert logs ────────────────────────────────────────────────────


@router.get("/logs", response_model=list[AlertLogResponse])
def list_alert_logs(
    limit: int = 50,
    offset: int = 0,
    alert_type: str | None = None,
    db: Session = Depends(get_db),
):
    """Return recent alert logs, newest first."""
    query = db.query(AlertLog).order_by(AlertLog.sent_at.desc())
    if alert_type:
        query = query.filter(AlertLog.alert_type == alert_type)
    return query.offset(offset).limit(limit).all()


# ── Send Now (trigger alerts manually) ─────────────────────────────────

VALID_ALERT_TYPES = {
    "sales_daily",
    "sales_mtd",
    "production_daily",
    "production_mtd",
    "all",
}


def _run_alert_job(alert_type: str) -> dict:
    """Run a specific alert job synchronously and return result."""
    db = SessionLocal()
    try:
        if alert_type == "sales_daily":
            from backend.jobs.sales_daily import run_sales_daily_alert
            count = run_sales_daily_alert(db)
        elif alert_type == "sales_mtd":
            from backend.jobs.sales_mtd import run_sales_mtd_alert
            count = run_sales_mtd_alert(db)
        elif alert_type == "production_daily":
            from backend.jobs.production_daily import run_production_daily_alert
            count = run_production_daily_alert(db)
        elif alert_type == "production_mtd":
            from backend.jobs.production_mtd import run_production_mtd_alert
            count = run_production_mtd_alert(db)
        else:
            return {"error": f"Unknown alert type: {alert_type}"}

        logger.info("Manual trigger: %s completed, %d alerts sent", alert_type, count or 0)
        return {"alert_type": alert_type, "alerts_sent": count or 0, "status": "completed"}
    except Exception as exc:
        logger.exception("Manual trigger failed for %s", alert_type)
        return {"alert_type": alert_type, "alerts_sent": 0, "status": "failed", "error": str(exc)}
    finally:
        db.close()


# Store status of background send-now tasks
_send_now_status: dict[str, dict] = {}


def _run_all_alerts_background(task_id: str) -> None:
    """Run all alert jobs sequentially in background."""
    results = []
    for atype in ["sales_daily", "sales_mtd", "production_daily", "production_mtd"]:
        _send_now_status[task_id] = {
            "status": "running",
            "current": atype,
            "results": results,
        }
        result = _run_alert_job(atype)
        results.append(result)

    _send_now_status[task_id] = {
        "status": "completed",
        "results": results,
        "total_sent": sum(r.get("alerts_sent", 0) for r in results),
    }


def _run_single_alert_background(task_id: str, alert_type: str) -> None:
    """Run a single alert job in background."""
    _send_now_status[task_id] = {"status": "running", "current": alert_type}
    result = _run_alert_job(alert_type)
    _send_now_status[task_id] = {
        "status": "completed",
        "results": [result],
        "total_sent": result.get("alerts_sent", 0),
    }


@router.post("/send-now")
def send_now(
    alert_type: str = "all",
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Manually trigger alert jobs.

    - ``alert_type``: one of ``sales_daily``, ``sales_mtd``,
      ``production_daily``, ``production_mtd``, or ``all`` (default).

    Jobs run in the background. Returns a task_id to poll status.
    """
    if alert_type not in VALID_ALERT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid alert_type. Must be one of: {', '.join(sorted(VALID_ALERT_TYPES))}",
        )

    import uuid
    task_id = str(uuid.uuid4())[:8]

    if alert_type == "all":
        background_tasks.add_task(_run_all_alerts_background, task_id)
    else:
        background_tasks.add_task(_run_single_alert_background, task_id, alert_type)

    return {
        "message": f"Alert job '{alert_type}' triggered in background.",
        "task_id": task_id,
        "status": "started",
    }


@router.get("/send-now/status/{task_id}")
def send_now_status(task_id: str):
    """Check the status of a send-now task."""
    if task_id not in _send_now_status:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found.",
        )
    return _send_now_status[task_id]


# ── Failed Messages Management ─────────────────────────────────────────


@router.get("/failed")
def get_failed_alerts(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
):
    """Get paginated list of failed alerts."""
    offset = (page - 1) * limit
    
    failed_alerts = (
        db.query(AlertLog)
        .filter(AlertLog.status == "failed")
        .order_by(desc(AlertLog.sent_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    total_count = (
        db.query(AlertLog)
        .filter(AlertLog.status == "failed")
        .count()
    )
    
    return {
        "alerts": [
            {
                "id": alert.id,
                "alert_type": alert.alert_type,
                "company_code": alert.company_code,
                "manager_name": alert.manager_name,
                "manager_phone": alert.manager_phone,
                "message_preview": alert.message_preview,
                "error_message": alert.error_message,
                "sent_at": alert.sent_at.isoformat(),
                "resend_count": alert.resend_count or 0,
                "resent_at": alert.resent_at.isoformat() if alert.resent_at else None,
                "performance_pct": alert.performance_pct,
                "target_lakhs": alert.target_lakhs,
                "actual_lakhs": alert.actual_lakhs,
            }
            for alert in failed_alerts
        ],
        "total": total_count,
        "page": page,
        "limit": limit,
        "has_next": offset + limit < total_count,
    }


@router.post("/resend/{alert_id}")
def resend_alert(alert_id: int, db: Session = Depends(get_db)):
    """Resend a failed alert."""
    alert = db.query(AlertLog).filter(AlertLog.id == alert_id).first()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    if not alert.full_message:
        raise HTTPException(
            status_code=400, 
            detail="Cannot resend: original message content not available"
        )
    
    if not alert.manager_phone:
        raise HTTPException(
            status_code=400, 
            detail="Cannot resend: manager phone number not available"
        )
    
    # Attempt to resend the message
    result = send_whatsapp(alert.manager_phone, alert.full_message)
    
    # Create new alert log entry for the resend attempt
    resend_alert_entry = AlertLog(
        alert_type=alert.alert_type,
        company_code=alert.company_code,
        manager_name=alert.manager_name,
        manager_phone=alert.manager_phone,
        message_preview=alert.message_preview,
        full_message=alert.full_message,
        status=result.get("status", "failed"),
        error_message=result.get("error"),
        performance_pct=alert.performance_pct,
        target_lakhs=alert.target_lakhs,
        actual_lakhs=alert.actual_lakhs,
        original_alert_id=alert.id,
    )
    
    # Update original alert's resend tracking
    alert.resend_count = (alert.resend_count or 0) + 1
    alert.resent_at = datetime.utcnow()
    
    # If resend was successful, update original alert status to success
    if result.get("status") == "success":
        alert.status = "success"
        # Keep original error message for history but clear it since it's now successful
        # alert.error_message = None  # Keep for audit trail
    
    db.add(resend_alert_entry)
    db.commit()
    
    logger.info(
        "Alert %d resent to %s (%s) - Status: %s",
        alert_id,
        alert.manager_name,
        alert.manager_phone,
        result.get("status"),
    )
    
    return {
        "success": result.get("status") == "success",
        "status": result.get("status"),
        "error": result.get("error"),
        "resend_alert_id": resend_alert_entry.id,
        "new_resend_count": alert.resend_count,
    }


@router.get("/stats")
def get_alert_stats(db: Session = Depends(get_db)):
    """Get alert statistics."""
    total_alerts = db.query(AlertLog).count()
    failed_alerts = db.query(AlertLog).filter(AlertLog.status == "failed").count()
    success_alerts = db.query(AlertLog).filter(AlertLog.status == "success").count()
    
    # Get resend statistics
    resent_alerts = db.query(AlertLog).filter(AlertLog.resend_count > 0).count()
    successfully_resent = (
        db.query(AlertLog)
        .filter(
            AlertLog.resend_count > 0,
            AlertLog.status == "success"
        )
        .count()
    )
    
    # Get recent failures (last 24 hours)
    from datetime import timedelta
    cutoff_time = datetime.utcnow() - timedelta(hours=24)
    recent_failures = (
        db.query(AlertLog)
        .filter(
            AlertLog.status == "failed",
            AlertLog.sent_at >= cutoff_time
        )
        .count()
    )
    
    return {
        "total_alerts": total_alerts,
        "failed_alerts": failed_alerts,
        "success_alerts": success_alerts,
        "resent_alerts": resent_alerts,
        "successfully_resent": successfully_resent,
        "success_rate": round((success_alerts / total_alerts) * 100, 2) if total_alerts > 0 else 0,
        "recent_failures_24h": recent_failures,
    }
