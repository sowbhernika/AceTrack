"""
Script to reload only current month's sales data from the 3-year CSV file.
This preserves historical data while cleaning current month duplicates.
"""

from backend.db.connection import SessionLocal
from backend.jobs.cleanup import clear_sales_data
from backend.jobs.load_sales import load_sales_from_file

def reload_current_month_sales():
    """Reload only current month's sales data."""
    print("=== RELOAD CURRENT MONTH SALES DATA ===")
    
    db = SessionLocal()
    try:
        # 1. Clear only current month's data (preserving historical data)
        print("\n1. Clearing current month's sales data...")
        cleared_count = clear_sales_data(db)
        print(f"   Cleared {cleared_count} rows from current month")
        
        # 2. Reload from CSV (will filter to current month automatically)
        print("\n2. Reloading current month's sales data from 3-year CSV...")
        loaded_count = load_sales_from_file(db)
        
        if loaded_count > 0:
            print(f"   Successfully loaded {loaded_count} rows for current month")
            
            # 3. Verify the results
            print("\n3. Verification:")
            from backend.db.models import SalesByBilling
            from sqlalchemy import func
            from datetime import datetime, timedelta
            import pytz
            
            IST = pytz.timezone('Asia/Kolkata')
            yesterday = (datetime.now(IST) - timedelta(days=1)).strftime('%Y-%m-%d')
            
            # Check yesterday's data
            sales_totals = db.query(
                SalesByBilling.company_code,
                func.sum(SalesByBilling.converted_tax).label('total'),
                func.count(SalesByBilling.id).label('count')
            ).filter(
                SalesByBilling.billing_date == yesterday,
                SalesByBilling.company_code.isnot(None)
            ).group_by(SalesByBilling.company_code).all()
            
            print(f"   Sales data for {yesterday}:")
            for company, total, count in sales_totals:
                lakhs = round(total / 100_000, 2)
                print(f"     {company}: {lakhs}L ({count} records)")
            
            # Check for duplicates
            from sqlalchemy import and_
            duplicates = db.query(
                SalesByBilling.document_number,
                SalesByBilling.company_code,
                func.count(SalesByBilling.id).label('count')
            ).filter(
                SalesByBilling.billing_date == yesterday
            ).group_by(
                SalesByBilling.document_number,
                SalesByBilling.company_code
            ).having(
                func.count(SalesByBilling.id) > 1
            ).limit(3).all()
            
            if duplicates:
                print(f"   WARNING: Still found duplicates:")
                for doc, company, count in duplicates:
                    print(f"     {doc} ({company}): {count} times")
            else:
                print(f"   No duplicates found - data is clean")
            
            print("\nSUCCESS: Current month data reloaded successfully!")
        else:
            print("   FAILED: Could not load sales data")
            
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    reload_current_month_sales()