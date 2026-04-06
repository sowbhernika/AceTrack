"""
Acetech Escalation System - Database package.

Re-exports models, connection helpers, and Pydantic schemas so that
consumers can do::

    from backend.db import Manager, get_db, ManagerCreate
"""

from backend.db.connection import (
    SessionLocal,
    create_all_tables,
    engine,
    get_db,
)
from backend.db.models import (
    AlertLog,
    Base,
    BaywiseOutput,
    Manager,
    PPMaster,
    ProductionPlan,
    SalesByBilling,
)
from backend.db.schemas import (
    AlertLogResponse,
    DashboardStats,
    FileUploadResponse,
    ManagerBulkToggle,
    ManagerCreate,
    ManagerResponse,
    ManagerUpdate,
    PerformanceResponse,
)

__all__ = [
    # models
    "Base",
    "Manager",
    "SalesByBilling",
    "ProductionPlan",
    "BaywiseOutput",
    "PPMaster",
    "AlertLog",
    # connection
    "engine",
    "SessionLocal",
    "get_db",
    "create_all_tables",
    # schemas
    "ManagerCreate",
    "ManagerUpdate",
    "ManagerResponse",
    "ManagerBulkToggle",
    "FileUploadResponse",
    "AlertLogResponse",
    "PerformanceResponse",
    "DashboardStats",
]
