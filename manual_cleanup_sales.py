"""
Manual script to clean up duplicate sales data and reload from correct CSV.
Run this to fix the current 2x duplication issue.
"""

from backend.db.connection import SessionLocal
from backend.jobs.cleanup import clear_sales_data
from backend.jobs.load_sales import load_sales_from_file

def cleanup_and_reload_sales():
    """Manually cleanup and reload sales data."""
    print("=== MANUAL SALES DATA CLEANUP AND RELOAD ===")
    
    db = SessionLocal()
    try:
        # 1. Clear all existing sales data
        print("\n1. Clearing existing sales data...")
        cleared_count = clear_sales_data(db)
        print(f"   Cleared {cleared_count} rows")
        
        # 2. Reload from CSV
        print("\n2. Reloading sales data from CSV...")
        loaded_count = load_sales_from_file(db)
        
        if loaded_count > 0:
            print(f"   Successfully loaded {loaded_count} rows")
            
            # 3. Verify the fix
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
            
            print("\n✅ Cleanup and reload completed successfully!")
        else:
            print("   ❌ Failed to load sales data")
            
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_and_reload_sales()