"""
Acetech Escalation System - WhatsApp Alert Message Templates.

Each public function accepts a ``data`` dict and returns a fully-formatted
WhatsApp-ready string.
"""

from __future__ import annotations

from datetime import datetime

import pytz

from backend.config import settings

IST = pytz.timezone(settings.TIMEZONE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_emoji(pct: float) -> str:
    """Return a status emoji based on *pct* (percentage of target achieved)."""
    if pct == 0:
        return "\U0001f198"        # SOS
    if pct < 50:
        return "\U0001f534"        # red circle
    if pct < 75:
        return "\U0001f7e0"        # orange circle
    if pct < 90:
        return "\U0001f7e1"        # yellow circle
    if pct < 100:
        return "\U0001f7e2"        # green circle
    return "\u2705"                # white check mark


def _ist_timestamp() -> str:
    """Return the current IST time as a human-readable string."""
    return datetime.now(IST).strftime("%d-%b-%Y %I:%M %p IST")


def _fmt(value: float | None, decimals: int = 2) -> str:
    """Format a numeric value with commas and fixed decimal places."""
    if value is None:
        return "0.00"
    return f"{value:,.{decimals}f}"


# ---------------------------------------------------------------------------
# Sales - Daily
# ---------------------------------------------------------------------------

def sales_daily_message(data: dict) -> str:
    """Build the daily sales alert message.

    Expected *data* keys:
        company_code, location, sales_date, daily_sales_lakhs, target_lakhs,
        performance_pct, gap_to_target, priority_level, manager_name,
        transaction_count, unique_customers
    """
    pct = data.get("performance_pct", 0) or 0
    emoji = get_emoji(pct)

    return (
        f"{emoji} SALES ALERT - {data.get('sales_date', 'N/A')}\n"
        f"{(data.get('manager_name') or 'Manager').upper()}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4cd {data.get('company_code', '')}-{data.get('location', '')}\n"
        f"{emoji} Priority: {data.get('priority_level', 'N/A')}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4ca PERFORMANCE\n"
        f"Sales: \u20b9{_fmt(data.get('daily_sales_lakhs'))}L\n"
        f"Target: \u20b9{_fmt(data.get('target_lakhs'))}L\n"
        f"Achieved: {_fmt(pct)}%\n"
        f"Gap: \u20b9{_fmt(data.get('gap_to_target'))}L\n"
        f"\n"
        f"\u23f0 {_ist_timestamp()}"
    )


# ---------------------------------------------------------------------------
# Sales - MTD
# ---------------------------------------------------------------------------

def sales_mtd_message(data: dict) -> str:
    """Build the MTD sales alert message.

    Expected *data* keys:
        company_code, location, mtd_sales_lakhs, mtd_target_lakhs,
        performance_pct, gap_to_target, priority_level, manager_name,
        day_number, total_cycle_days, daily_avg, projected
    """
    pct = data.get("performance_pct", 0) or 0
    emoji = get_emoji(pct)

    return (
        f"{emoji} SALES MTD ALERT\n"
        f"{(data.get('manager_name') or 'Manager').upper()}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4cd {data.get('company_code', '')}-{data.get('location', '')}\n"
        f"{emoji} Priority: {data.get('priority_level', 'N/A')}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4ca MTD PERFORMANCE (Day {data.get('day_number', 0)}"
        f"/{data.get('total_cycle_days', 0)})\n"
        f"MTD Sales: \u20b9{_fmt(data.get('mtd_sales_lakhs'))}L\n"
        f"MTD Target: \u20b9{_fmt(data.get('mtd_target_lakhs'))}L\n"
        f"Achieved: {_fmt(pct)}%\n"
        f"Gap: \u20b9{_fmt(data.get('gap_to_target'))}L\n"
        f"\n"
        f"\U0001f4c8 PROJECTIONS\n"
        f"Daily Avg: \u20b9{_fmt(data.get('daily_avg'))}L\n"
        f"Projected: \u20b9{_fmt(data.get('projected'))}L\n"
        f"\n"
        f"\u23f0 {_ist_timestamp()}"
    )


# ---------------------------------------------------------------------------
# Production - Daily
# ---------------------------------------------------------------------------

def production_daily_message(data: dict) -> str:
    """Build the daily production alert message.

    Expected *data* keys:
        company_code, location, production_date, daily_production_lakhs,
        target_lakhs, performance_pct, gap_to_target, priority_level,
        manager_name, matched_materials
    """
    pct = data.get("performance_pct", 0) or 0
    emoji = get_emoji(pct)

    return (
        f"{emoji} PRODUCTION ALERT - {data.get('production_date', 'N/A')}\n"
        f"{(data.get('manager_name') or 'Manager').upper()}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4cd {data.get('company_code', '')}-{data.get('location', '')}\n"
        f"{emoji} Priority: {data.get('priority_level', 'N/A')}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f3ed PRODUCTION\n"
        f"Output: \u20b9{_fmt(data.get('daily_production_lakhs'))}L\n"
        f"Target: \u20b9{_fmt(data.get('target_lakhs'))}L\n"
        f"Achieved: {_fmt(pct)}%\n"
        f"Gap: \u20b9{_fmt(data.get('gap_to_target'))}L\n"
        f"Materials Matched: {data.get('matched_materials', 0)}\n"
        f"\n"
        f"\u23f0 {_ist_timestamp()}"
    )


# ---------------------------------------------------------------------------
# Production - MTD
# ---------------------------------------------------------------------------

def production_mtd_message(data: dict) -> str:
    """Build the MTD production alert message.

    Expected *data* keys:
        company_code, location, mtd_production_lakhs, mtd_target_lakhs,
        performance_pct, gap_to_target, priority_level, manager_name,
        day_number, total_cycle_days, daily_avg, projected, matched_materials
    """
    pct = data.get("performance_pct", 0) or 0
    emoji = get_emoji(pct)

    return (
        f"{emoji} PRODUCTION MTD ALERT\n"
        f"{(data.get('manager_name') or 'Manager').upper()}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f4cd {data.get('company_code', '')}-{data.get('location', '')}\n"
        f"{emoji} Priority: {data.get('priority_level', 'N/A')}\n"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501"
        f"\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n"
        f"\U0001f3ed MTD PRODUCTION (Day {data.get('day_number', 0)}"
        f"/{data.get('total_cycle_days', 0)})\n"
        f"MTD Output: \u20b9{_fmt(data.get('mtd_production_lakhs'))}L\n"
        f"MTD Target: \u20b9{_fmt(data.get('mtd_target_lakhs'))}L\n"
        f"Achieved: {_fmt(pct)}%\n"
        f"Gap: \u20b9{_fmt(data.get('gap_to_target'))}L\n"
        f"Materials Matched: {data.get('matched_materials', 0)}\n"
        f"\n"
        f"\U0001f4c8 PROJECTIONS\n"
        f"Daily Avg: \u20b9{_fmt(data.get('daily_avg'))}L\n"
        f"Projected: \u20b9{_fmt(data.get('projected'))}L\n"
        f"\n"
        f"\u23f0 {_ist_timestamp()}"
    )
