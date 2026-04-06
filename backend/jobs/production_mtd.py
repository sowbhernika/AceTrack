"""
Acetech Escalation System - MTD Production Alert Job.

Calculates cumulative month-to-date production output (movement type 101)
against targets across the billing cycle and sends WhatsApp alerts.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, datetime, timedelta

import pytz
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.alerts.templates import production_mtd_message
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


# ---------------------------------------------------------------------------
# Billing-cycle helpers
# ---------------------------------------------------------------------------

def _billing_cycle_range(reference: date | None = None) -> tuple[date, date]:
    """Return ``(cycle_start, cycle_end)`` for the cycle containing *reference*."""
    if reference is None:
        reference = datetime.now(IST).date()

    if reference.day >= 26:
        start = reference.replace(day=26)
        if reference.month == 12:
            end = date(reference.year + 1, 1, 25)
        else:
            end = date(reference.year, reference.month + 1, 25)
    else:
        if reference.month == 1:
            start = date(reference.year - 1, 12, 26)
        else:
            start = date(reference.year, reference.month - 1, 26)
        end = reference.replace(day=25)

    return start, end


def _strip_leading_zeros(code: str | None) -> str:
    """Remove leading zeros from a material code for matching."""
    if not code:
        return ""
    return code.lstrip("0")


# ---------------------------------------------------------------------------
# Main job
# ---------------------------------------------------------------------------

def run_production_mtd_alert(db_session: Session) -> int:
    """Generate and send MTD production WhatsApp alerts.

    Returns the total number of alerts dispatched.
    """
    yesterday = (datetime.now(IST) - timedelta(days=1)).date()
    cycle_start, cycle_end = _billing_cycle_range(yesterday)
    total_cycle_days = (cycle_end - cycle_start).days + 1
    day_number = (yesterday - cycle_start).days + 1

    start_str = cycle_start.isoformat()
    yesterday_str = yesterday.isoformat()

    logger.info(
        "Running MTD production alert | cycle %s to %s | day %d/%d",
        start_str,
        cycle_end.isoformat(),
        day_number,
        total_cycle_days,
    )

    # ------------------------------------------------------------------
    # 1. Get baywise rows in range (movement_type = 101)
    # ------------------------------------------------------------------
    baywise_rows = (
        db_session.query(BaywiseOutput)
        .filter(
            BaywiseOutput.posting_date >= start_str,
            BaywiseOutput.posting_date <= yesterday_str,
            BaywiseOutput.movement_type == "101",
        )
        .all()
    )

    if not baywise_rows:
        logger.info("No production data for cycle %s to %s", start_str, yesterday_str)
        return 0

    logger.info("%d baywise rows in MTD range", len(baywise_rows))

    # ------------------------------------------------------------------
    # 2. PPMaster price lookup
    # ------------------------------------------------------------------
    pp_rows = db_session.query(PPMaster).all()
    pp_price: dict[str, float] = {}
    for pp in pp_rows:
        stripped = _strip_leading_zeros(pp.material_code)
        if stripped and pp.per_qty_price is not None:
            pp_price[stripped] = pp.per_qty_price

    # ------------------------------------------------------------------
    # 3. Calculate cumulative production value per company
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

    production_lakhs: dict[str, float] = {
        co: round(val / 100_000, 2) for co, val in company_production.items()
    }

    # ------------------------------------------------------------------
    # 4. Cumulative targets per company (cycle_start to yesterday)
    # ------------------------------------------------------------------
    target_rows = (
        db_session.query(
            ProductionPlan.plant,
            func.sum(ProductionPlan.production_value_lakhs).label(
                "target_lakhs"
            ),
        )
        .filter(
            ProductionPlan.date >= start_str,
            ProductionPlan.date <= yesterday_str,
        )
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
        mtd_prod = production_lakhs.get(company, 0)
        mtd_target = targets_by_company.get(company, 0)
        pct = round((mtd_prod / mtd_target) * 100, 2) if mtd_target else 0
        gap = round(mtd_target - mtd_prod, 2)
        daily_avg = round(mtd_prod / day_number, 2) if day_number else 0
        remaining_days = total_cycle_days - day_number
        projected = round(mtd_prod + (daily_avg * remaining_days), 2)
        priority = settings.calculate_priority(pct)
        location = settings.COMPANY_LOCATIONS.get(company, "")
        matched = company_matched.get(company, 0)

        data = {
            "company_code": company,
            "location": location,
            "mtd_production_lakhs": mtd_prod,
            "mtd_target_lakhs": mtd_target,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": priority,
            "manager_name": "",
            "day_number": day_number,
            "total_cycle_days": total_cycle_days,
            "daily_avg": daily_avg,
            "projected": projected,
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
            message = production_mtd_message(data)

            result = asyncio.get_event_loop().run_until_complete(
                send_whatsapp(mgr.manager_phone, message)
            )
            status = result.get("status", "failed")

            alert_log = AlertLog(
                alert_type="production_mtd",
                company_code=company,
                manager_name=mgr.manager_name,
                manager_phone=mgr.manager_phone,
                message_preview=message[:200],
                status=status,
                error_message=result.get("error"),
                performance_pct=pct,
                target_lakhs=mtd_target,
                actual_lakhs=mtd_prod,
            )
            db_session.add(alert_log)
            alerts_sent += 1

            logger.info(
                "Production MTD alert to %s (%s) - %s",
                mgr.manager_name,
                company,
                status,
            )

            time.sleep(2)

    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
        logger.exception("Failed to commit production MTD alert logs")

    logger.info(
        "MTD production alert complete. %d alerts sent.", alerts_sent
    )
    return alerts_sent
