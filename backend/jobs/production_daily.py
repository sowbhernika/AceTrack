"""
Acetech Escalation System - Daily Production Alert Job.

Queries yesterday's production output from ``baywise_output`` (movement
type 101), joins with ``pp_master`` to compute production value, compares
against targets, and sends WhatsApp alerts to active managers.
"""

from __future__ import annotations


import logging
import time
from datetime import datetime, timedelta

import pytz
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.alerts.templates import production_daily_message
from backend.alerts.whatsapp_sender import send_whatsapp
from backend.config import settings
from backend.db.models import (
    AlertLog,
    BaywiseOutput,
    Manager,
    PPMaster,
    ProductionPlan,
)

logger = logging.getLogger(__name__)

IST = pytz.timezone(settings.TIMEZONE)


def _yesterday_ist() -> str:
    """Return yesterday's date in ``YYYY-MM-DD`` (IST)."""
    return (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")


def _strip_leading_zeros(code: str | None) -> str:
    """Remove leading zeros from a material code for matching."""
    if not code:
        return ""
    return code.lstrip("0")


def run_production_daily_alert(db_session: Session) -> int:
    """Generate and send daily production WhatsApp alerts.

    Returns the total number of alerts dispatched.
    """
    yesterday = _yesterday_ist()
    logger.info("Running daily production alert for %s", yesterday)

    # ------------------------------------------------------------------
    # 1. Get yesterday's baywise rows (movement_type = 101)
    # ------------------------------------------------------------------
    baywise_rows = (
        db_session.query(BaywiseOutput)
        .filter(
            BaywiseOutput.posting_date == yesterday,
            BaywiseOutput.movement_type == "101",
        )
        .all()
    )

    if not baywise_rows:
        logger.info("No production data for %s", yesterday)
        return 0

    logger.info("%d baywise rows for %s", len(baywise_rows), yesterday)

    # ------------------------------------------------------------------
    # 2. Build a lookup of per-quantity prices from PPMaster
    #    Key = stripped material code, Value = per_qty_price
    # ------------------------------------------------------------------
    pp_rows = db_session.query(PPMaster).all()
    pp_price: dict[str, float] = {}
    for pp in pp_rows:
        stripped = _strip_leading_zeros(pp.material_code)
        if stripped and pp.per_qty_price is not None:
            pp_price[stripped] = pp.per_qty_price

    logger.info("PPMaster lookup: %d entries", len(pp_price))

    # ------------------------------------------------------------------
    # 3. Calculate production value per company
    # ------------------------------------------------------------------
    company_production: dict[str, float] = {}
    company_matched: dict[str, int] = {}

    for bw in baywise_rows:
        plant = (bw.plant or "").strip()
        company = settings.PLANT_TO_COMPANY.get(plant)
        if not company:
            continue

        stripped_material = _strip_leading_zeros(bw.material)
        price = pp_price.get(stripped_material, 0)
        qty = bw.qty_in_unit or 0
        value = qty * price

        company_production[company] = company_production.get(company, 0) + value

        if price > 0:
            company_matched[company] = company_matched.get(company, 0) + 1

    # Convert to lakhs
    production_lakhs: dict[str, float] = {
        co: round(val / 100_000, 2) for co, val in company_production.items()
    }

    # ------------------------------------------------------------------
    # 4. Get targets for yesterday per company
    # ------------------------------------------------------------------
    target_rows = (
        db_session.query(
            ProductionPlan.plant,
            func.sum(ProductionPlan.production_value_lakhs).label(
                "target_lakhs"
            ),
        )
        .filter(ProductionPlan.date == yesterday)
        .group_by(ProductionPlan.plant)
        .all()
    )

    targets_by_company: dict[str, float] = {}
    for row in target_rows:
        company = settings.PLANT_TO_COMPANY.get(row.plant)
        if company:
            targets_by_company[company] = (
                targets_by_company.get(company, 0) + (row.target_lakhs or 0)
            )

    # ------------------------------------------------------------------
    # 5. Send alerts
    # ------------------------------------------------------------------
    alerts_sent = 0

    for company in settings.VALID_COMPANIES:
        daily_prod = production_lakhs.get(company, 0)
        target = targets_by_company.get(company, 0)
        pct = round((daily_prod / target) * 100, 2) if target else 0
        gap = round(target - daily_prod, 2)
        priority = settings.calculate_priority(pct)
        location = settings.COMPANY_LOCATIONS.get(company, "")
        matched = company_matched.get(company, 0)

        data = {
            "company_code": company,
            "location": location,
            "production_date": yesterday,
            "daily_production_lakhs": daily_prod,
            "target_lakhs": target,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": priority,
            "manager_name": "",
            "matched_materials": matched,
        }

        managers = (
            db_session.query(Manager)
            .filter(
                Manager.company_code == company,
                Manager.is_active.is_(True),
            )
            .all()
        )

        if not managers:
            logger.info("No active managers for %s - skipping", company)
            continue

        for mgr in managers:
            data["manager_name"] = mgr.manager_name
            message = production_daily_message(data)

            result = send_whatsapp(mgr.manager_phone, message)
            status = result.get("status", "failed")

            alert_log = AlertLog(
                alert_type="production_daily",
                company_code=company,
                manager_name=mgr.manager_name,
                manager_phone=mgr.manager_phone,
                message_preview=message[:200],
                full_message=message,
                status=status,
                error_message=result.get("error"),
                performance_pct=pct,
                target_lakhs=target,
                actual_lakhs=daily_prod,
            )
            db_session.add(alert_log)
            alerts_sent += 1

            logger.info(
                "Production daily alert to %s (%s) - %s",
                mgr.manager_name,
                company,
                status,
            )

            # Human-like delays are handled inside send_whatsapp()

    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
        logger.exception("Failed to commit production daily alert logs")

    logger.info(
        "Daily production alert complete. %d alerts sent.", alerts_sent
    )
    return alerts_sent
