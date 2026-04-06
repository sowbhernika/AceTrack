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
  Factory,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  CheckCircle,
  CalendarDays,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MTDPerformance } from "@/types";

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  ZERO:      { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    ring: "#ef4444" },
  Critical:  { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    ring: "#ef4444" },
  High:      { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", ring: "#f97316" },
  Medium:    { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  ring: "#f59e0b" },
  Low:       { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   ring: "#3b82f6" },
  "On Target": { bg: "bg-green-50", text: "text-green-700", border: "border-green-200",  ring: "#22c55e" },
};

function getPriorityStyle(priority: string) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS["On Target"];
}

function formatLakhs(value: number): string {
  return `₹${value.toFixed(2)}L`;
}

function PerformanceGauge({ pct, color }: { pct: number; color: string }) {
  const clampedPct = Math.min(pct, 100);
  const gaugeData = [
    { name: "achieved", value: clampedPct },
    { name: "remaining", value: 100 - clampedPct },
  ];
  return (
    <div className="relative mx-auto h-28 w-28">
      <PieChart width={112} height={112}>
        <Pie
          data={gaugeData}
          cx={56}
          cy={56}
          innerRadius={38}
          outerRadius={50}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          stroke="none"
        >
          <Cell fill={color} />
          <Cell fill="#e5e7eb" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "ZERO" || priority === "Critical")
    return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (priority === "High" || priority === "Medium")
    return <TrendingDown className="h-4 w-4 text-orange-500" />;
  return <CheckCircle className="h-4 w-4 text-green-500" />;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      <div className="h-8 w-80 rounded bg-slate-200" />
      <div className="h-10 rounded-xl bg-slate-200" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-80 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="h-80 rounded-xl bg-slate-200" />
      <div className="h-48 rounded-xl bg-slate-200" />
    </div>
  );
}

export default function ProductionMTD() {
  const { data, isLoading, isError, error } = useQuery<MTDPerformance[]>({
    queryKey: ["production-mtd"],
    queryFn: async () => {
      const res = await api.get("/dashboard/production/mtd");
      return res.data;
    },
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertTriangle className="mb-4 h-12 w-12 text-red-400" />
        <h2 className="text-lg font-semibold text-slate-700">Failed to load data</h2>
        <p className="mt-1 text-sm text-slate-500">
          {(error as Error)?.message || "An unexpected error occurred"}
        </p>
      </div>
    );
  }

  const companies = data || [];

  // Use the first record for cycle info (all should share the same cycle)
  const firstRecord = companies[0];
  const cycleStart = firstRecord ? parseISO(firstRecord.cycle_start) : new Date();
  const cycleEnd = firstRecord ? parseISO(firstRecord.cycle_end) : new Date();
  const asOnDate = firstRecord ? parseISO(firstRecord.as_on_date) : new Date();
  const dayNumber = firstRecord?.day_number ?? 0;
  const totalCycleDays = firstRecord?.total_cycle_days ?? 1;
  const cyclePct = Math.min((dayNumber / totalCycleDays) * 100, 100);

  // Sort companies by performance (worst first) for the table
  const sortedCompanies = [...companies].sort(
    (a, b) => a.performance_pct - b.performance_pct
  );

  const chartData = companies.map((c) => ({
    name: c.company_code,
    "MTD Actual": Number((c.production_lakhs ?? 0).toFixed(2)),
    Target: Number(c.target_lakhs.toFixed(2)),
    Projected: Number(c.projected.toFixed(2)),
  }));

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Production - Month to Date
          </h1>
          <p className="text-sm text-slate-500">
            As on: {format(asOnDate, "dd MMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
            <CalendarDays className="h-4 w-4" />
            Day {dayNumber} of {totalCycleDays}
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            <Factory className="h-4 w-4" />
            {companies.length} Locations
          </div>
        </div>
      </div>

      {/* Cycle Progress Bar */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700">Billing Cycle Progress</span>
          <span className="text-slate-500">
            {format(cycleStart, "dd MMM")} &rarr; {format(cycleEnd, "dd MMM yyyy")}
          </span>
        </div>
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
            style={{ width: `${cyclePct}%` }}
          />
          {/* Day marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-slate-800"
            style={{ left: `${cyclePct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-slate-400">
          <span>Day 1</span>
          <span className="font-medium text-blue-600">
            Day {dayNumber} ({cyclePct.toFixed(0)}%)
          </span>
          <span>Day {totalCycleDays}</span>
        </div>
      </div>

      {/* Company Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {companies.map((c) => {
          const style = getPriorityStyle(c.priority_level);
          const production = c.production_lakhs ?? 0;
          return (
            <div
              key={c.company_code}
              className="overflow-hidden rounded-xl border bg-white shadow-sm"
            >
              {/* Card Header */}
              <div className={cn("flex items-center gap-3 px-6 py-4 border-b", style.bg)}>
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    style.bg
                  )}
                >
                  <Factory className={cn("h-5 w-5", style.text)} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">{c.company_code}</h3>
                  <p className="text-xs text-slate-500">{c.location}</p>
                </div>
                <span
                  className={cn(
                    "ml-auto rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    style.bg,
                    style.text,
                    style.border
                  )}
                >
                  {c.priority_level}
                </span>
              </div>

              {/* Card Body */}
              <div className="space-y-4 p-6">
                <PerformanceGauge pct={c.performance_pct} color={style.ring} />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">MTD Production</span>
                    <span className="font-semibold text-slate-900">
                      {formatLakhs(production)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">MTD Target</span>
                    <span className="font-semibold text-slate-900">
                      {formatLakhs(c.target_lakhs)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gap</span>
                    <span
                      className={cn(
                        "font-semibold",
                        c.gap_to_target < 0 ? "text-red-600" : "text-green-600"
                      )}
                    >
                      {formatLakhs(c.gap_to_target)}
                    </span>
                  </div>

                  <div className="mt-2 border-t pt-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Daily Average</span>
                      <span className="font-medium text-slate-700">
                        {formatLakhs(c.daily_avg)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Projected</span>
                      <span
                        className={cn(
                          "font-medium",
                          c.projected >= c.target_lakhs
                            ? "text-green-600"
                            : "text-orange-600"
                        )}
                      >
                        {formatLakhs(c.projected)}
                        {c.projected >= c.target_lakhs ? (
                          <TrendingUp className="ml-1 inline h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="ml-1 inline h-3.5 w-3.5" />
                        )}
                      </span>
                    </div>
                  </div>

                  {c.matched_materials != null && c.total_materials != null && c.total_materials > 0 && (
                    <div className="mt-2 border-t pt-2">
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span>Materials Matched</span>
                        <span className="font-medium text-slate-700">
                          {c.matched_materials}/{c.total_materials}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all"
                          style={{
                            width: `${(c.matched_materials / c.total_materials) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comparison Chart */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-slate-900">
          MTD Actual vs Target vs Projected
        </h2>
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={chartData} barGap={6}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 13 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => `₹${v}L`}
            />
            <Tooltip
              formatter={(value: number) => [`₹${value.toFixed(2)}L`, undefined]}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                fontSize: "13px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "13px" }} />
            <Bar
              dataKey="MTD Actual"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              label={{ position: "top", fontSize: 11, formatter: (v: number) => `₹${v}L` }}
            />
            <Bar
              dataKey="Target"
              fill="#d1d5db"
              radius={[4, 4, 0, 0]}
              label={{ position: "top", fontSize: 11, formatter: (v: number) => `₹${v}L` }}
            />
            <Bar
              dataKey="Projected"
              fill="#a78bfa"
              radius={[4, 4, 0, 0]}
              label={{ position: "top", fontSize: 11, formatter: (v: number) => `₹${v}L` }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Data Table (sorted worst-first) */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-slate-900">
            Detailed Breakdown
            <span className="ml-2 text-xs font-normal text-slate-400">(sorted by achievement)</span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Company</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3 text-right">MTD Prod (₹L)</th>
                <th className="px-6 py-3 text-right">Target (₹L)</th>
                <th className="px-6 py-3 text-right">Achievement %</th>
                <th className="px-6 py-3 text-right">Gap (₹L)</th>
                <th className="px-6 py-3 text-right">Daily Avg (₹L)</th>
                <th className="px-6 py-3 text-right">Projected (₹L)</th>
                <th className="px-6 py-3 text-center">Day</th>
                <th className="px-6 py-3 text-center">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCompanies.map((c) => {
                const style = getPriorityStyle(c.priority_level);
                const production = c.production_lakhs ?? 0;
                return (
                  <tr key={c.company_code} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      {c.company_code}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{c.location}</td>
                    <td className="px-6 py-3 text-right font-mono text-slate-900">
                      {production.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-slate-600">
                      {c.target_lakhs.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={cn("font-semibold", style.text)}>
                        {c.performance_pct.toFixed(1)}%
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3 text-right font-mono",
                        c.gap_to_target < 0 ? "text-red-600" : "text-green-600"
                      )}
                    >
                      {c.gap_to_target.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-slate-700">
                      {c.daily_avg.toFixed(2)}
                    </td>
                    <td
                      className={cn(
                        "px-6 py-3 text-right font-mono",
                        c.projected >= c.target_lakhs
                          ? "text-green-600"
                          : "text-orange-600"
                      )}
                    >
                      {c.projected.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-center text-slate-600">
                      {c.day_number}/{c.total_cycle_days}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          style.bg,
                          style.text,
                          style.border
                        )}
                      >
                        <PriorityIcon priority={c.priority_level} />
                        {c.priority_level}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
