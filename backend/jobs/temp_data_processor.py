"""
Temporary Data Processor - Extract, clean and process current month data
without modifying the original 3-year database.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
import calendar
import pytz

from sqlalchemy import create_engine, text, func
from sqlalchemy.orm import Session, sessionmaker
import pandas as pd

from backend.config import settings
from backend.db.models import SalesByBilling, BaywiseOutput

logger = logging.getLogger(__name__)

IST = pytz.timezone(settings.TIMEZONE)

class TempDataProcessor:
    """Handles temporary data extraction and processing."""
    
    def __init__(self, db_session: Session):
        self.db_session = db_session
        self.engine = db_session.bind
        
    def get_current_month_range(self):
        """Get current month date range."""
        today = datetime.now(IST).date()
        month_start = today.replace(day=1)
        last_day = calendar.monthrange(today.year, today.month)[1]
        month_end = today.replace(day=last_day)
        return month_start.strftime('%Y-%m-%d'), month_end.strftime('%Y-%m-%d')
    
    def create_temp_sales_table(self):
        """Create temporary table for current month sales data."""
        try:
            # Drop if exists
            self.db_session.execute(text("DROP TABLE IF EXISTS temp_sales_current_month"))
            
            # Create temp table with same structure as sales_by_billing
            create_sql = """
            CREATE TEMPORARY TABLE temp_sales_current_month AS 
            SELECT * FROM sales_by_billing WHERE 1=0
            """
            self.db_session.execute(text(create_sql))
            self.db_session.commit()
            logger.info("Created temporary sales table")
            
        except Exception as e:
            logger.error(f"Failed to create temp table: {e}")
            raise
    
    def extract_and_clean_current_month_sales(self):
        """Extract current month sales data and remove duplicates."""
        month_start, month_end = self.get_current_month_range()
        
        try:
            # 1. Extract current month data to temp table
            extract_sql = f"""
            INSERT INTO temp_sales_current_month
            SELECT * FROM sales_by_billing 
            WHERE billing_date >= '{month_start}' 
            AND billing_date <= '{month_end}'
            """
            result = self.db_session.execute(text(extract_sql))
            extracted_count = result.rowcount
            logger.info(f"Extracted {extracted_count} current month records to temp table")

            # NOTE: no dedup here. SAP intentionally emits identical-looking rows
            # for separate physical fulfillments of the same line — those are real
            # sales. The previous DELETE-by-MIN(id) was correctly keyed on every
            # business column including converted_tax/taxable_value, which made it
            # equivalent to drop_duplicates(all_columns) and erased legitimate
            # repeated lines (e.g. the APE USD-export rows on doc 0700000340).
            duplicates_removed = 0

            # Get final count
            final_count_result = self.db_session.execute(text("SELECT COUNT(*) FROM temp_sales_current_month"))
            final_count = final_count_result.scalar()

            self.db_session.commit()

            logger.info(f"{final_count} records loaded into temp table (no dedup applied)")

            return final_count, duplicates_removed
            
        except Exception as e:
            logger.error(f"Failed to extract and clean data: {e}")
            raise
    
    def get_clean_sales_data(self, target_date: str = None):
        """Get clean sales data for calculations."""
        if target_date is None:
            target_date = (datetime.now(IST) - timedelta(days=1)).strftime('%Y-%m-%d')
        
        try:
            # Query clean data from temp table
            sales_data = self.db_session.execute(text(f"""
                SELECT company_code, 
                       SUM(converted_tax) as total_converted_tax,
                       COUNT(*) as record_count
                FROM temp_sales_current_month 
                WHERE billing_date = '{target_date}'
                AND company_code IS NOT NULL
                GROUP BY company_code
            """)).fetchall()
            
            return sales_data
            
        except Exception as e:
            logger.error(f"Failed to get clean sales data: {e}")
            raise
    
    def get_clean_sales_data_range(self, start_date: str, end_date: str):
        """Get clean sales data for a date range."""
        try:
            # Query clean data from temp table for date range
            sales_data = self.db_session.execute(text(f"""
                SELECT company_code, 
                       SUM(converted_tax) as total_converted_tax,
                       COUNT(*) as record_count
                FROM temp_sales_current_month 
                WHERE billing_date >= '{start_date}' 
                AND billing_date <= '{end_date}'
                AND company_code IS NOT NULL
                GROUP BY company_code
            """)).fetchall()
            
            return sales_data
            
        except Exception as e:
            logger.error(f"Failed to get clean sales data for range: {e}")
            raise
    
    def cleanup_temp_tables(self):
        """Remove temporary tables."""
        try:
            self.db_session.execute(text("DROP TABLE IF EXISTS temp_sales_current_month"))
            self.db_session.commit()
            logger.info("Cleaned up temporary tables")
        except Exception as e:
            logger.warning(f"Failed to cleanup temp tables: {e}")


def get_clean_current_month_sales(db_session: Session, target_date: str = None):
    """
    Get clean sales data for target date using temporary processing.
    Returns dict with company totals in lakhs.
    """
    processor = TempDataProcessor(db_session)
    
    try:
        # 1. Create temp table and extract clean data
        processor.create_temp_sales_table()
        final_count, duplicates_removed = processor.extract_and_clean_current_month_sales()
        
        # 2. Get clean data for target date
        sales_data = processor.get_clean_sales_data(target_date)
        
        # 3. Convert to lakhs
        sales_by_company = {}
        for company_code, total_converted_tax, record_count in sales_data:
            lakhs = round(total_converted_tax / 100_000, 2)
            sales_by_company[company_code] = {
                'daily_sales_lakhs': lakhs,
                'record_count': record_count
            }
        
        logger.info(f"Clean sales data: {len(sales_by_company)} companies, {duplicates_removed} duplicates removed")
        return sales_by_company
        
    finally:
        # 4. Always cleanup
        processor.cleanup_temp_tables()


def get_clean_current_month_sales_range(db_session: Session, start_date: str, end_date: str):
    """
    Get clean sales data for date range using temporary processing.
    Returns dict with company totals in lakhs.
    """
    processor = TempDataProcessor(db_session)
    
    try:
        # 1. Create temp table and extract clean data
        processor.create_temp_sales_table()
        final_count, duplicates_removed = processor.extract_and_clean_current_month_sales()
        
        # 2. Get clean data for date range
        sales_data = processor.get_clean_sales_data_range(start_date, end_date)
        
        # 3. Convert to lakhs
        sales_by_company = {}
        for company_code, total_converted_tax, record_count in sales_data:
            lakhs = round(total_converted_tax / 100_000, 2)
            sales_by_company[company_code] = {
                'mtd_sales_lakhs': lakhs,
                'record_count': record_count
            }
        
        logger.info(f"Clean MTD sales data: {len(sales_by_company)} companies, {duplicates_removed} duplicates removed")
        return sales_by_company
        
    finally:
        # 4. Always cleanup
        processor.cleanup_temp_tables()