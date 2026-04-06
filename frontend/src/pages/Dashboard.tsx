import { useQuery } from "@tanstack/react-query";
import {
  Users,
  UserCheck,
  FileText,
  Database,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO, differenceInDays } from "date-fns";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  DashboardStats,
  SalesPerformance,
  ProductionPerformance,
  AlertLog,
} from "@/types";

// ---------- helpers ----------

function priorityTextColor(level: string): string {
  const l = level?.toLowerCase() ?? "";
  if (l === "zero" || l === "critical") return "text-red-700 bg-red-50 border-red-200";
  if (l === "high") return "text-orange-700 bg-orange-50 border-orange-200";
  if (l === "medium") return "text-yellow-700 bg-yellow-50 border-yellow-200";
  if (l === "low") return "text-blue-700 bg-blue-50 border-blue-200";
  if (l === "on target") return "text-green-700 bg-green-50 border-green-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

function progressBarColor(pct: number): string {
  if (pct < 50) return "bg-red-500";
  if (pct < 75) return "bg-orange-500";
  if (pct < 90) return "bg-yellow-500";
  return "bg-green-500";
}

function formatLakhs(val: number): string {
  return val.toFixed(2);
}

function safeDateFormat(dateStr: string | null | undefined, fmt: string): string {
  if (!dateStr) return "N/A";
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

// ---------- skeleton components ----------

function CardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-full bg-slate-200" />
        <div className="flex-1 space-y-2">
          <div className="h-6 w-20 animate-pulse rounded bg-slate-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-64 w-full animate-pulse rounded bg-slate-100" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-5 w-40 animate-pulse rounded bg-slate-200" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            {Array.from({ length: 6 }).map((_, j) => (
              <div
                key={j}
                className="h-4 flex-1 animate-pulse rounded bg-slate-200"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- stat card ----------

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  iconBg: string;
  iconColor: string;
}

function StatCard({ icon: Icon, label, value, iconBg, iconColor }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            iconBg
          )}
        >
          <Icon className={cn("h-6 w-6", iconColor)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          <p className="text-sm text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ---------- company card ----------

interface CompanyCardProps {
  companyCode: string;
  location: string;
  sales?: SalesPerformance;
  production?: ProductionPerformance;
}

function CompanyCard({ companyCode, location, sales, production }: CompanyCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{companyCode}</h3>
          <p className="text-sm text-slate-500">{location}</p>
        </div>
        {(sales || production) && (
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              priorityTextColor(sales?.priority_level ?? production?.priority_level ?? "")
            )}
          >
            {sales?.priority_level ?? production?.priority_level ?? "N/A"}
          </span>
        )}
      </div>

      {/* Sales */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Sales</span>
          <span className="text-slate-500">
            {sales
              ? `${formatLakhs(sales.sales_lakhs)} / ${formatLakhs(sales.target_lakhs)} L`
              : "No data"}
          </span>
        </div>
        {sales && (
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressBarColor(sales.performance_pct)
              )}
              style={{ width: `${Math.min(sales.performance_pct, 100)}%` }}
            />
          </div>
        )}
        {sales && (
          <p className="mt-1 text-xs text-slate-400">
            {sales.performance_pct.toFixed(1)}% of target
          </p>
        )}
      </div>

      {/* Production */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Production</span>
          <span className="text-slate-500">
            {production
              ? `${formatLakhs(production.production_lakhs)} / ${formatLakhs(production.target_lakhs)} L`
              : "No data"}
          </span>
        </div>
        {production && (
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressBarColor(production.performance_pct)
              )}
              style={{ width: `${Math.min(production.performance_pct, 100)}%` }}
            />
          </div>
        )}
        {production && (
          <p className="mt-1 text-xs text-slate-400">
            {production.performance_pct.toFixed(1)}% of target
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- custom tooltip for recharts ----------

interface ChartTooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-1 text-sm font-medium text-slate-900">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatLakhs(entry.value)} L
        </p>
      ))}
    </div>
  );
}

// ---------- main component ----------

export default function Dashboard() {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["dashboard", "stats"],
    queryFn: () => api.get("/dashboard/stats").then((r) => r.data),
  });

  const salesQuery = useQuery<SalesPerformance[]>({
    queryKey: ["dashboard", "sales", "daily"],
    queryFn: () => api.get("/dashboard/sales/daily").then((r) => r.data),
  });

  const productionQuery = useQuery<ProductionPerformance[]>({
    queryKey: ["dashboard", "production", "daily"],
    queryFn: () => api.get("/dashboard/production/daily").then((r) => r.data),
  });

  const alertsQuery = useQuery<AlertLog[]>({
    queryKey: ["dashboard", "alerts", "recent"],
    queryFn: () => api.get("/dashboard/alerts/recent").then((r) => r.data),
  });

  const stats = statsQuery.data;
  const sales = salesQuery.data ?? [];
  const production = productionQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];

  // Billing cycle progress
  let cycleElapsed = 0;
  let cycleDays = 0;
  let cycleProgress = 0;
  if (stats?.current_billing_cycle) {
    const cycle = stats.current_billing_cycle;
    const start =
      typeof cycle === "string"
        ? parseISO(cycle)
        : parseISO(cycle.start);
    const end =
      typeof cycle === "string"
        ? new Date()
        : parseISO(cycle.end);
    const now = new Date();
    cycleDays = differenceInDays(end, start) + 1;
    cycleElapsed = Math.max(0, Math.min(cycleDays, differenceInDays(now, start) + 1));
    cycleProgress = cycleDays > 0 ? (cycleElapsed / cycleDays) * 100 : 0;
  }

  // Build unique company list
  const companyCodes = Array.from(
    new Set([
      ...sales.map((s) => s.company_code),
      ...production.map((p) => p.company_code),
    ])
  );

  // Recent 10 alerts
  const recentAlerts = alerts.slice(0, 10);

  return (
    <div className="space-y-6 p-6">
      {/* ---------- Stats Cards ---------- */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : stats ? (
          <>
            <StatCard
              icon={Users}
              label="Total Managers"
              value={stats.total_managers}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
            />
            <StatCard
              icon={UserCheck}
              label="Active Managers"
              value={stats.active_managers}
              iconBg="bg-green-100"
              iconColor="text-green-600"
            />
            <StatCard
              icon={FileText}
              label="Sales Records"
              value={stats.total_sales_records}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
            />
            <StatCard
              icon={Database}
              label="Baywise Records"
              value={stats.total_baywise_records}
              iconBg="bg-orange-100"
              iconColor="text-orange-600"
            />
          </>
        ) : (
          <div className="col-span-full rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p>Unable to load dashboard stats.</p>
          </div>
        )}
      </div>

      {/* ---------- Billing Cycle Banner ---------- */}
      {statsQuery.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
      ) : stats?.current_billing_cycle ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Current Billing Cycle
              </h3>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span>
                {typeof stats.current_billing_cycle === "string"
                  ? stats.current_billing_cycle
                  : `${safeDateFormat(stats.current_billing_cycle.start, "dd MMM yyyy")} - ${safeDateFormat(stats.current_billing_cycle.end, "dd MMM yyyy")}`}
              </span>
              <span className="font-medium text-slate-700">
                {cycleElapsed} / {cycleDays} days
              </span>
            </div>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-700"
              style={{ width: `${Math.min(cycleProgress, 100)}%` }}
            />
          </div>
          {stats.last_data_refresh && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              Last data refresh: {safeDateFormat(stats.last_data_refresh, "dd MMM yyyy, hh:mm a")}
            </p>
          )}
        </div>
      ) : null}

      {/* ---------- Performance Charts ---------- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sales Performance Chart */}
        {salesQuery.isLoading ? (
          <ChartSkeleton />
        ) : sales.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">
              Sales Performance (Lakhs)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={sales}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="company_code"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="target_lakhs"
                  name="Target"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
                <Bar
                  dataKey="sales_lakhs"
                  name="Actual"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
            No sales data available
          </div>
        )}

        {/* Production Performance Chart */}
        {productionQuery.isLoading ? (
          <ChartSkeleton />
        ) : production.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">
              Production Performance (Lakhs)
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={production}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="company_code"
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar
                  dataKey="target_lakhs"
                  name="Target"
                  fill="#cbd5e1"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
                <Bar
                  dataKey="production_lakhs"
                  name="Actual"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
            No production data available
          </div>
        )}
      </div>

      {/* ---------- Company Cards ---------- */}
      {salesQuery.isLoading && productionQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-200" />
          ))}
        </div>
      ) : companyCodes.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companyCodes.map((code) => {
            const s = sales.find((x) => x.company_code === code);
            const p = production.find((x) => x.company_code === code);
            return (
              <CompanyCard
                key={code}
                companyCode={code}
                location={s?.location ?? p?.location ?? ""}
                sales={s}
                production={p}
              />
            );
          })}
        </div>
      ) : null}

      {/* ---------- Recent Alerts Table ---------- */}
      {alertsQuery.isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Recent Alerts
            </h3>
          </div>

          {recentAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <AlertTriangle className="mb-2 h-8 w-8" />
              <p className="text-sm">No recent alerts</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="whitespace-nowrap px-6 py-3 font-medium text-slate-500">
                      Time
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 font-medium text-slate-500">
                      Type
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 font-medium text-slate-500">
                      Company
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 font-medium text-slate-500">
                      Manager
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 font-medium text-slate-500">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-6 py-3 font-medium text-slate-500">
                      Performance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentAlerts.map((alert, idx) => (
                    <tr
                      key={alert.id}
                      className={cn(
                        "border-b border-slate-50 transition-colors hover:bg-slate-50",
                        idx % 2 === 1 && "bg-slate-25"
                      )}
                    >
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                        {safeDateFormat(alert.sent_at, "dd MMM, hh:mm a")}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            alert.alert_type?.includes("sales")
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          )}
                        >
                          {alert.alert_type}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-slate-900">
                        {alert.company_code}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                        {alert.manager_name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {alert.status === "success" ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span
                            className={cn(
                              "text-xs font-medium",
                              alert.status === "success"
                                ? "text-green-700"
                                : "text-red-700"
                            )}
                          >
                            {alert.status}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            alert.performance_pct >= 90
                              ? "text-green-600"
                              : alert.performance_pct >= 75
                                ? "text-yellow-600"
                                : alert.performance_pct >= 50
                                  ? "text-orange-600"
                                  : "text-red-600"
                          )}
                        >
                          {alert.performance_pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
