export interface Manager {
  id: number;
  manager_name: string;
  manager_phone: string;
  manager_email: string;
  department: string;
  plant: string;
  company_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesPerformance {
  company_code: string;
  location: string;
  sales_lakhs: number;
  target_lakhs: number;
  performance_pct: number;
  gap_to_target: number;
  priority_level: string;
  transaction_count: number;
  unique_customers: number;
}

export interface ProductionPerformance {
  company_code: string;
  location: string;
  production_lakhs: number;
  target_lakhs: number;
  performance_pct: number;
  gap_to_target: number;
  priority_level: string;
  matched_materials: number;
  total_materials: number;
}

export interface MTDPerformance {
  company_code: string;
  location: string;
  production_lakhs?: number;
  sales_lakhs?: number;
  target_lakhs: number;
  performance_pct: number;
  gap_to_target: number;
  priority_level: string;
  day_number: number;
  total_cycle_days: number;
  daily_avg: number;
  projected: number;
  cycle_start: string;
  cycle_end: string;
  as_on_date: string;
  matched_materials?: number;
  total_materials?: number;
  transaction_count?: number;
  unique_customers?: number;
}

export interface AlertLog {
  id: number;
  alert_type: string;
  company_code: string;
  manager_name: string;
  manager_phone: string;
  status: string;
  sent_at: string;
  performance_pct: number;
  message_preview?: string;
  error_message?: string;
  target_lakhs?: number;
  actual_lakhs?: number;
}

export interface DashboardStats {
  total_managers: number;
  active_managers: number;
  total_sales_records: number;
  total_baywise_records: number;
  total_pp_master_records: number;
  total_production_plan_records: number;
  current_billing_cycle: { start: string; end: string };
  last_data_refresh: string | null;
}
