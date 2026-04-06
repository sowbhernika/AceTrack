"""
Acetech Escalation System - SQLAlchemy 2.0 ORM Models.

All models use the ``mapped_column`` declarative style introduced in
SQLAlchemy 2.0.  Timestamps default to IST (Asia/Kolkata).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


# ── Base class ──────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    """Declarative base for all Acetech models."""

    pass


# ── Helpers ─────────────────────────────────────────────────────────────

def _utcnow():
    """Server-side default for timestamps (UTC via DB ``now()``)."""
    return func.now()


# ── Manager ─────────────────────────────────────────────────────────────


class Manager(Base):
    __tablename__ = "managers"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    manager_name: Mapped[str] = mapped_column(String(255), nullable=False)
    manager_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    manager_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    department: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    plant: Mapped[str] = mapped_column(
        String(10), nullable=False, comment="SAP plant: AM03/AM07/AP01/AH05"
    )
    company_code: Mapped[str | None] = mapped_column(
        String(10), nullable=True, comment="AMC / APE / AHF"
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=_utcnow()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=_utcnow(),
        onupdate=_utcnow(),
    )

    def __repr__(self) -> str:
        return (
            f"<Manager id={self.id} name={self.manager_name!r} "
            f"plant={self.plant!r}>"
        )


# ── Sales by Billing ───────────────────────────────────────────────────


class SalesByBilling(Base):
    __tablename__ = "sales_by_billing"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    billing_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ref_invoice_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    customer: Mapped[str | None] = mapped_column(String(100), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    item_description: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    taxable_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    converted_tax: Mapped[float | None] = mapped_column(Float, nullable=True)
    taxable_value_lakhs: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    converted_tax_lakhs: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    invoice_value_inr: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    profit_center: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    location: Mapped[str | None] = mapped_column(String(100), nullable=True)
    company_code: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )
    sgst: Mapped[float | None] = mapped_column(Float, nullable=True)
    cgst: Mapped[float | None] = mapped_column(Float, nullable=True)
    igst: Mapped[float | None] = mapped_column(Float, nullable=True)
    tcs: Mapped[float | None] = mapped_column(Float, nullable=True)
    packing: Mapped[float | None] = mapped_column(Float, nullable=True)
    round_off: Mapped[float | None] = mapped_column(Float, nullable=True)
    gstin_number: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    gst_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    tcs_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    posting_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    material: Mapped[str | None] = mapped_column(String(100), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    document_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    billing_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    customer_reference: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<SalesByBilling id={self.id} "
            f"invoice={self.ref_invoice_number!r}>"
        )


# ── Production Plan ────────────────────────────────────────────────────


class ProductionPlan(Base):
    __tablename__ = "production_plan"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    plant: Mapped[str | None] = mapped_column(String(10), nullable=True)
    company_code: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )
    sales_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    sales_value_lakhs: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    production_value: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    production_value_lakhs: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    target_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    daily_sales_target: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    daily_production_target: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    daily_sales_target_lakhs: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    daily_production_target_lakhs: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    billing_cycle_start: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    billing_cycle_end: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    num_days_in_cycle: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<ProductionPlan id={self.id} plant={self.plant!r} "
            f"date={self.date!r}>"
        )


# ── Baywise Output ─────────────────────────────────────────────────────


class BaywiseOutput(Base):
    __tablename__ = "baywise_output"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    material_doc_item: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    material: Mapped[str | None] = mapped_column(String(100), nullable=True)
    material_description: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    plant: Mapped[str | None] = mapped_column(String(10), nullable=True)
    storage_location: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    movement_type: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )
    batch: Mapped[str | None] = mapped_column(String(100), nullable=True)
    qty_in_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit_of_entry: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    amount_loc_cur: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    order_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    sales_order_item: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    material_document: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    posting_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entry_date: Mapped[str | None] = mapped_column(String(50), nullable=True)
    time_of_entry: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    user_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    document_header_text: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    reservation: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    special_stock: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    supplier: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_order: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    cost_center: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sales_order: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    # Additional fields used during CSV import
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    document_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    company_code: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<BaywiseOutput id={self.id} material={self.material!r} "
            f"plant={self.plant!r}>"
        )


# ── PP Master ──────────────────────────────────────────────────────────


class PPMaster(Base):
    __tablename__ = "pp_master"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    material_code: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    company_code: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )
    document_type: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    page_format: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    description: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    material_class: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    per_qty_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    customer_code: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    customer_description: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    sales_order: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<PPMaster id={self.id} material={self.material_code!r} "
            f"company={self.company_code!r}>"
        )


# ── Alert Log ──────────────────────────────────────────────────────────


class AlertLog(Base):
    __tablename__ = "alert_logs"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True
    )
    alert_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="sales_daily / sales_mtd / production_daily / production_mtd",
    )
    company_code: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )
    manager_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    manager_phone: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    message_preview: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="First 200 chars of the message"
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="success / failed",
    )
    error_message: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=_utcnow()
    )
    performance_pct: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    target_lakhs: Mapped[float | None] = mapped_column(Float, nullable=True)
    actual_lakhs: Mapped[float | None] = mapped_column(Float, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<AlertLog id={self.id} type={self.alert_type!r} "
            f"status={self.status!r}>"
        )
