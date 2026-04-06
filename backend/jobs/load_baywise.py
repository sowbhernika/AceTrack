"""
Acetech Escalation System - Baywise Output CSV Loader.

Reads the Baywise Output CSV (tab-separated), filters for movement type 101
within the current billing cycle, and bulk-inserts into ``baywise_output``.
"""

from __future__ import annotations

import logging
from datetime import date, datetime

import pandas as pd
import pytz
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.models import BaywiseOutput
from backend.jobs.cleanup import clear_baywise_data

logger = logging.getLogger(__name__)

IST = pytz.timezone(settings.TIMEZONE)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _billing_cycle_range(reference: date | None = None) -> tuple[date, date]:
    """Return ``(start, end)`` of the billing cycle containing *reference*."""
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


def _parse_date(val: str) -> str | None:
    """Convert ``DD.MM.YYYY`` to ``YYYY-MM-DD``.  Returns *None* on failure."""
    if not val or pd.isna(val):
        return None
    val = str(val).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(val, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    logger.debug("Unparseable date: %r", val)
    return None


def _safe_float(val) -> float | None:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Main loader
# ---------------------------------------------------------------------------

def load_baywise_from_file(db_session: Session) -> int:
    """Read the Baywise Output CSV, filter, and load into the DB.

    Returns the number of rows inserted.
    """
    csv_path = settings.BAYWISE_CSV_PATH
    logger.info("Loading baywise data from %s", csv_path)

    try:
        df = pd.read_csv(
            csv_path,
            sep="\t",
            dtype=str,
            keep_default_na=False,
            encoding="utf-8",
            on_bad_lines="skip",
        )
    except FileNotFoundError:
        logger.error("Baywise CSV not found: %s", csv_path)
        return 0
    except Exception:
        logger.exception("Error reading baywise CSV")
        return 0

    if df.empty:
        logger.warning("Baywise CSV is empty")
        return 0

    logger.info("Read %d raw rows from baywise CSV", len(df))

    # --- Strip whitespace from column names -----------------------------------
    df.columns = df.columns.str.strip()

    # --- Filter movement_type = 101 -------------------------------------------
    mvt_col = None
    for candidate in ("Movement Type", "Movement type", "movement_type", "MvT"):
        if candidate in df.columns:
            mvt_col = candidate
            break

    if mvt_col is None:
        logger.error(
            "Cannot find movement type column. Available columns: %s",
            list(df.columns),
        )
        return 0

    df[mvt_col] = df[mvt_col].str.strip()
    df = df[df[mvt_col] == "101"].copy()

    if df.empty:
        logger.warning("No rows with movement_type=101")
        return 0

    logger.info("%d rows with movement_type=101", len(df))

    # --- Identify posting date column -----------------------------------------
    post_col = None
    for candidate in ("Posting Date", "Posting date", "posting_date", "Pstng Date"):
        if candidate in df.columns:
            post_col = candidate
            break

    if post_col is None:
        logger.error(
            "Cannot find posting date column. Available columns: %s",
            list(df.columns),
        )
        return 0

    df["posting_date_parsed"] = df[post_col].apply(_parse_date)
    df = df[df["posting_date_parsed"].notna()].copy()

    # --- Filter by billing cycle ----------------------------------------------
    cycle_start, cycle_end = _billing_cycle_range()
    logger.info(
        "Billing cycle: %s to %s", cycle_start.isoformat(), cycle_end.isoformat()
    )

    df["posting_date_obj"] = pd.to_datetime(
        df["posting_date_parsed"], format="%Y-%m-%d"
    ).dt.date
    df = df[
        (df["posting_date_obj"] >= cycle_start)
        & (df["posting_date_obj"] <= cycle_end)
    ].copy()

    if df.empty:
        logger.warning("No baywise rows within the current billing cycle")
        return 0

    logger.info("%d rows within billing cycle", len(df))

    # --- Helper to safely extract column values --------------------------------
    def _col(row, *candidates, default=None):
        for c in candidates:
            if c in row.index and row[c]:
                return str(row[c]).strip() or default
        return default

    # --- Clear existing data --------------------------------------------------
    clear_baywise_data(db_session)

    # --- Bulk insert ----------------------------------------------------------
    records: list[BaywiseOutput] = []
    for _, row in df.iterrows():
        records.append(
            BaywiseOutput(
                material_doc_item=_col(row, "Material Doc.Item", "Material Doc. Item"),
                material=_col(row, "Material", "material"),
                material_description=_col(
                    row, "Material Description", "Material description"
                ),
                plant=_col(row, "Plant", "plant"),
                storage_location=_col(row, "Storage Location", "Stge Loc."),
                movement_type=_col(row, mvt_col),
                batch=_col(row, "Batch", "batch"),
                qty_in_unit=_safe_float(
                    _col(row, "Qty in unit of entry", "Quantity", "Qty")
                ),
                unit_of_entry=_col(
                    row, "Unit of Entry", "Unit of entry", "Base Unit"
                ),
                amount_loc_cur=_col(
                    row, "Amount in LC", "Amount in local currency", "Amt.in loc.cur."
                ),
                order_number=_col(row, "Order", "Order Number"),
                sales_order_item=_col(row, "Sales Order Item", "S.Ord.Item"),
                material_document=_col(
                    row, "Material Document", "Material document"
                ),
                posting_date=row.get("posting_date_parsed"),
                entry_date=_parse_date(
                    _col(row, "Entry Date", "Entry date", default="")
                ),
                time_of_entry=_col(row, "Time of Entry", "Time of entry"),
                user_name=_col(row, "User Name", "User name"),
                document_header_text=_col(
                    row, "Document Header Text", "Doc.Header Text"
                ),
                reservation=_col(row, "Reservation", "Reserv.No."),
                special_stock=_col(row, "Special Stock", "Special stock"),
                supplier=_col(row, "Vendor", "Supplier"),
                purchase_order=_col(
                    row, "Purchase Order", "Purchase order"
                ),
                cost_center=_col(row, "Cost Center", "Cost center"),
                reference=_col(row, "Reference", "reference"),
                sales_order=_col(row, "Sales Order", "Sales order"),
            )
        )

    try:
        db_session.bulk_save_objects(records)
        db_session.commit()
        logger.info("Inserted %d baywise rows", len(records))
    except Exception:
        db_session.rollback()
        logger.exception("Failed to insert baywise data")
        return 0

    return len(records)
