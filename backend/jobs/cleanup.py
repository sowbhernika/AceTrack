"""
Acetech Escalation System - Data Cleanup Jobs.

Functions that truncate staging tables before the daily CSV refresh.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from backend.db.models import BaywiseOutput, SalesByBilling

logger = logging.getLogger(__name__)


def clear_sales_data(db_session: Session) -> int:
    """Delete all rows from the ``sales_by_billing`` table.

    Returns the number of rows deleted.
    """
    try:
        count = db_session.query(SalesByBilling).delete()
        db_session.commit()
        logger.info("Cleared %d rows from sales_by_billing", count)
        return count
    except Exception:
        db_session.rollback()
        logger.exception("Failed to clear sales_by_billing")
        raise


def clear_baywise_data(db_session: Session) -> int:
    """Delete all rows from the ``baywise_output`` table.

    Returns the number of rows deleted.
    """
    try:
        count = db_session.query(BaywiseOutput).delete()
        db_session.commit()
        logger.info("Cleared %d rows from baywise_output", count)
        return count
    except Exception:
        db_session.rollback()
        logger.exception("Failed to clear baywise_output")
        raise
