import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileSpreadsheet,
  Database,
  Target,
  Wrench,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  FileUp,
  CalendarDays,
  Clock,
  BarChart3,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/types";

interface UploadCardConfig {
  id: string;
  title: string;
  description: string;
  formatHint: string;
  icon: React.ComponentType<{ className?: string }>;
  themeColor: "blue" | "green" | "purple" | "orange";
  accept: string;
  endpoint: string;
}

const UPLOAD_CARDS: UploadCardConfig[] = [
  {
    id: "sales-csv",
    title: "Sales by Billing",
    description: "Upload Sales CSV file (tab-separated)",
    formatHint: "Columns: Billing Date, Customer, Converted Tax, Profit Center...",
    icon: FileSpreadsheet,
    themeColor: "blue",
    accept: ".csv,.tsv,.txt",
    endpoint: "/uploads/sales-csv",
  },
  {
    id: "baywise",
    title: "Baywise Output",
    description: "Upload Baywise output CSV (movement type 101 filtered)",
    formatHint: "Columns: Material, Plant, Movement Type, Quantity...",
    icon: Database,
    themeColor: "green",
    accept: ".csv,.tsv,.txt",
    endpoint: "/uploads/baywise",
  },
  {
    id: "production-plan",
    title: "Production Plan",
    description: "Upload monthly targets Excel file",
    formatHint: "Contains monthly production targets per material/plant",
    icon: Target,
    themeColor: "purple",
    accept: ".xlsx,.xls",
    endpoint: "/uploads/production-plan",
  },
  {
    id: "pp-master",
    title: "PP Master (Pricing)",
    description: "Upload material pricing master Excel",
    formatHint: "Contains material codes with standard pricing data",
    icon: Wrench,
    themeColor: "orange",
    accept: ".xlsx,.xls",
    endpoint: "/uploads/pp-master",
  },
];

const THEME_STYLES = {
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    borderHover: "hover:border-blue-400",
    buttonBg: "bg-blue-600 hover:bg-blue-700",
    ring: "focus-within:ring-blue-200",
    badge: "bg-blue-50 text-blue-700",
  },
  green: {
    iconBg: "bg-green-50",
    iconText: "text-green-600",
    borderHover: "hover:border-green-400",
    buttonBg: "bg-green-600 hover:bg-green-700",
    ring: "focus-within:ring-green-200",
    badge: "bg-green-50 text-green-700",
  },
  purple: {
    iconBg: "bg-purple-50",
    iconText: "text-purple-600",
    borderHover: "hover:border-purple-400",
    buttonBg: "bg-purple-600 hover:bg-purple-700",
    ring: "focus-within:ring-purple-200",
    badge: "bg-purple-50 text-purple-700",
  },
  orange: {
    iconBg: "bg-orange-50",
    iconText: "text-orange-600",
    borderHover: "hover:border-orange-400",
    buttonBg: "bg-orange-600 hover:bg-orange-700",
    ring: "focus-within:ring-orange-200",
    badge: "bg-orange-50 text-orange-700",
  },
};

type UploadState = "idle" | "selected" | "uploading" | "success" | "error";

interface UploadResult {
  message?: string;
  rows_imported?: number;
  detail?: string;
}

function UploadCard({ config }: { config: UploadCardConfig }) {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const theme = THEME_STYLES[config.themeColor];
  const Icon = config.icon;

  const handleFile = useCallback((f: File | null) => {
    if (f) {
      setFile(f);
      setState("selected");
      setResult(null);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFile(droppedFile);
      }
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0] ?? null;
      handleFile(selectedFile);
    },
    [handleFile]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setState("uploading");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post(config.endpoint, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      const data = res.data as UploadResult;
      setResult(data);
      setState("success");
      const msg = data.rows_imported
        ? `${data.rows_imported} rows imported`
        : data.message || "Upload successful";
      toast.success(`${config.title}: ${msg}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: UploadResult }; message?: string };
      const errData = axiosErr.response?.data;
      setResult(errData || { detail: axiosErr.message || "Upload failed" });
      setState("error");
    }
  }, [file, config.endpoint, config.title]);

  const handleReset = useCallback(() => {
    setFile(null);
    setState("idle");
    setResult(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      {/* Card Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            theme.iconBg
          )}
        >
          <Icon className={cn("h-5 w-5", theme.iconText)} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">{config.title}</h3>
          <p className="text-xs text-slate-500">{config.description}</p>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-6">
        {/* Format Hint */}
        <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          {config.formatHint}
        </p>

        {/* Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => state !== "uploading" && inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-all duration-200",
            theme.ring,
            isDragOver
              ? "border-blue-400 bg-blue-50/50"
              : state === "selected"
              ? "border-slate-300 bg-slate-50/50"
              : cn("border-slate-300 bg-white", theme.borderHover),
            state === "uploading" && "pointer-events-none opacity-60"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept={config.accept}
            onChange={handleInputChange}
            className="hidden"
          />

          {state === "uploading" ? (
            <>
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-slate-400" />
              <p className="text-sm font-medium text-slate-600">Uploading...</p>
            </>
          ) : file ? (
            <>
              <FileUp className={cn("mb-2 h-8 w-8", theme.iconText)} />
              <p className="text-sm font-medium text-slate-700 text-center break-all">
                {file.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              <p className="mt-1 text-xs text-slate-400">Click to change file</p>
            </>
          ) : (
            <>
              <Upload className="mb-2 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                Drag & drop or{" "}
                <span className={theme.iconText}>click to browse</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Accepts: {config.accept}
              </p>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleUpload}
            disabled={state !== "selected"}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors",
              state === "selected"
                ? theme.buttonBg
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            )}
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
          {(state === "success" || state === "error" || state === "selected") && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          )}
        </div>

        {/* Result */}
        {state === "success" && result && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              {result.rows_imported
                ? `${result.rows_imported} rows imported successfully`
                : result.message || "Upload completed successfully"}
            </span>
          </div>
        )}
        {state === "error" && result && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{result.detail || result.message || "Upload failed"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="h-6 w-64 rounded bg-slate-100" />
    </div>
  );
}

export default function DataUploads() {
  const {
    data: stats,
    isLoading,
  } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const res = await api.get("/dashboard/stats");
      return res.data;
    },
    refetchInterval: 30 * 1000,
  });

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Data Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload and manage data files for sales, production, and pricing.
        </p>
      </div>

      {/* Upload Cards Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {UPLOAD_CARDS.map((config) => (
          <UploadCard key={config.id} config={config} />
        ))}
      </div>

      {/* Current Data Status */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
            <BarChart3 className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Current Data Status</h2>
            <p className="text-xs text-slate-500">Overview of imported records</p>
          </div>
        </div>
        <div className="p-6">
          {isLoading ? (
            <StatsSkeleton />
          ) : stats ? (
            <div className="space-y-5">
              {/* Record Counts */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg border bg-blue-50/50 p-4">
                  <p className="text-xs font-medium text-slate-500">Sales Records</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {stats.total_sales_records?.toLocaleString() ?? "0"}
                  </p>
                </div>
                <div className="rounded-lg border bg-green-50/50 p-4">
                  <p className="text-xs font-medium text-slate-500">Baywise Records</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {stats.total_baywise_records?.toLocaleString() ?? "0"}
                  </p>
                </div>
                <div className="rounded-lg border bg-orange-50/50 p-4">
                  <p className="text-xs font-medium text-slate-500">PP Master Records</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {stats.total_pp_master_records?.toLocaleString() ?? "0"}
                  </p>
                </div>
                <div className="rounded-lg border bg-purple-50/50 p-4">
                  <p className="text-xs font-medium text-slate-500">Production Plan</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {stats.total_production_plan_records?.toLocaleString() ?? "0"}
                  </p>
                </div>
              </div>

              {/* Cycle & Refresh Info */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t pt-4">
                {stats.current_billing_cycle && (
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">Current Billing Cycle:</span>
                    <span>
                      {format(parseISO(stats.current_billing_cycle.start), "dd MMM yyyy")}
                      {" "}&rarr;{" "}
                      {format(parseISO(stats.current_billing_cycle.end), "dd MMM yyyy")}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">Last Refresh:</span>
                  <span>
                    {stats.last_data_refresh
                      ? format(parseISO(stats.last_data_refresh), "dd MMM yyyy, hh:mm a")
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
