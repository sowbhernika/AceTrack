"""
Acetech Escalation System - Manager CRUD routes.

Provides endpoints for creating, reading, updating, and deleting manager
records, as well as bulk operations (CSV upload, toggle active status).
"""

from __future__ import annotations

import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db.connection import get_db
from backend.db.models import Manager
from backend.db.schemas import (
    ManagerBulkToggle,
    ManagerCreate,
    ManagerResponse,
    ManagerUpdate,
)

router = APIRouter(prefix="/api/managers", tags=["Managers"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _derive_company_code(plant: str | None) -> str | None:
    """Return the company code for a plant, or None if the plant is unknown."""
    if plant is None:
        return None
    return settings.PLANT_TO_COMPANY.get(plant)


def _validate_plant(plant: str) -> None:
    """Raise 400 if the plant code is not recognised."""
    if plant not in settings.VALID_PLANTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plant '{plant}'. Must be one of {settings.VALID_PLANTS}.",
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/", response_model=list[ManagerResponse])
def list_managers(
    plant: Optional[str] = Query(None, description="Filter by plant code"),
    department: Optional[str] = Query(None, description="Filter by department"),
    company_code: Optional[str] = Query(None, description="Filter by company code"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: Session = Depends(get_db),
):
    """List all managers with optional filters."""
    query = db.query(Manager)

    if plant is not None:
        query = query.filter(Manager.plant == plant)
    if department is not None:
        query = query.filter(Manager.department == department)
    if company_code is not None:
        query = query.filter(Manager.company_code == company_code)
    if is_active is not None:
        query = query.filter(Manager.is_active == is_active)

    return query.all()


@router.get("/by-plant/{plant}", response_model=list[ManagerResponse])
def get_managers_by_plant(plant: str, db: Session = Depends(get_db)):
    """Get all managers belonging to a specific plant."""
    _validate_plant(plant)
    managers = db.query(Manager).filter(Manager.plant == plant).all()
    return managers


@router.get("/{id}", response_model=ManagerResponse)
def get_manager(id: int, db: Session = Depends(get_db)):
    """Get a single manager by ID."""
    manager = db.query(Manager).filter(Manager.id == id).first()
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Manager with id {id} not found.",
        )
    return manager


@router.post("/", response_model=ManagerResponse, status_code=status.HTTP_201_CREATED)
def create_manager(payload: ManagerCreate, db: Session = Depends(get_db)):
    """Create a new manager. Company code is auto-derived from plant."""
    if payload.plant:
        _validate_plant(payload.plant)

    company_code = _derive_company_code(payload.plant)
    if payload.plant and company_code is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot derive company code for plant '{payload.plant}'.",
        )

    manager = Manager(
        **payload.model_dump(exclude={"company_code"}),
        company_code=company_code,
    )
    db.add(manager)
    db.commit()
    db.refresh(manager)
    return manager


@router.put("/{id}", response_model=ManagerResponse)
def update_manager(id: int, payload: ManagerUpdate, db: Session = Depends(get_db)):
    """Update an existing manager. Re-derives company_code when plant changes."""
    manager = db.query(Manager).filter(Manager.id == id).first()
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Manager with id {id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    # Re-derive company code when plant is updated
    if "plant" in update_data:
        new_plant = update_data["plant"]
        _validate_plant(new_plant)
        company_code = _derive_company_code(new_plant)
        if company_code is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot derive company code for plant '{new_plant}'.",
            )
        update_data["company_code"] = company_code

    for field, value in update_data.items():
        setattr(manager, field, value)

    db.commit()
    db.refresh(manager)
    return manager


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_manager(id: int, db: Session = Depends(get_db)):
    """Delete a manager by ID."""
    manager = db.query(Manager).filter(Manager.id == id).first()
    if not manager:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Manager with id {id} not found.",
        )

    db.delete(manager)
    db.commit()
    return None


@router.post("/bulk-upload")
def bulk_upload_managers(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a CSV file to bulk-insert managers.

    Expected CSV columns should map to manager fields (at minimum: name, plant,
    department, phone). Company code is auto-derived from plant.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are accepted.",
        )

    try:
        contents = file.file.read().decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File encoding must be UTF-8.",
        )

    reader = csv.DictReader(io.StringIO(contents))
    inserted = 0
    errors: list[str] = []

    for row_num, row in enumerate(reader, start=2):  # row 1 is header
        # Normalise keys: strip whitespace and lower-case
        row = {k.strip().lower().replace(" ", "_"): v.strip() for k, v in row.items() if k}

        plant = row.get("plant", "")
        if plant and plant not in settings.VALID_PLANTS:
            errors.append(f"Row {row_num}: invalid plant '{plant}'.")
            continue

        company_code = _derive_company_code(plant) if plant else None

        manager = Manager(
            manager_name=row.get("manager_name", row.get("name", "")),
            plant=plant or None,
            department=row.get("department", ""),
            manager_phone=row.get("manager_phone", row.get("phone", "")),
            manager_email=row.get("manager_email", row.get("email", "")) or None,
            company_code=company_code,
            is_active=row.get("is_active", "true").lower() in ("true", "1", "yes"),
        )
        db.add(manager)
        inserted += 1

    if inserted > 0:
        db.commit()

    return {
        "inserted": inserted,
        "errors": errors,
        "message": f"Successfully inserted {inserted} manager(s).",
    }


@router.patch("/bulk-toggle")
def bulk_toggle_managers(payload: ManagerBulkToggle, db: Session = Depends(get_db)):
    """Toggle is_active for a list of manager IDs."""
    if not payload.ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ids list must not be empty.",
        )

    result = db.execute(
        update(Manager)
        .where(Manager.id.in_(payload.ids))
        .values(is_active=payload.is_active)
    )
    db.commit()

    return {
        "updated": result.rowcount,
        "is_active": payload.is_active,
        "message": f"Updated {result.rowcount} manager(s).",
    }


@router.patch("/toggle-all")
def toggle_all_managers(payload: ManagerBulkToggle, db: Session = Depends(get_db)):
    """Toggle is_active for ALL managers."""
    result = db.execute(
        update(Manager).values(is_active=payload.is_active)
    )
    db.commit()

    return {
        "updated": result.rowcount,
        "is_active": payload.is_active,
        "message": f"Updated {result.rowcount} manager(s).",
    }
