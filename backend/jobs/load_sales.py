"""
Acetech Escalation System - Sales CSV Loader.

Reads the "Sales by Billing" CSV exported from SAP, filters rows within the
current billing cycle, and bulk-inserts them into the ``sales_by_billing``
table.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

import pandas as pd
import pytz
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.models import SalesByBilling
from backend.jobs.cleanup import clear_sales_data

logger = logging.getLogger(__name__)

IST = pytz.timezone(settings.TIMEZONE)


# ---------------------------------------------------------------------------
# Billing-cycle helpers
# ---------------------------------------------------------------------------

def _billing_cycle_range(reference: date | None = None) -> tuple[date, date]:
    """Return ``(start, end)`` of the billing cycle containing *reference*.

    Cycle runs from the 26th of the previous month to the 25th of the
    current month.  If *reference* is before the 26th we use (prev-prev-26
    to prev-25); if on or after the 26th we use (prev-26 to current-25).
    """
    if reference is None:
        reference = datetime.now(IST).date()

    if reference.day >= 26:
        start = reference.replace(day=26)
        # end is the 25th of the *next* month
        if reference.month == 12:
            end = date(reference.year + 1, 1, 25)
        else:
            end = date(reference.year, reference.month + 1, 25)
    else:
        # start is the 26th of the *previous* month
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
    """Coerce to float, returning *None* on failure."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Main loader
# ---------------------------------------------------------------------------

def load_sales_from_file(db_session: Session) -> int:
    """Read the sales CSV, filter by billing cycle, and load into the DB.

    Returns the number of rows inserted.
    """
    csv_path = settings.SALES_CSV_PATH
    logger.info("Loading sales data from %s", csv_path)

    # --- Read CSV -------------------------------------------------------------
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
        logger.error("Sales CSV not found: %s", csv_path)
        return 0
    except Exception:
        logger.exception("Error reading sales CSV")
        return 0

    if df.empty:
        logger.warning("Sales CSV is empty")
        return 0

    logger.info("Read %d raw rows from sales CSV", len(df))

    # --- Normalise column names -----------------------------------------------
    col_map = {
        "Billing Date": "billing_date",
        "Ref. Invoice Number": "ref_invoice_number",
        "Customer": "customer",
        "Customer Name": "customer_name",
        "Item Description": "item_description",
        "Customer Reference": "customer_reference",
        "Quantity": "quantity",
        "TCS": "tcs",
        "Taxable Value": "taxable_value",
        "Packing": "packing",
        "Converted Tax": "converted_tax",
        "SGST": "sgst",
        "CGST": "cgst",
        "IGST": "igst",
        "Invoice Value[INR]": "invoice_value_inr",
        "Round Off": "round_off",
        "Profit Center": "profit_center",
        "GSTIN Number": "gstin_number",
        "GST Rate": "gst_rate",
        "TCS Rate": "tcs_rate",
        "Posting Date": "posting_date",
        "Material": "material",
        "Name": "name",
        "Company Code": "company_code_csv",
        "Document Number": "document_number",
        "Billing Type": "billing_type",
        "Currency": "currency",
    }
    df.rename(columns=col_map, inplace=True)

    # --- Parse and filter dates -----------------------------------------------
    df["billing_date_parsed"] = df["billing_date"].apply(_parse_date)
    df = df[df["billing_date_parsed"].notna()].copy()

    cycle_start, cycle_end = _billing_cycle_range()
    logger.info(
        "Billing cycle: %s to %s", cycle_start.isoformat(), cycle_end.isoformat()
    )

    df["billing_date_obj"] = pd.to_datetime(
        df["billing_date_parsed"], format="%Y-%m-%d"
    ).dt.date
    df = df[
        (df["billing_date_obj"] >= cycle_start)
        & (df["billing_date_obj"] <= cycle_end)
    ].copy()

    if df.empty:
        logger.warning("No sales rows within the current billing cycle")
        return 0

    logger.info("%d rows within billing cycle", len(df))

    # --- Derive computed columns -----------------------------------------------
    df["posting_date_parsed"] = df.get("posting_date", pd.Series(dtype=str)).apply(
        _parse_date
    )

    # Numeric conversions
    for col in (
        "quantity", "taxable_value", "converted_tax", "invoice_value_inr",
        "sgst", "cgst", "igst", "tcs", "packing", "round_off",
        "gst_rate", "tcs_rate",
    ):
        if col in df.columns:
            df[col] = df[col].apply(_safe_float)

    df["taxable_value_lakhs"] = df["taxable_value"].apply(
        lambda v: round(v / 100_000, 4) if v else None
    )
    df["converted_tax_lakhs"] = df["converted_tax"].apply(
        lambda v: round(v / 100_000, 4) if v else None
    )

    # Plant / company mapping from Profit Center
    df["plant"] = df["profit_center"].str.strip().str[:4]
    df["company_code_derived"] = df["plant"].map(settings.PLANT_TO_COMPANY)
    df["location"] = df["company_code_derived"].map(settings.COMPANY_LOCATIONS)

    # --- Clear existing data --------------------------------------------------
    clear_sales_data(db_session)

    # --- Bulk insert ----------------------------------------------------------
    records: list[SalesByBilling] = []
    for _, row in df.iterrows():
        records.append(
            SalesByBilling(
                billing_date=row.get("billing_date_parsed"),
                ref_invoice_number=row.get("ref_invoice_number") or None,
                customer=row.get("customer") or None,
                customer_name=row.get("customer_name") or None,
                item_description=row.get("item_description") or None,
                quantity=row.get("quantity"),
                taxable_value=row.get("taxable_value"),
                converted_tax=row.get("converted_tax"),
                taxable_value_lakhs=row.get("taxable_value_lakhs"),
                converted_tax_lakhs=row.get("converted_tax_lakhs"),
                invoice_value_inr=row.get("invoice_value_inr"),
                profit_center=row.get("profit_center") or None,
                location=row.get("location") or None,
                company_code=row.get("company_code_derived") or None,
                sgst=row.get("sgst"),
                cgst=row.get("cgst"),
                igst=row.get("igst"),
                tcs=row.get("tcs"),
                packing=row.get("packing"),
                round_off=row.get("round_off"),
                gstin_number=row.get("gstin_number") or None,
                gst_rate=row.get("gst_rate"),
                tcs_rate=row.get("tcs_rate"),
                posting_date=row.get("posting_date_parsed"),
                material=row.get("material") or None,
                name=row.get("name") or None,
                document_number=row.get("document_number") or None,
                billing_type=row.get("billing_type") or None,
                currency=row.get("currency") or None,
            )
        )

    try:
        db_session.bulk_save_objects(records)
        db_session.commit()
        logger.info("Inserted %d sales rows", len(records))
    except Exception:
        db_session.rollback()
        logger.exception("Failed to insert sales data")
        return 0

    return len(records)
