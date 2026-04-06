"""
Acetech Escalation System - Pydantic Schemas (request / response models).

All schemas use Pydantic v2 conventions (``model_config`` instead of the
inner ``Config`` class).
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ═══════════════════════════════════════════════════════════════════════
#  Manager
# ═══════════════════════════════════════════════════════════════════════


class ManagerCreate(BaseModel):
    """Payload for creating a new manager."""

    manager_name: str = Field(..., min_length=1, max_length=255)
    manager_phone: str = Field(
        ..., min_length=10, max_length=20, description="Phone with country code"
    )
    manager_email: str | None = Field(
        default=None, max_length=255, description="Optional email address"
    )
    department: str | None = Field(default=None, max_length=100)
    plant: str = Field(
        ...,
        max_length=10,
        description="SAP plant code: AM03 / AM07 / AP01 / AH05",
    )
    company_code: str | None = Field(
        default=None,
        max_length=10,
        description="Company code: AMC / APE / AHF",
    )
    is_active: bool = True


class ManagerUpdate(BaseModel):
    """Payload for updating an existing manager.  All fields optional."""

    manager_name: str | None = Field(default=None, min_length=1, max_length=255)
    manager_phone: str | None = Field(default=None, min_length=10, max_length=20)
    manager_email: str | None = Field(default=None, max_length=255)
    department: str | None = Field(default=None, max_length=100)
    plant: str | None = Field(default=None, max_length=10)
    company_code: str | None = Field(default=None, max_length=10)
    is_active: bool | None = None


class ManagerResponse(BaseModel):
    """Shape returned when reading a manager record."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    manager_name: str
    manager_phone: str
    manager_email: str | None = None
    department: str | None = None
    plant: str
    company_code: str | None = None
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ManagerBulkToggle(BaseModel):
    """Bulk activate / deactivate managers by their IDs."""

    ids: list[int] = Field(..., min_length=1, description="Manager IDs")
    is_active: bool = Field(
        ..., description="true = activate, false = deactivate"
    )


# ═══════════════════════════════════════════════════════════════════════
#  File Upload
# ═══════════════════════════════════════════════════════════════════════


class FileUploadResponse(BaseModel):
    """Acknowledgement after a CSV/Excel upload."""

    filename: str
    rows_imported: int
    message: str = "File imported successfully"


# ═══════════════════════════════════════════════════════════════════════
#  Alert Log
# ═══════════════════════════════════════════════════════════════════════


class AlertLogResponse(BaseModel):
    """Shape returned when reading alert log records."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    alert_type: str
    company_code: str | None = None
    manager_name: str | None = None
    manager_phone: str | None = None
    message_preview: str | None = None
    status: str
    error_message: str | None = None
    sent_at: datetime | None = None
    performance_pct: float | None = None
    target_lakhs: float | None = None
    actual_lakhs: float | None = None


# ═══════════════════════════════════════════════════════════════════════
#  Performance / Dashboard
# ═══════════════════════════════════════════════════════════════════════


class PerformanceResponse(BaseModel):
    """Per-company performance snapshot."""

    company_code: str
    company_location: str | None = None
    sales_actual_lakhs: float = 0.0
    sales_target_lakhs: float = 0.0
    sales_pct: float = 0.0
    sales_priority: str = "ZERO"
    production_actual_lakhs: float = 0.0
    production_target_lakhs: float = 0.0
    production_pct: float = 0.0
    production_priority: str = "ZERO"


class CompanySummary(BaseModel):
    """Lightweight summary used inside DashboardStats."""

    company_code: str
    company_location: str | None = None
    sales_actual_lakhs: float = 0.0
    sales_target_lakhs: float = 0.0
    sales_pct: float = 0.0
    sales_priority: str = "ZERO"
    production_actual_lakhs: float = 0.0
    production_target_lakhs: float = 0.0
    production_pct: float = 0.0
    production_priority: str = "ZERO"


class DashboardStats(BaseModel):
    """Aggregated dashboard payload returned to the frontend."""

    billing_cycle_start: str | None = None
    billing_cycle_end: str | None = None
    total_sales_actual_lakhs: float = 0.0
    total_sales_target_lakhs: float = 0.0
    total_production_actual_lakhs: float = 0.0
    total_production_target_lakhs: float = 0.0
    companies: list[CompanySummary] = []
    alerts_sent_today: int = 0
    active_managers: int = 0
