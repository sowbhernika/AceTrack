"""
Acetech Escalation System - Daily Sales Alert Job.

Queries yesterday's sales, compares against targets, and sends WhatsApp
alerts to every active manager in each company.
"""

from __future__ import annotations


import logging
from datetime import datetime, timedelta

import pytz
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.alerts.templates import sales_daily_message
from backend.alerts.whatsapp_sender import send_whatsapp
from backend.config import settings
from backend.db.models import (
    AlertLog,
    Manager,
    ProductionPlan,
    SalesByBilling,
)

logger = logging.getLogger(__name__)

IST = pytz.timezone(settings.TIMEZONE)


def _yesterday_ist() -> str:
    """Return yesterday's date in ``YYYY-MM-DD`` (IST)."""
    return (datetime.now(IST) - timedelta(days=1)).strftime("%Y-%m-%d")


def run_sales_daily_alert(db_session: Session) -> int:
    """Generate and send daily sales WhatsApp alerts.

    Returns the total number of alerts sent (successful + failed).
    """
    yesterday = _yesterday_ist()
    logger.info("Running daily sales alert for %s", yesterday)

    # ------------------------------------------------------------------
    # 1. Aggregate yesterday's sales per company
    # ------------------------------------------------------------------
    sales_rows = (
        db_session.query(
            SalesByBilling.company_code,
            func.sum(SalesByBilling.converted_tax).label("total_converted_tax"),
            func.count(SalesByBilling.id).label("transaction_count"),
            func.count(func.distinct(SalesByBilling.customer)).label(
                "unique_customers"
            ),
        )
        .filter(SalesByBilling.billing_date == yesterday)
        .filter(SalesByBilling.company_code.isnot(None))
        .group_by(SalesByBilling.company_code)
        .all()
    )

    sales_by_company: dict[str, dict] = {}
    for row in sales_rows:
        total = row.total_converted_tax or 0
        sales_by_company[row.company_code] = {
            "daily_sales_lakhs": round(total / 100_000, 2),
            "transaction_count": row.transaction_count,
            "unique_customers": row.unique_customers,
        }

    logger.info(
        "Sales data found for companies: %s", list(sales_by_company.keys())
    )

    # ------------------------------------------------------------------
    # 2. Get targets for yesterday per company
    # ------------------------------------------------------------------
    target_rows = (
        db_session.query(
            ProductionPlan.plant,
            func.sum(ProductionPlan.sales_value_lakhs).label("target_lakhs"),
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
    # 3. For every valid company, send alerts to active managers
    # ------------------------------------------------------------------
    alerts_sent = 0

    for company in settings.VALID_COMPANIES:
        sales_info = sales_by_company.get(company, {})
        daily_sales = sales_info.get("daily_sales_lakhs", 0)
        target = targets_by_company.get(company, 0)
        pct = round((daily_sales / target) * 100, 2) if target else 0
        gap = round(target - daily_sales, 2)
        priority = settings.calculate_priority(pct)
        location = settings.COMPANY_LOCATIONS.get(company, "")

        data = {
            "company_code": company,
            "location": location,
            "sales_date": yesterday,
            "daily_sales_lakhs": daily_sales,
            "target_lakhs": target,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": priority,
            "manager_name": "",
            "transaction_count": sales_info.get("transaction_count", 0),
            "unique_customers": sales_info.get("unique_customers", 0),
        }

        # Fetch active managers for this company
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
            message = sales_daily_message(data)

            result = send_whatsapp(mgr.manager_phone, message)
            status = result.get("status", "failed")

            # Log to DB
            alert_log = AlertLog(
                alert_type="sales_daily",
                company_code=company,
                manager_name=mgr.manager_name,
                manager_phone=mgr.manager_phone,
                message_preview=message[:200],
                full_message=message,
                status=status,
                error_message=result.get("error"),
                performance_pct=pct,
                target_lakhs=target,
                actual_lakhs=daily_sales,
            )
            db_session.add(alert_log)
            alerts_sent += 1

            logger.info(
                "Sales daily alert to %s (%s) - %s",
                mgr.manager_name,
                company,
                status,
            )

            # Human-like delays are handled inside send_whatsapp()

    try:
        db_session.commit()
    except Exception:
        db_session.rollback()
        logger.exception("Failed to commit alert logs")

    logger.info("Daily sales alert complete. %d alerts sent.", alerts_sent)
    return alerts_sent
