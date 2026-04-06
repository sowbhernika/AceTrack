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
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  ArrowRight,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface MTDPerformance {
  company_code: string;
  location: string;
  sales_lakhs: number;
  target_lakhs: number;
  performance_pct: number;
  gap_to_target: number;
  priority_level: string;
  transaction_count: number;
  unique_customers: number;
  day_number: number;
  total_cycle_days: number;
  daily_avg: number;
  projected: number;
  cycle_start: string;
  cycle_end: string;
  as_on_date: string;
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

function CircularGauge({ pct, color, size = 120 }: { pct: number; color: string; size?: number }) {
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
      <div className="h-8 w-80 animate-pulse rounded-lg bg-gray-200" />
      <div className="h-16 animate-pulse rounded-xl border bg-gray-100" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-96 animate-pulse rounded-xl border bg-gray-100" />
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
      <p className="mt-1 text-sm text-gray-400">
        Month-to-date sales data will appear here once available.
      </p>
    </div>
  );
}

function BillingCycleBar({ data }: { data: MTDPerformance }) {
  const cycleStart = parseISO(data.cycle_start);
  const cycleEnd = parseISO(data.cycle_end);
  const asOnDate = parseISO(data.as_on_date);
  const totalDays = differenceInDays(cycleEnd, cycleStart) || data.total_cycle_days;
  const elapsed = differenceInDays(asOnDate, cycleStart);
  const progressPct = totalDays > 0 ? Math.min((elapsed / totalDays) * 100, 100) : 0;

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">Billing Cycle Progress</span>
        <span className="text-gray-500">
          {format(cycleStart, "dd MMM")} <ArrowRight className="inline h-3 w-3" />{" "}
          {format(cycleEnd, "dd MMM yyyy")}
        </span>
      </div>
      <div className="relative h-6 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
        <div
          className="absolute top-0 flex h-full items-center"
          style={{ left: `${progressPct}%`, transform: "translateX(-50%)" }}
        >
          <div className="h-8 w-1 rounded-full bg-blue-800 shadow" />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>{format(cycleStart, "dd MMM")}</span>
        <span className="font-medium text-blue-600">
          Day {data.day_number} of {data.total_cycle_days} ({progressPct.toFixed(0)}% elapsed)
        </span>
        <span>{format(cycleEnd, "dd MMM")}</span>
      </div>
    </div>
  );
}

function MTDCompanyCard({ data }: { data: MTDPerformance }) {
  const borderColor = COMPANY_COLORS[data.company_code] ?? "#6b7280";
  const priorityConf = getPriorityConfig(data.priority_level);
  const priorityColor = getPriorityColor(data.priority_level);
  const projectedPct =
    data.target_lakhs > 0
      ? (data.projected / data.target_lakhs) * 100
      : 0;

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
        {/* Circular gauge */}
        <div className="relative flex items-center justify-center">
          <CircularGauge pct={data.performance_pct} color={priorityColor} size={120} />
          <span
            className="absolute text-2xl font-bold"
            style={{ color: priorityColor }}
          >
            {data.performance_pct.toFixed(1)}%
          </span>
        </div>

        {/* Metrics */}
        <div className="mt-4 w-full space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">MTD Sales</span>
            <span className="font-semibold text-gray-900">
              {"\u20B9"}{formatLakhs(data.sales_lakhs)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">MTD Target</span>
            <span className="font-semibold text-gray-900">
              {"\u20B9"}{formatLakhs(data.target_lakhs)}
            </span>
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
          <div className="flex items-center justify-between border-t pt-2">
            <span className="text-gray-500">Daily Average</span>
            <span className="font-semibold text-gray-900">
              {"\u20B9"}{formatLakhs(data.daily_avg)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Projected</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">
                {"\u20B9"}{formatLakhs(data.projected)}
              </span>
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                  projectedPct >= 100
                    ? "bg-green-50 text-green-700"
                    : projectedPct >= 80
                      ? "bg-amber-50 text-amber-700"
                      : "bg-red-50 text-red-700"
                )}
              >
                {projectedPct.toFixed(0)}%
              </span>
            </div>
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

function MTDBarChart({ data }: { data: MTDPerformance[] }) {
  const chartData = data.map((d) => ({
    company: d.company_code,
    "MTD Actual": d.sales_lakhs,
    "MTD Target": d.target_lakhs,
    Projected: d.projected,
  }));

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">MTD vs Target vs Projected</h3>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="company" tick={{ fontSize: 13 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(v: number) => `${v}L`}
            label={{
              value: "Lakhs (\u20B9)",
              angle: -90,
              position: "insideLeft",
              offset: -5,
              style: { fontSize: 12 },
            }}
          />
          <Tooltip
            formatter={(value: number) => [`\u20B9${value.toFixed(2)}L`, undefined]}
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb" }}
          />
          <Legend />
          <Bar
            dataKey="MTD Actual"
            fill="#22c55e"
            radius={[4, 4, 0, 0]}
            label={{ position: "top", fontSize: 10, formatter: (v: number) => `${v.toFixed(1)}L` }}
          />
          <Bar
            dataKey="MTD Target"
            fill="#d1d5db"
            radius={[4, 4, 0, 0]}
            label={{ position: "top", fontSize: 10, formatter: (v: number) => `${v.toFixed(1)}L` }}
          />
          <Bar
            dataKey="Projected"
            fill="#8b5cf6"
            radius={[4, 4, 0, 0]}
            label={{ position: "top", fontSize: 10, formatter: (v: number) => `${v.toFixed(1)}L` }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MTDTable({ data }: { data: MTDPerformance[] }) {
  const sorted = [...data].sort((a, b) => a.performance_pct - b.performance_pct);

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900">Detailed MTD Performance</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <th className="px-6 py-3">Company</th>
              <th className="px-6 py-3">Location</th>
              <th className="px-6 py-3 text-right">MTD Sales ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">MTD Target ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">Achievement %</th>
              <th className="px-6 py-3 text-right">Gap ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">Daily Avg ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-right">Projected ({"\u20B9"}L)</th>
              <th className="px-6 py-3 text-center">Day</th>
              <th className="px-6 py-3">Priority</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, idx) => {
              const conf = getPriorityConfig(row.priority_level);
              const isWorst = idx === 0;
              return (
                <tr
                  key={row.company_code}
                  className={cn(
                    "border-b transition-colors last:border-b-0 hover:bg-gray-50",
                    isWorst && "bg-red-50/40"
                  )}
                >
                  <td className={cn("px-6 py-4", isWorst && "font-bold")}>
                    {row.company_code}
                  </td>
                  <td className={cn("px-6 py-4 text-gray-600", isWorst && "font-bold")}>
                    {row.location}
                  </td>
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
                    {"\u20B9"}{row.daily_avg.toFixed(2)}
                  </td>
                  <td className={cn("px-6 py-4 text-right", isWorst && "font-bold")}>
                    {"\u20B9"}{row.projected.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {row.day_number}/{row.total_cycle_days}
                    </span>
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

export default function SalesMTD() {
  const { data, isLoading, isError } = useQuery<MTDPerformance[]>({
    queryKey: ["sales", "mtd"],
    queryFn: async () => {
      const res = await api.get<MTDPerformance[]>("/dashboard/sales/mtd");
      return res.data;
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 py-16">
          <TrendingDown className="mb-4 h-12 w-12 text-red-400" />
          <p className="text-lg font-medium text-red-700">Failed to load MTD sales data</p>
          <p className="mt-1 text-sm text-red-500">Please try refreshing the page.</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Sales - Month to Date</h1>
        </div>
        <EmptyState />
      </div>
    );
  }

  // Use the first record's cycle info for the header (all companies share same cycle)
  const ref = data[0];
  const asOnFormatted = format(parseISO(ref.as_on_date), "dd MMM yyyy");

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Sales - Month to Date</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
            <Calendar className="h-4 w-4" />
            As on: {asOnFormatted}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
            <Clock className="h-4 w-4" />
            Day {ref.day_number} of {ref.total_cycle_days}
          </div>
        </div>
      </div>

      {/* Billing Cycle Progress Bar */}
      <BillingCycleBar data={ref} />

      {/* Company Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {data.map((item) => (
          <MTDCompanyCard key={item.company_code} data={item} />
        ))}
      </div>

      {/* MTD vs Target Chart */}
      <MTDBarChart data={data} />

      {/* Detailed Table */}
      <MTDTable data={data} />
    </div>
  );
}
