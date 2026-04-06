"""
Acetech Escalation System - Data upload routes.

Handles ingestion of Sales CSV, Production Plan Excel, PP Master Excel,
and Baywise CSV files.  Each endpoint parses the uploaded file, validates
and transforms the data, then replaces the corresponding database table
contents for the current billing cycle.
"""

from __future__ import annotations

import io
from datetime import date, datetime, timedelta

import pandas as pd
import pytz
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.connection import get_db
from backend.db.models import BaywiseOutput, PPMaster, ProductionPlan, SalesByBilling

router = APIRouter(prefix="/api/uploads", tags=["Uploads"])

# ---------------------------------------------------------------------------
# Billing-cycle helper
# ---------------------------------------------------------------------------

_IST = pytz.timezone(settings.TIMEZONE)


def get_billing_cycle() -> tuple[str, str]:
    """Return (start_date, end_date) strings for the current billing cycle.

    Rule:
      - If today's day >= 26, cycle runs from this month's 26th to next
        month's 25th.
      - Otherwise, cycle runs from previous month's 26th to this month's 25th.

    Dates are returned as ``YYYY-MM-DD``.
    """
    today = datetime.now(_IST).date()

    if today.day >= 26:
        start = today.replace(day=26)
        # Next month
        if today.month == 12:
            end = date(today.year + 1, 1, 25)
        else:
            end = date(today.year, today.month + 1, 25)
    else:
        # Previous month's 26th
        if today.month == 1:
            start = date(today.year - 1, 12, 26)
        else:
            start = date(today.year, today.month - 1, 26)
        end = today.replace(day=25)

    return start.isoformat(), end.isoformat()


def _days_in_billing_cycle() -> int:
    """Return the number of days in the current billing cycle (inclusive)."""
    start_str, end_str = get_billing_cycle()
    start = date.fromisoformat(start_str)
    end = date.fromisoformat(end_str)
    return (end - start).days + 1


def _derive_location(profit_center: str | None) -> str | None:
    """Map a Profit Center value to a location via the plant-company chain.

    The first four characters of a Profit Center typically encode the plant.
    """
    if not profit_center:
        return None
    plant = str(profit_center).strip()[:4]
    company = settings.PLANT_TO_COMPANY.get(plant)
    if company:
        return settings.COMPANY_LOCATIONS.get(company)
    return None


def _parse_date_ddmmyyyy(value: str | None) -> str | None:
    """Convert ``DD.MM.YYYY`` to ``YYYY-MM-DD``. Return None on failure."""
    if not value or pd.isna(value):
        return None
    value = str(value).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# POST /sales-csv
# ---------------------------------------------------------------------------

@router.post("/sales-csv")
def upload_sales_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload and ingest the *Sales by Billing* CSV (tab-separated).

    Steps:
      1. Parse tab-separated CSV with pandas.
      2. Convert date columns from DD.MM.YYYY to YYYY-MM-DD.
      3. Filter rows within the current billing cycle.
      4. Compute lakh-values for Taxable Value and Converted Tax.
      5. Derive location from Profit Center.
      6. Clear existing SalesByBilling rows and insert new data.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided.")

    try:
        contents = file.file.read()
        df = pd.read_csv(io.BytesIO(contents), sep="\t", dtype=str)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV: {exc}",
        )

    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty.")

    # Normalise column names: strip spaces, replace spaces/dots with underscores
    df.columns = (
        df.columns.str.strip()
        .str.replace(" ", "_")
        .str.replace(".", "_", regex=False)
        .str.replace("[", "", regex=False)
        .str.replace("]", "", regex=False)
    )

    # --- Date conversion ---
    df["Billing_Date"] = df.get("Billing_Date", pd.Series(dtype=str)).apply(_parse_date_ddmmyyyy)
    df["Posting_Date"] = df.get("Posting_Date", pd.Series(dtype=str)).apply(_parse_date_ddmmyyyy)

    # --- Filter by billing cycle ---
    cycle_start, cycle_end = get_billing_cycle()
    mask = (df["Billing_Date"] >= cycle_start) & (df["Billing_Date"] <= cycle_end)
    df = df[mask].copy()

    if df.empty:
        # Still clear existing data even if no rows match
        db.query(SalesByBilling).delete()
        db.commit()
        return {"rows_inserted": 0, "message": "No rows within current billing cycle."}

    # --- Numeric conversions ---
    numeric_cols = [
        "Quantity", "TCS", "Taxable_Value", "Packing", "Converted_Tax",
        "SGST", "CGST", "IGST", "Invoice_ValueINR", "Round_Off",
        "GST_Rate", "TCS_Rate",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # --- Derived columns ---
    df["Taxable_Value_Lakhs"] = df.get("Taxable_Value", 0) / 100_000
    df["Converted_Tax_Lakhs"] = df.get("Converted_Tax", 0) / 100_000
    df["Location"] = df.get("Profit_Center", pd.Series(dtype=str)).apply(_derive_location)

    # --- Database replace ---
    try:
        db.query(SalesByBilling).delete()

        records = []
        for _, row in df.iterrows():
            record = SalesByBilling(
                billing_date=row.get("Billing_Date"),
                ref_invoice_number=row.get("Ref__Invoice_Number") or row.get("Ref_Invoice_Number"),
                customer=row.get("Customer"),
                customer_name=row.get("Customer_Name"),
                item_description=row.get("Item_Description"),
                customer_reference=row.get("Customer_Reference"),
                quantity=row.get("Quantity", 0),
                tcs=row.get("TCS", 0),
                taxable_value=row.get("Taxable_Value", 0),
                packing=row.get("Packing", 0),
                converted_tax=row.get("Converted_Tax", 0),
                sgst=row.get("SGST", 0),
                cgst=row.get("CGST", 0),
                igst=row.get("IGST", 0),
                invoice_value_inr=row.get("Invoice_ValueINR", 0),
                round_off=row.get("Round_Off", 0),
                profit_center=row.get("Profit_Center"),
                gstin_number=row.get("GSTIN_Number"),
                gst_rate=row.get("GST_Rate", 0),
                tcs_rate=row.get("TCS_Rate", 0),
                posting_date=row.get("Posting_Date"),
                material=row.get("Material"),
                name=row.get("Name"),
                company_code=row.get("Company_Code"),
                document_number=row.get("Document_Number"),
                billing_type=row.get("Billing_Type"),
                currency=row.get("Currency"),
                taxable_value_lakhs=row.get("Taxable_Value_Lakhs", 0),
                converted_tax_lakhs=row.get("Converted_Tax_Lakhs", 0),
                location=row.get("Location"),
            )
            records.append(record)

        db.bulk_save_objects(records)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    return {
        "rows_inserted": len(records),
        "billing_cycle": {"start": cycle_start, "end": cycle_end},
        "message": f"Successfully inserted {len(records)} sales record(s).",
    }


# ---------------------------------------------------------------------------
# POST /production-plan
# ---------------------------------------------------------------------------

@router.post("/production-plan")
def upload_production_plan(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload Production Plan Excel (.xlsx).

    The Excel contains monthly totals per plant with columns: Plant,
    Sales Value, Production Value.  Each monthly total is divided by the
    number of days in the billing cycle to create a daily target row for
    every date in the cycle.
    """
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .xlsx files are accepted.",
        )

    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents), engine="openpyxl", dtype=str)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse Excel file: {exc}",
        )

    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Excel file is empty.")

    # Normalise column names
    df.columns = df.columns.str.strip().str.replace(" ", "_")

    required = {"Plant", "Sales_Value", "Production_Value"}
    if not required.issubset(set(df.columns)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required columns. Expected: {required}. Got: {set(df.columns)}.",
        )

    df["Sales_Value"] = pd.to_numeric(df["Sales_Value"], errors="coerce").fillna(0)
    df["Production_Value"] = pd.to_numeric(df["Production_Value"], errors="coerce").fillna(0)

    cycle_start_str, cycle_end_str = get_billing_cycle()
    cycle_start = date.fromisoformat(cycle_start_str)
    cycle_end = date.fromisoformat(cycle_end_str)
    num_days = (cycle_end - cycle_start).days + 1

    try:
        db.query(ProductionPlan).delete()

        records = []
        for _, row in df.iterrows():
            plant = str(row["Plant"]).strip()
            company_code = settings.PLANT_TO_COMPANY.get(plant)
            daily_sales = row["Sales_Value"] / num_days
            daily_production = row["Production_Value"] / num_days

            # Convert monthly totals to lakhs for targets
            sales_value_lakhs = row["Sales_Value"] / 100_000
            production_value_lakhs = row["Production_Value"] / 100_000
            daily_sales_lakhs = daily_sales / 100_000
            daily_production_lakhs = daily_production / 100_000

            current = cycle_start
            while current <= cycle_end:
                record = ProductionPlan(
                    plant=plant,
                    company_code=company_code,
                    target_date=current.isoformat(),
                    sales_value=row["Sales_Value"],
                    production_value=row["Production_Value"],
                    sales_value_lakhs=sales_value_lakhs,
                    production_value_lakhs=production_value_lakhs,
                    daily_sales_target=daily_sales,
                    daily_production_target=daily_production,
                    daily_sales_target_lakhs=daily_sales_lakhs,
                    daily_production_target_lakhs=daily_production_lakhs,
                    billing_cycle_start=cycle_start_str,
                    billing_cycle_end=cycle_end_str,
                    num_days_in_cycle=num_days,
                )
                records.append(record)
                current += timedelta(days=1)

        db.bulk_save_objects(records)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    return {
        "rows_inserted": len(records),
        "billing_cycle": {"start": cycle_start_str, "end": cycle_end_str},
        "days_in_cycle": num_days,
        "message": f"Successfully inserted {len(records)} production plan record(s).",
    }


# ---------------------------------------------------------------------------
# POST /pp-master
# ---------------------------------------------------------------------------

@router.post("/pp-master")
def upload_pp_master(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload PP Master Excel (.xlsx).

    Columns: Material Code, Company Code, Document Type, Page format,
    Description, Mateial Class (note original typo), Per Qty Price,
    Customer code, Customer Description, Sales Order.
    """
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Excel files (.xlsx, .xls) are accepted.",
        )

    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents), engine="openpyxl", dtype=str)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse Excel file: {exc}",
        )

    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Excel file is empty.")

    # Normalise column names
    df.columns = df.columns.str.strip().str.replace(" ", "_")

    # Convert Per_Qty_Price to numeric
    if "Per_Qty_Price" in df.columns:
        df["Per_Qty_Price"] = pd.to_numeric(df["Per_Qty_Price"], errors="coerce").fillna(0)

    try:
        db.query(PPMaster).delete()

        records = []
        for _, row in df.iterrows():
            record = PPMaster(
                material_code=row.get("Material_Code"),
                company_code=row.get("Company_Code"),
                document_type=row.get("Document_Type"),
                page_format=row.get("Page_format"),
                description=row.get("Description"),
                material_class=row.get("Mateial_Class") or row.get("Material_Class"),
                per_qty_price=row.get("Per_Qty_Price", 0),
                customer_code=row.get("Customer_code"),
                customer_description=row.get("Customer_Description"),
                sales_order=row.get("Sales_Order"),
            )
            records.append(record)

        db.bulk_save_objects(records)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    return {
        "rows_inserted": len(records),
        "message": f"Successfully inserted {len(records)} PP Master record(s).",
    }


# ---------------------------------------------------------------------------
# POST /baywise
# ---------------------------------------------------------------------------

@router.post("/baywise")
def upload_baywise(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload Baywise Output CSV (tab-separated).

    Only rows with movement_type = 101 and posting_date within the current
    billing cycle are kept.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided.")

    try:
        contents = file.file.read()
        df = pd.read_csv(io.BytesIO(contents), sep="\t", dtype=str)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse CSV: {exc}",
        )

    if df.empty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV file is empty.")

    # Normalise column names
    df.columns = df.columns.str.strip().str.replace(" ", "_").str.lower()

    # --- Filter movement_type == 101 ---
    if "movement_type" in df.columns:
        df["movement_type"] = df["movement_type"].astype(str).str.strip()
        df = df[df["movement_type"] == "101"].copy()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV is missing 'movement_type' column.",
        )

    # --- Parse and filter posting_date by billing cycle ---
    if "posting_date" in df.columns:
        df["posting_date"] = df["posting_date"].apply(_parse_date_ddmmyyyy)
        cycle_start, cycle_end = get_billing_cycle()
        mask = (df["posting_date"] >= cycle_start) & (df["posting_date"] <= cycle_end)
        df = df[mask].copy()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CSV is missing 'posting_date' column.",
        )

    if df.empty:
        db.query(BaywiseOutput).delete()
        db.commit()
        return {"rows_inserted": 0, "message": "No matching rows after filtering."}

    # Numeric columns
    numeric_cols = ["quantity", "qty", "amount", "value"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    try:
        db.query(BaywiseOutput).delete()

        records = []
        for _, row in df.iterrows():
            record = BaywiseOutput(
                posting_date=row.get("posting_date"),
                movement_type=row.get("movement_type"),
                material=row.get("material"),
                material_description=row.get("material_description"),
                plant=row.get("plant"),
                quantity=row.get("quantity", 0),
                unit=row.get("unit") or row.get("base_unit"),
                batch=row.get("batch"),
                storage_location=row.get("storage_location"),
                document_number=row.get("document_number"),
                company_code=row.get("company_code"),
            )
            records.append(record)

        db.bulk_save_objects(records)
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {exc}",
        )

    return {
        "rows_inserted": len(records),
        "billing_cycle": {"start": cycle_start, "end": cycle_end},
        "message": f"Successfully inserted {len(records)} baywise record(s).",
    }
