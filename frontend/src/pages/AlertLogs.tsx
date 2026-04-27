import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Info,
  Send,
  Loader2,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AlertLog } from "@/types";

// ---------- helpers ----------

const ALERT_TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "sales_daily", label: "Sales Daily" },
  { value: "sales_mtd", label: "Sales MTD" },
  { value: "production_daily", label: "Production Daily" },
  { value: "production_mtd", label: "Production MTD" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
];

const COMPANY_OPTIONS = [
  { value: "all", label: "All Companies" },
  { value: "AMC", label: "AMC" },
  { value: "APE", label: "APE" },
  { value: "AHF", label: "AHF" },
];

const PAGE_SIZE = 20;

function safeDateFormat(dateStr: string | null | undefined, fmt: string): string {
  if (!dateStr) return "N/A";
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

function performanceColor(pct: number): string {
  if (pct >= 90) return "text-green-600";
  if (pct >= 75) return "text-yellow-600";
  if (pct >= 50) return "text-orange-600";
  return "text-red-600";
}

// ---------- skeleton ----------

function TableRowSkeleton() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}

// ---------- tooltip ----------

function ErrorTooltip({ message }: { message: string }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
      >
        <Info className="h-3.5 w-3.5" />
        Error
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
          <div className="mb-1 font-semibold text-red-600">Error Details</div>
          <p className="break-words">{message}</p>
          <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" />
        </div>
      )}
    </div>
  );
}

// ---------- resend status with badge ----------

interface ResendStatusProps {
  alert: AlertLog;
  onResent: () => void;
}

function ResendStatus({ alert, onResent }: ResendStatusProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const hasBeenResent = alert.resend_count > 0;
  const isCurrentlyFailed = alert.status === "failed";
  
  const tooltipContent = hasBeenResent ? (
    <div className="text-xs">
      <div className="font-semibold text-slate-900 mb-1">Resend History</div>
      <div className="space-y-1">
        <div>Original: {alert.status === "success" ? "Failed" : "Failed"}</div>
        <div>Attempts: {alert.resend_count}</div>
        <div>Current: {alert.status === "success" ? "Success (after resend)" : "Still failed"}</div>
        {alert.resent_at && (
          <div>Last resent: {safeDateFormat(alert.resent_at, "MMM dd, hh:mm a")}</div>
        )}
      </div>
    </div>
  ) : null;
  
  return (
    <div className="flex items-center gap-2">
      {/* Status Badge with tooltip */}
      <div className="relative">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium cursor-help",
            alert.status === "success"
              ? hasBeenResent
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          )}
          onMouseEnter={() => hasBeenResent && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => hasBeenResent && setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
        >
          {alert.status === "success" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {hasBeenResent ? (
                <span className="flex items-center gap-1">
                  success 
                  <RefreshCw className="h-3 w-3" />
                </span>
              ) : (
                "success"
              )}
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5" />
              failed
            </>
          )}
        </span>
        
        {/* Tooltip */}
        {showTooltip && tooltipContent && (
          <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
            {tooltipContent}
            <div className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" />
          </div>
        )}
      </div>

      {/* Resend Count Badge */}
      {hasBeenResent && (
        <span 
          className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
          title={`Resent ${alert.resend_count} time${alert.resend_count > 1 ? 's' : ''}`}
        >
          ×{alert.resend_count}
        </span>
      )}

      {/* Resend Button */}
      {isCurrentlyFailed && (
        <ResendButton alert={alert} onResent={onResent} />
      )}
    </div>
  );
}

// ---------- resend button ----------

function ResendButton({ alert, onResent }: { alert: AlertLog; onResent: () => void }) {
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    try {
      const response = await api.post(`/alerts/resend/${alert.id}`);
      if (response.data.success) {
        toast.success(`Message resent successfully to ${alert.manager_name}`);
        onResent();
      } else {
        toast.error(`Resend failed: ${response.data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      toast.error(`Resend failed: ${error?.response?.data?.detail || 'Network error'}`);
    } finally {
      setIsResending(false);
    }
  };

  if (alert.status !== "failed") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleResend}
      disabled={isResending}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        isResending
          ? "cursor-not-allowed bg-slate-100 text-slate-400"
          : "bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-800"
      )}
      title="Resend failed message"
    >
      {isResending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Sending...
        </>
      ) : (
        <>
          <RotateCcw className="h-3 w-3" />
          Resend
        </>
      )}
    </button>
  );
}

// ---------- select component ----------

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------- mini stat card ----------

interface MiniStatProps {
  label: string;
  value: string | number;
  color: string;
  bgColor: string;
}

function MiniStat({ label, value, color, bgColor }: MiniStatProps) {
  return (
    <div className={cn("rounded-xl border px-5 py-4", bgColor)}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={cn("text-2xl font-bold", color)}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

// ---------- main component ----------

// ---------- send now dropdown ----------

const SEND_OPTIONS = [
  { value: "all", label: "All Alerts" },
  { value: "sales_daily", label: "Sales Daily" },
  { value: "sales_mtd", label: "Sales MTD" },
  { value: "production_daily", label: "Production Daily" },
  { value: "production_mtd", label: "Production MTD" },
];

function SendNowButton({ onSent }: { onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingType, setSendingType] = useState("");

  const handleSend = async (alertType: string) => {
    setSending(true);
    setSendingType(alertType);
    setOpen(false);
    try {
      const res = await api.post(`/alerts/send-now?alert_type=${alertType}`);
      const taskId = res.data.task_id;
      toast.success(
        `${alertType === "all" ? "All alerts" : alertType.replace(/_/g, " ")} triggered! Sending in background...`
      );

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const statusRes = await api.get(`/alerts/send-now/status/${taskId}`);
          if (statusRes.data.status === "completed") {
            clearInterval(poll);
            setSending(false);
            setSendingType("");
            toast.success(
              `Done! ${statusRes.data.total_sent} alert(s) sent.`
            );
            onSent();
          }
        } catch {
          // keep polling
        }
      }, 3000);

      // Stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(poll);
        setSending(false);
        setSendingType("");
      }, 300000);
    } catch {
      toast.error("Failed to trigger alerts.");
      setSending(false);
      setSendingType("");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !sending && setOpen(!open)}
        disabled={sending}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors",
          sending
            ? "cursor-not-allowed bg-blue-400"
            : "bg-blue-600 hover:bg-blue-700"
        )}
      >
        {sending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending {sendingType.replace(/_/g, " ")}...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send Now
          </>
        )}
      </button>
      {open && !sending && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            {SEND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSend(opt.value)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
              >
                <Send className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- main component ----------

export default function AlertLogs() {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCompany, setFilterCompany] = useState("all");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const alertsQuery = useQuery<AlertLog[]>({
    queryKey: ["dashboard", "alerts", "recent"],
    queryFn: () => api.get("/dashboard/alerts/recent").then((r) => r.data),
  });

  const alerts = alertsQuery.data ?? [];

  // Client-side filtering
  const filtered = useMemo(() => {
    let result = [...alerts];

    if (filterType !== "all") {
      result = result.filter((a) => a.alert_type === filterType);
    }
    if (filterStatus !== "all") {
      result = result.filter((a) => a.status === filterStatus);
    }
    if (filterCompany !== "all") {
      result = result.filter((a) => a.company_code === filterCompany);
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = new Date(a.sent_at).getTime();
      const dateB = new Date(b.sent_at).getTime();
      return sortAsc ? dateA - dateB : dateB - dateA;
    });

    return result;
  }, [alerts, filterType, filterStatus, filterCompany, sortAsc]);

  // Stats
  const totalAlerts = filtered.length;
  const successCount = filtered.filter((a) => a.status === "success").length;
  const failedCount = filtered.filter((a) => a.status === "failed").length;
  const resentCount = filtered.filter((a) => a.resend_count > 0).length;
  const resentSuccessCount = filtered.filter((a) => a.resend_count > 0 && a.status === "success").length;
  const successRate =
    totalAlerts > 0 ? ((successCount / totalAlerts) * 100).toFixed(1) : "0.0";

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Reset page when filters change
  const handleFilterChange = (
    setter: (val: string) => void,
    val: string
  ) => {
    setter(val);
    setPage(1);
  };

  return (
    <div className="space-y-6 p-6">
      {/* ---------- Header + Filters ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Alert Log</h1>
          <p className="mt-1 text-sm text-slate-500">
            View history of escalation alerts and notifications.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SendNowButton
            onSent={() =>
              queryClient.invalidateQueries({
                queryKey: ["dashboard", "alerts", "recent"],
              })
            }
          />
          {failedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-red-700 font-medium">
                {failedCount} failed alerts
                {(() => {
                  const resentSuccessCount = filtered.filter(a => a.resend_count > 0 && a.status === "success").length;
                  return resentSuccessCount > 0 ? (
                    <span className="ml-2 text-green-600">
                      ({resentSuccessCount} resent successfully)
                    </span>
                  ) : null;
                })()}
              </span>
              <button
                type="button"
                onClick={() => handleFilterChange(setFilterStatus, "failed")}
                className="text-red-600 hover:text-red-800 underline"
              >
                View Failed
              </button>
            </div>
          )}
          <FilterSelect
            label="Alert Type"
            value={filterType}
            onChange={(v) => handleFilterChange(setFilterType, v)}
            options={ALERT_TYPE_OPTIONS}
          />
          <FilterSelect
            label="Status"
            value={filterStatus}
            onChange={(v) => handleFilterChange(setFilterStatus, v)}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Company"
            value={filterCompany}
            onChange={(v) => handleFilterChange(setFilterCompany, v)}
            options={COMPANY_OPTIONS}
          />
        </div>
      </div>

      {/* ---------- Mini Stats ---------- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MiniStat
          label="Total Alerts"
          value={totalAlerts}
          color="text-slate-900"
          bgColor="border-slate-200 bg-white"
        />
        <MiniStat
          label="Success"
          value={successCount}
          color="text-green-600"
          bgColor="border-green-200 bg-green-50"
        />
        <MiniStat
          label="Failed"
          value={failedCount}
          color="text-red-600"
          bgColor="border-red-200 bg-red-50"
        />
        <MiniStat
          label="Resent"
          value={`${resentSuccessCount}/${resentCount}`}
          color="text-blue-600"
          bgColor="border-blue-200 bg-blue-50"
        />
        <MiniStat
          label="Success Rate"
          value={`${successRate}%`}
          color={
            parseFloat(successRate) >= 90
              ? "text-green-600"
              : parseFloat(successRate) >= 70
                ? "text-yellow-600"
                : "text-red-600"
          }
          bgColor="border-purple-200 bg-purple-50"
        />
      </div>

      {/* ---------- Table ---------- */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {alertsQuery.isLoading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {[
                  "Date/Time",
                  "Alert Type",
                  "Company",
                  "Manager",
                  "Phone",
                  "Performance",
                  "Status",
                  "Error",
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <TableRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Bell className="mb-3 h-10 w-10" />
            <p className="text-base font-medium">No alerts found</p>
            <p className="mt-1 text-sm">
              Try adjusting your filters to see more results.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800"
                        onClick={() => setSortAsc((prev) => !prev)}
                      >
                        Date/Time
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </button>
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Alert Type
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Company
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Manager
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Phone
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Performance
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Error
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((alert, idx) => (
                    <tr
                      key={alert.id}
                      className={cn(
                        "border-b border-slate-50 transition-colors hover:bg-blue-50/30",
                        idx % 2 === 1 && "bg-slate-50/50"
                      )}
                    >
                      {/* Date/Time */}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {safeDateFormat(alert.sent_at, "dd MMM yyyy, hh:mm a")}
                      </td>

                      {/* Alert Type */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            alert.alert_type?.includes("sales")
                              ? "bg-blue-50 text-blue-700"
                              : "bg-purple-50 text-purple-700"
                          )}
                        >
                          {alert.alert_type?.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Company */}
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {alert.company_code}
                      </td>

                      {/* Manager */}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {alert.manager_name}
                      </td>

                      {/* Phone */}
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {alert.manager_phone}
                      </td>

                      {/* Performance */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "text-sm font-semibold",
                            performanceColor(alert.performance_pct)
                          )}
                        >
                          {alert.performance_pct.toFixed(1)}%
                        </span>
                      </td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <ResendStatus 
                          alert={alert} 
                          onResent={() => queryClient.invalidateQueries({
                            queryKey: ["dashboard", "alerts", "recent"],
                          })}
                        />
                      </td>

                      {/* Error */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {alert.status === "failed" && alert.error_message ? (
                          <ErrorTooltip message={alert.error_message} />
                        ) : (
                          <span className="text-xs text-slate-300">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-medium text-slate-700">
                  {(currentPage - 1) * PAGE_SIZE + 1}
                </span>
                {" - "}
                <span className="font-medium text-slate-700">
                  {Math.min(currentPage * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-slate-700">
                  {filtered.length}
                </span>{" "}
                alerts
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    currentPage <= 1
                      ? "cursor-not-allowed border-slate-100 text-slate-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="px-2 text-sm text-slate-500">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                    currentPage >= totalPages
                      ? "cursor-not-allowed border-slate-100 text-slate-300"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
