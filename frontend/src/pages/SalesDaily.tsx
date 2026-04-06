import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { TrendingUp, TrendingDown, Users, Receipt, Calendar } from "lucide-react";
import { format, subDays } from "date-fns";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface SalesPerformance {
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

const COMPANY_COLORS: Record<string, string> = {
  AMC: "#3b82f6",
  APE: "#22c55e",
  AHF: "#f97316",
};

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  ZERO: { bg: "bg-red-50", text: "text-red-700", ring: "stroke-red-500", dot: "bg-red-500" },
  Critical: { bg: "bg-red-50", text: "text-red-700", ring: "stroke-red-500", dot: "bg-red-500" },
  High: { bg: "bg-orange-50", text: "text-orange-700", ring: "stroke-orange-500", dot: "bg-orange-500" },
  Medium: { bg: "bg-amber-50", text: "text-amber-700", ring: "stroke-amber-500", dot: "bg-amber-500" },
  Low: { bg: "bg-blue-50", text: "text-blue-700", ring: "stroke-blue-500", dot: "bg-blue-500" },
  "On Target": { bg: "bg-green-50", text: "text-green-700", ring: "stroke-green-500", dot: "bg-green-500" },
};

function getPriorityConfig(priority: string) {
  return PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG["Medium"];
}

function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    ZERO: "#ef4444",
    Critical: "#ef4444",
    High: "#f97316",
    Medium: "#f59e0b",
    Low: "#3b82f6",
    "On Target": "#22c55e",
  };
  return map[priority] ?? "#6b7280";
}

function formatLakhs(value: number): string {
  return `${value.toFixed(2)}L`;
}

function CircularProgress({ pct, color, size = 100 }: { pct: number; color: string; size?: number }) {
  const clampedPct = Math.min(Math.max(pct, 0), 100);
  const data = [
    { name: "achieved", value: clampedPct },
    { name: "remaining", value: 100 - clampedPct },
  ];
  return (
    <PieChart width={size} height={size}>
      <Pie
        data={data}
        cx={size / 2}
        cy={size / 2}
        innerRadius={size * 0.32}
        outerRadius={size * 0.44}
        startAngle={90}
        endAngle={-270}
        dataKey="value"
        stroke="none"
      >
        <Cell fill={color} />
        <Cell fill="#e5e7eb" />
      </Pie>
    </PieChart>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-72 animate-pulse rounded-lg bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-80 animate-pulse rounded-xl border bg-gray-100" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl border bg-gray-100" />
      <div className="h-64 animate-pulse rounded-xl border bg-gray-100" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16 shadow-sm">
      <TrendingUp className="mb-4 h-12 w-12 text-gray-300" />
      <p className="text-lg font-medium text-gray-500">No data available</p>
      <p className="mt-1 text-sm text-gray-400">Sales performance data will appear here once available.</p>
    </div>
  );
}

function CompanyCard({ data }: { data: SalesPerformance }) {
  const borderColor = COMPANY_COLORS[data.company_code] ?? "#6b7280";
  const priorityConf = getPriorityConfig(data.priority_level);
  const priorityColor = getPriorityColor(data.priority_level);

  return (
    <div
      className="flex flex-col rounded-xl border bg-white shadow-sm"
      style={{ borderLeftWidth: "4px", borderLeftColor: borderColor }}
    >
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900">{data.company_code}</h3>
        <p className="text-sm text-gray-500">{data.location}</p>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 py-5">
        <div className="relative flex items-center justify-center">
          <CircularProgress pct={data.performance_pct} color={priorityColor} size={120} />
          <span
            className="absolute text-2xl font-bold"
            style={{ color: priorityColor }}
          >
            {data.performance_pct.toFixed(1)}%
          </span>
        </div>

        <div className="mt-4 w-full space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Sales</span>
            <span className="font-semibold text-gray-900">{"\u20B9"}{formatLakhs(data.sales_lakhs)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Target</span>
            <span className="font-semibold text-gray-900">{"\u20B9"}{formatLakhs(data.target_lakhs)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Gap</span>
            <span
              className={cn(
                "font-semibold",
                data.gap_to_target < 0 ? "text-red-600" : "text-green-600"
              )}
            >
              {"\u20B9"}{formatLakhs(Math.abs(data.gap_to_target))}
              {data.gap_to_target < 0 ? " short" : " ahead"}
            </span>
          </div>
        </div>

        <div className="mt-4 flex w-full items-center justify-center gap-6 border-t pt-4 text-sm text-gray-600">
          <div className="flex items-center gap-1.5">
            <Receipt className="h-4 w-4 text-gray-400" />
            <span>{data.transaction_count}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4 text-gray-400" />
            <span>{data.unique_customers}</span>
          </div>
        </div>
      </div>

      <div className="border-t px-6 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            priorityConf.bg,
            priorityConf.text
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", priorityConf.dot)} />
          {data.priority_level}
        </span>
      </div>
    </div>
  );
}

function ComparisonBarChart({ data }: { data: SalesPerformance[] }) {
  const chartData = data.map((d) => ({
    company: d.company_code,
    Actual: d.sales_lakhs,
    Target: d.target_lakhs,
  }));

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Sales vs Target Comparison</h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="company" tick={{ fontSize: 13 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => `${v}L`}
            label={{ value: "Lakhs (\u20B9)", angle: -90, position: "insideLeft", offset: -5, style: { fontSize: 12 } }}
          />
          <Tooltip
            formatter={(value: number) => [`\u20B9${value.toFixed(2)}L`, undefined]}
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
          />
          <Legend />
          <Bar dataKey="Actual" fill="#22c55e" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11, formatter: (v: number) => `${v.toFixed(1)}L` }} />
          <Bar dataKey="Target" fill="#d1d5db" radius={[4, 4, 0, 0]} label={{ position: "top", fontSize: 11, formatter: (v: number) => `${v.toFixed(1)}L` }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerformanceTable({ data }: { data: SalesPerformance[] }) {
  const sorted = [...data].sort((a, b) => a.performance_pct - b.performance_pct);
  const worstCode = sorted.length > 0 ? sorted[0].company_code : null;

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900">Performance Details</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Company</th>
              <th className="px-6 py-3">Location</th>
              <th className="px-6 py-3 text-right">Sales ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">Target ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">Achievement %</th>
              <th className="px-6 py-3 text-right">Gap ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">Transactions</th>
              <th className="px-6 py-3 text-right">Customers</th>
              <th className="px-6 py-3">Priority</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const conf = getPriorityConfig(row.priority_level);
              const isWorst = row.company_code === worstCode;
              return (
                <tr
                  key={row.company_code}
                  className={cn(
                    "border-b transition-colors last:border-b-0 hover:bg-gray-50",
                    isWorst && "bg-red-50/40"
                  )}
                >
                  <td className={cn("px-6 py-4", isWorst && "font-bold")}>{row.company_code}</td>
                  <td className={cn("px-6 py-4 text-gray-600", isWorst && "font-bold")}>{row.location}</td>
                  <td className={cn("px-6 py-4 text-right", isWorst && "font-bold")}>
                    {"\u20B9"}{row.sales_lakhs.toFixed(2)}
                  </td>
                  <td className={cn("px-6 py-4 text-right", isWorst && "font-bold")}>
                    {"\u20B9"}{row.target_lakhs.toFixed(2)}
                  </td>
                  <td
                    className={cn("px-6 py-4 text-right font-medium", isWorst && "font-bold")}
                    style={{ color: getPriorityColor(row.priority_level) }}
                  >
                    {row.performance_pct.toFixed(1)}%
                  </td>
                  <td
                    className={cn(
                      "px-6 py-4 text-right",
                      row.gap_to_target < 0 ? "text-red-600" : "text-green-600",
                      isWorst && "font-bold"
                    )}
                  >
                    {"\u20B9"}{row.gap_to_target.toFixed(2)}
                  </td>
                  <td className={cn("px-6 py-4 text-right", isWorst && "font-bold")}>
                    {row.transaction_count}
                  </td>
                  <td className={cn("px-6 py-4 text-right", isWorst && "font-bold")}>
                    {row.unique_customers}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                        conf.bg,
                        conf.text
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", conf.dot)} />
                      {row.priority_level}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SalesDaily() {
  const yesterday = subDays(new Date(), 1);
  const formattedDate = format(yesterday, "dd MMM yyyy");

  const { data, isLoading, isError } = useQuery<SalesPerformance[]>({
    queryKey: ["sales", "daily"],
    queryFn: async () => {
      const res = await api.get<SalesPerformance[]>("/dashboard/sales/daily");
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16">
          <TrendingDown className="mb-4 h-12 w-12 text-red-400" />
          <p className="text-lg font-medium text-red-700">Failed to load sales data</p>
          <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Sales - Daily Performance</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            {formattedDate}
          </div>
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales - Daily Performance</h1>
        <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
          <Calendar className="h-4 w-4" />
          {formattedDate}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {data.map((item) => (
          <CompanyCard key={item.company_code} data={item} />
        ))}
      </div>

      {/* Comparison Bar Chart */}
      <ComparisonBarChart data={data} />

      {/* Performance Table */}
      <PerformanceTable data={data} />
    </div>
  );
}
