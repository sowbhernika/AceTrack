"""
Acetech Escalation System - Dashboard routes.

Provides aggregated views for the monitoring dashboard: summary statistics,
daily and month-to-date sales/production performance per company, and
alert history.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytz
from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.connection import get_db
from backend.db.models import (
    AlertLog,
    BaywiseOutput,
    Manager,
    PPMaster,
    ProductionPlan,
    SalesByBilling,
)
from backend.routes.uploads import get_billing_cycle

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

# ---------------------------------------------------------------------------
# Constants & helpers
# ---------------------------------------------------------------------------

_IST = pytz.timezone(settings.TIMEZONE)

PLANT_TO_COMPANY = settings.PLANT_TO_COMPANY
COMPANY_LOCATIONS = settings.COMPANY_LOCATIONS
ALL_COMPANIES = list(COMPANY_LOCATIONS.keys())


def _yesterday_ist() -> date:
    """Return yesterday's date in IST."""
    return datetime.now(_IST).date() - timedelta(days=1)


def _plants_for_company(company_code: str) -> list[str]:
    """Return the list of plants that map to the given company code."""
    return [p for p, c in PLANT_TO_COMPANY.items() if c == company_code]


def _calculate_priority(pct: float) -> str:
    return settings.calculate_priority(pct)


def _performance_pct(actual: float, target: float) -> float:
    if target == 0:
        return 0.0 if actual == 0 else 100.0
    return round((actual / target) * 100, 2)


# ---------------------------------------------------------------------------
# GET /stats
# ---------------------------------------------------------------------------

@router.get("/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    """Return high-level dashboard statistics."""
    total_managers = db.query(func.count(Manager.id)).scalar() or 0
    active_managers = (
        db.query(func.count(Manager.id))
        .filter(Manager.is_active.is_(True))
        .scalar() or 0
    )
    total_sales = db.query(func.count(SalesByBilling.id)).scalar() or 0
    total_baywise = db.query(func.count(BaywiseOutput.id)).scalar() or 0
    total_pp_master = db.query(func.count(PPMaster.id)).scalar() or 0
    total_production_plan = db.query(func.count(ProductionPlan.id)).scalar() or 0

    cycle_start, cycle_end = get_billing_cycle()

    # Last data refresh: most recent billing_date / posting_date
    last_sales_date = db.query(func.max(SalesByBilling.billing_date)).scalar()
    last_baywise_date = db.query(func.max(BaywiseOutput.posting_date)).scalar()

    dates = [d for d in (last_sales_date, last_baywise_date) if d]
    last_refresh = max(dates) if dates else None

    return {
        "total_managers": total_managers,
        "active_managers": active_managers,
        "total_sales_records": total_sales,
        "total_baywise_records": total_baywise,
        "total_pp_master_records": total_pp_master,
        "total_production_plan_records": total_production_plan,
        "current_billing_cycle": {"start": cycle_start, "end": cycle_end},
        "last_data_refresh": last_refresh,
    }


# ---------------------------------------------------------------------------
# GET /sales/daily
# ---------------------------------------------------------------------------

@router.get("/sales/daily")
def sales_daily(db: Session = Depends(get_db)):
    """Yesterday's daily sales performance grouped by company code."""
    yesterday = _yesterday_ist()
    yesterday_str = yesterday.isoformat()

    results = []
    for company_code in ALL_COMPANIES:
        plants = _plants_for_company(company_code)
        location = COMPANY_LOCATIONS.get(company_code, "")

        # Actual sales: sum converted_tax / 100_000 for yesterday
        sales_query = (
            db.query(
                func.coalesce(func.sum(SalesByBilling.converted_tax), 0),
                func.count(SalesByBilling.id),
            )
            .filter(SalesByBilling.billing_date == yesterday_str)
        )
        # Filter by plants via profit_center (trim whitespace for matching)
        plant_filters = [
            func.trim(SalesByBilling.profit_center).like(f"{p}%") for p in plants
        ]
        if plant_filters:
            sales_query = sales_query.filter(or_(*plant_filters))

        row = sales_query.one()
        sales_value = float(row[0])
        transaction_count = int(row[1])
        sales_lakhs = round(sales_value / 100_000, 2)

        # Target: sum sales_value from ProductionPlan for yesterday
        # The uploads route stores daily targets with target_date field
        target_query = (
            db.query(func.coalesce(func.sum(ProductionPlan.daily_sales_target_lakhs), 0))
            .filter(ProductionPlan.target_date == yesterday_str)
            .filter(ProductionPlan.plant.in_(plants))
        )
        target_lakhs = round(float(target_query.scalar() or 0), 2)

        pct = _performance_pct(sales_lakhs, target_lakhs)
        gap = round(target_lakhs - sales_lakhs, 2)

        results.append({
            "company_code": company_code,
            "location": location,
            "sales_lakhs": sales_lakhs,
            "target_lakhs": target_lakhs,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": _calculate_priority(pct),
            "transaction_count": transaction_count,
            "unique_customers": 0,
            "date": yesterday_str,
        })

    return results


# ---------------------------------------------------------------------------
# GET /sales/mtd
# ---------------------------------------------------------------------------

@router.get("/sales/mtd")
def sales_mtd(db: Session = Depends(get_db)):
    """Month-to-date (billing-cycle-to-date) sales performance by company."""
    yesterday = _yesterday_ist()
    yesterday_str = yesterday.isoformat()
    cycle_start, cycle_end = get_billing_cycle()

    start_date = date.fromisoformat(cycle_start)
    end_date = date.fromisoformat(cycle_end)
    elapsed_days = max((yesterday - start_date).days + 1, 1)
    total_days = (end_date - start_date).days + 1

    results = []
    for company_code in ALL_COMPANIES:
        plants = _plants_for_company(company_code)
        location = COMPANY_LOCATIONS.get(company_code, "")

        # Cumulative actual sales from cycle_start to yesterday
        sales_query = (
            db.query(
                func.coalesce(func.sum(SalesByBilling.converted_tax), 0),
                func.count(SalesByBilling.id),
            )
            .filter(SalesByBilling.billing_date >= cycle_start)
            .filter(SalesByBilling.billing_date <= yesterday_str)
        )
        plant_filters = [
            func.trim(SalesByBilling.profit_center).like(f"{p}%") for p in plants
        ]
        if plant_filters:
            sales_query = sales_query.filter(or_(*plant_filters))

        row = sales_query.one()
        sales_value = float(row[0])
        transaction_count = int(row[1])
        sales_lakhs = round(sales_value / 100_000, 2)

        # Cumulative target from cycle_start to yesterday
        target_query = (
            db.query(func.coalesce(func.sum(ProductionPlan.daily_sales_target_lakhs), 0))
            .filter(ProductionPlan.target_date >= cycle_start)
            .filter(ProductionPlan.target_date <= yesterday_str)
            .filter(ProductionPlan.plant.in_(plants))
        )
        target_lakhs = round(float(target_query.scalar() or 0), 2)

        pct = _performance_pct(sales_lakhs, target_lakhs)
        gap = round(target_lakhs - sales_lakhs, 2)
        daily_avg = round(sales_lakhs / elapsed_days, 2) if elapsed_days > 0 else 0
        projected = round(daily_avg * total_days, 2)

        # Day number in cycle
        day_number = elapsed_days

        results.append({
            "company_code": company_code,
            "location": location,
            "sales_lakhs": sales_lakhs,
            "target_lakhs": target_lakhs,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": _calculate_priority(pct),
            "transaction_count": transaction_count,
            "unique_customers": 0,
            "daily_avg": daily_avg,
            "projected": projected,
            "day_number": day_number,
            "total_cycle_days": total_days,
            "cycle_start": cycle_start,
            "cycle_end": cycle_end,
            "as_on_date": yesterday_str,
        })

    return results


# ---------------------------------------------------------------------------
# GET /production/daily
# ---------------------------------------------------------------------------

@router.get("/production/daily")
def production_daily(db: Session = Depends(get_db)):
    """Yesterday's daily production performance by company."""
    yesterday = _yesterday_ist()
    yesterday_str = yesterday.isoformat()

    # Pre-load PP Master into a dict for fast lookup
    pp_records = db.query(PPMaster).all()
    pp_map: dict[str, float] = {}
    for pp in pp_records:
        if pp.material_code and pp.per_qty_price:
            clean_code = (pp.material_code or "").lstrip("0") or "0"
            pp_map[clean_code] = float(pp.per_qty_price)

    results = []
    for company_code in ALL_COMPANIES:
        plants = _plants_for_company(company_code)
        location = COMPANY_LOCATIONS.get(company_code, "")

        # Get baywise records for yesterday, movement_type=101
        baywise_rows = (
            db.query(BaywiseOutput)
            .filter(BaywiseOutput.posting_date == yesterday_str)
            .filter(BaywiseOutput.movement_type == "101")
            .filter(BaywiseOutput.plant.in_(plants))
            .all()
        )

        production_value = 0.0
        matched = 0
        total_materials = 0
        for bw in baywise_rows:
            material_stripped = (bw.material or "").lstrip("0") or "0"
            qty = float(bw.qty_in_unit or bw.quantity or 0)
            if qty <= 0:
                continue
            total_materials += 1

            price = pp_map.get(material_stripped)
            if price:
                production_value += qty * price
                matched += 1

        production_lakhs = round(production_value / 100_000, 2)

        # Target from ProductionPlan
        target_query = (
            db.query(func.coalesce(func.sum(ProductionPlan.daily_production_target_lakhs), 0))
            .filter(ProductionPlan.target_date == yesterday_str)
            .filter(ProductionPlan.plant.in_(plants))
        )
        target_lakhs = round(float(target_query.scalar() or 0), 2)

        pct = _performance_pct(production_lakhs, target_lakhs)
        gap = round(target_lakhs - production_lakhs, 2)

        results.append({
            "company_code": company_code,
            "location": location,
            "production_lakhs": production_lakhs,
            "target_lakhs": target_lakhs,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": _calculate_priority(pct),
            "matched_materials": matched,
            "total_materials": total_materials,
            "date": yesterday_str,
        })

    return results


# ---------------------------------------------------------------------------
# GET /production/mtd
# ---------------------------------------------------------------------------

@router.get("/production/mtd")
def production_mtd(db: Session = Depends(get_db)):
    """Month-to-date production performance by company."""
    yesterday = _yesterday_ist()
    yesterday_str = yesterday.isoformat()
    cycle_start, cycle_end = get_billing_cycle()

    start_date = date.fromisoformat(cycle_start)
    end_date = date.fromisoformat(cycle_end)
    elapsed_days = max((yesterday - start_date).days + 1, 1)
    total_days = (end_date - start_date).days + 1

    # Pre-load PP Master
    pp_records = db.query(PPMaster).all()
    pp_map: dict[str, float] = {}
    for pp in pp_records:
        if pp.material_code and pp.per_qty_price:
            clean_code = (pp.material_code or "").lstrip("0") or "0"
            pp_map[clean_code] = float(pp.per_qty_price)

    results = []
    for company_code in ALL_COMPANIES:
        plants = _plants_for_company(company_code)
        location = COMPANY_LOCATIONS.get(company_code, "")

        # Get baywise records from cycle_start to yesterday
        baywise_rows = (
            db.query(BaywiseOutput)
            .filter(BaywiseOutput.posting_date >= cycle_start)
            .filter(BaywiseOutput.posting_date <= yesterday_str)
            .filter(BaywiseOutput.movement_type == "101")
            .filter(BaywiseOutput.plant.in_(plants))
            .all()
        )

        production_value = 0.0
        matched = 0
        total_materials = 0
        for bw in baywise_rows:
            material_stripped = (bw.material or "").lstrip("0") or "0"
            qty = float(bw.qty_in_unit or bw.quantity or 0)
            if qty <= 0:
                continue
            total_materials += 1

            price = pp_map.get(material_stripped)
            if price:
                production_value += qty * price
                matched += 1

        production_lakhs = round(production_value / 100_000, 2)

        # Cumulative target
        target_query = (
            db.query(func.coalesce(func.sum(ProductionPlan.daily_production_target_lakhs), 0))
            .filter(ProductionPlan.target_date >= cycle_start)
            .filter(ProductionPlan.target_date <= yesterday_str)
            .filter(ProductionPlan.plant.in_(plants))
        )
        target_lakhs = round(float(target_query.scalar() or 0), 2)

        pct = _performance_pct(production_lakhs, target_lakhs)
        gap = round(target_lakhs - production_lakhs, 2)
        daily_avg = round(production_lakhs / elapsed_days, 2) if elapsed_days > 0 else 0
        projected = round(daily_avg * total_days, 2)

        results.append({
            "company_code": company_code,
            "location": location,
            "production_lakhs": production_lakhs,
            "target_lakhs": target_lakhs,
            "performance_pct": pct,
            "gap_to_target": gap,
            "priority_level": _calculate_priority(pct),
            "matched_materials": matched,
            "total_materials": total_materials,
            "daily_avg": daily_avg,
            "projected": projected,
            "day_number": elapsed_days,
            "total_cycle_days": total_days,
            "cycle_start": cycle_start,
            "cycle_end": cycle_end,
            "as_on_date": yesterday_str,
        })

    return results


# ---------------------------------------------------------------------------
# GET /alerts/recent
# ---------------------------------------------------------------------------

@router.get("/alerts/recent")
def recent_alerts(db: Session = Depends(get_db)):
    """Return the last 50 alert log entries, most recent first."""
    alerts = (
        db.query(AlertLog)
        .order_by(AlertLog.sent_at.desc())
        .limit(50)
        .all()
    )
    # Convert to dicts for JSON serialization
    return [
        {
            "id": a.id,
            "alert_type": a.alert_type,
            "company_code": a.company_code,
            "manager_name": a.manager_name,
            "manager_phone": a.manager_phone,
            "message_preview": a.message_preview,
            "status": a.status,
            "error_message": a.error_message,
            "sent_at": a.sent_at.isoformat() if a.sent_at else None,
            "performance_pct": a.performance_pct,
            "target_lakhs": a.target_lakhs,
            "actual_lakhs": a.actual_lakhs,
        }
        for a in alerts
    ]


# ---------------------------------------------------------------------------
# GET /alerts/stats
# ---------------------------------------------------------------------------

@router.get("/alerts/stats")
def alert_stats(db: Session = Depends(get_db)):
    """Aggregate alert counts by type and status for the current billing cycle."""
    cycle_start, cycle_end = get_billing_cycle()

    by_type = (
        db.query(AlertLog.alert_type, func.count(AlertLog.id))
        .filter(AlertLog.sent_at >= cycle_start)
        .group_by(AlertLog.alert_type)
        .all()
    )

    by_status = (
        db.query(AlertLog.status, func.count(AlertLog.id))
        .filter(AlertLog.sent_at >= cycle_start)
        .group_by(AlertLog.status)
        .all()
    )

    return {
        "billing_cycle": {"start": cycle_start, "end": cycle_end},
        "by_type": {row[0]: row[1] for row in by_type},
        "by_status": {row[0]: row[1] for row in by_status},
        "total": sum(row[1] for row in by_type),
    }
