import { useState, useMemo, useCallback, useRef, type ChangeEvent, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Upload,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  X,
  FileUp,
  AlertTriangle,
  Users,
  UserCheck,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Manager } from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLANTS = ["AM03", "AM07", "AP01", "AH05"] as const;
const COMPANIES = ["AMC", "APE", "AHF"] as const;

const PLANT_TO_COMPANY: Record<string, string> = {
  AM03: "AMC",
  AM07: "AMC",
  AP01: "APE",
  AH05: "AHF",
};

const PAGE_SIZE = 15;

type SortField =
  | "manager_name"
  | "manager_phone"
  | "manager_email"
  | "department"
  | "plant"
  | "company_code"
  | "is_active";

type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function plantBadgeClasses(plant: string): string {
  const company = PLANT_TO_COMPANY[plant];
  if (company === "AMC") return "bg-blue-100 text-blue-700";
  if (company === "APE") return "bg-emerald-100 text-emerald-700";
  if (company === "AHF") return "bg-orange-100 text-orange-700";
  return "bg-slate-100 text-slate-600";
}

function companyForPlant(plant: string): string {
  return PLANT_TO_COMPANY[plant] ?? "";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Toggle switch used for active/inactive status */
function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        checked ? "bg-emerald-500" : "bg-slate-300",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}

/** Stat card for the stats row */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-lg font-semibold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state type
// ---------------------------------------------------------------------------

interface ManagerFormData {
  manager_name: string;
  manager_phone: string;
  manager_email: string;
  department: string;
  plant: string;
}

const EMPTY_FORM: ManagerFormData = {
  manager_name: "",
  manager_phone: "",
  manager_email: "",
  department: "",
  plant: "",
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ManagerList() {
  const queryClient = useQueryClient();

  // --- Filters ---
  const [search, setSearch] = useState("");
  const [filterPlant, setFilterPlant] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // --- Sorting ---
  const [sortField, setSortField] = useState<SortField>("manager_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // --- Pagination ---
  const [page, setPage] = useState(1);

  // --- Selection ---
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // --- Modals ---
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [formData, setFormData] = useState<ManagerFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ManagerFormData, string>>>({});

  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingManager, setDeletingManager] = useState<Manager | null>(null);

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  const {
    data: managers = [],
    isLoading,
    isError,
  } = useQuery<Manager[]>({
    queryKey: ["managers"],
    queryFn: async () => {
      const res = await api.get("/managers");
      return res.data;
    },
  });

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const uniqueDepartments = useMemo(() => {
    const depts = new Set(managers.map((m) => m.department));
    return Array.from(depts).sort();
  }, [managers]);

  // --- Filtering ---
  const filtered = useMemo(() => {
    let result = managers;

    // Plant
    if (filterPlant) result = result.filter((m) => m.plant === filterPlant);
    // Company
    if (filterCompany) result = result.filter((m) => m.company_code === filterCompany);
    // Department
    if (filterDepartment) result = result.filter((m) => m.department === filterDepartment);
    // Status
    if (filterStatus === "active") result = result.filter((m) => m.is_active);
    else if (filterStatus === "inactive") result = result.filter((m) => !m.is_active);

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (m) =>
          m.manager_name.toLowerCase().includes(q) ||
          m.manager_phone.toLowerCase().includes(q) ||
          (m.manager_email && m.manager_email.toLowerCase().includes(q)) ||
          m.department.toLowerCase().includes(q)
      );
    }

    return result;
  }, [managers, filterPlant, filterCompany, filterDepartment, filterStatus, search]);

  // --- Sorting ---
  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let aVal: string | boolean = a[sortField] ?? "";
      let bVal: string | boolean = b[sortField] ?? "";
      if (typeof aVal === "boolean") {
        aVal = aVal ? "1" : "0";
        bVal = (bVal as boolean) ? "1" : "0";
      }
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortField, sortDir]);

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // --- Stats ---
  const stats = useMemo(() => {
    const total = managers.length;
    const active = managers.filter((m) => m.is_active).length;
    const inactive = total - active;
    const byPlant: Record<string, number> = {};
    for (const p of PLANTS) byPlant[p] = managers.filter((m) => m.plant === p).length;
    return { total, active, inactive, byPlant };
  }, [managers]);

  // -----------------------------------------------------------------------
  // Mutations
  // -----------------------------------------------------------------------

  const createMutation = useMutation({
    mutationFn: (data: ManagerFormData) => api.post("/managers", { ...data, company_code: companyForPlant(data.plant) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Manager created successfully");
      closeAddEdit();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ManagerFormData }) =>
      api.put(`/managers/${id}`, { ...data, company_code: companyForPlant(data.plant) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Manager updated successfully");
      closeAddEdit();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/managers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Manager deleted successfully");
      setShowDeleteConfirm(false);
      setDeletingManager(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (deletingManager) next.delete(deletingManager.id);
        return next;
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ ids, is_active }: { ids: number[]; is_active: boolean }) =>
      api.patch("/managers/bulk-toggle", { ids, is_active }),
    onMutate: async ({ ids, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["managers"] });
      const previous = queryClient.getQueryData<Manager[]>(["managers"]);
      queryClient.setQueryData<Manager[]>(["managers"], (old) =>
        (old ?? []).map((m) => (ids.includes(m.id) ? { ...m, is_active } : m))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["managers"], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
    },
  });

  const toggleAllMutation = useMutation({
    mutationFn: (is_active: boolean) => api.patch("/managers/toggle-all", { is_active }),
    onSuccess: (_data, is_active) => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success(is_active ? "All managers enabled" : "All managers disabled");
    },
  });

  const bulkUploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post("/managers/bulk-upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      const msg = res.data?.message || res.data?.detail || "Bulk upload completed";
      toast.success(msg);
      closeBulkUpload();
    },
  });

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allPageIds = paginated.map((m) => m.id);
    const allSelected = allPageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        allPageIds.forEach((id) => next.delete(id));
      } else {
        allPageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [paginated, selectedIds]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setFilterPlant("");
    setFilterCompany("");
    setFilterDepartment("");
    setFilterStatus("");
    setPage(1);
  }, []);

  // --- Add / Edit modal ---
  const openAdd = useCallback(() => {
    setEditingManager(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setShowAddEdit(true);
  }, []);

  const openEdit = useCallback((m: Manager) => {
    setEditingManager(m);
    setFormData({
      manager_name: m.manager_name,
      manager_phone: m.manager_phone,
      manager_email: m.manager_email ?? "",
      department: m.department,
      plant: m.plant,
    });
    setFormErrors({});
    setShowAddEdit(true);
  }, []);

  const closeAddEdit = useCallback(() => {
    setShowAddEdit(false);
    setEditingManager(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  }, []);

  const handleFormChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: undefined }));
  }, []);

  const validateForm = useCallback((): boolean => {
    const errs: Partial<Record<keyof ManagerFormData, string>> = {};
    if (!formData.manager_name.trim()) errs.manager_name = "Name is required";
    if (!formData.manager_phone.trim()) {
      errs.manager_phone = "Phone is required";
    } else if (!/^\d{10}$/.test(formData.manager_phone.trim())) {
      errs.manager_phone = "Phone must be exactly 10 digits";
    }
    if (formData.manager_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.manager_email.trim())) {
      errs.manager_email = "Invalid email format";
    }
    if (!formData.department.trim()) errs.department = "Department is required";
    if (!formData.plant) errs.plant = "Plant is required";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }, [formData]);

  const handleSubmitForm = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!validateForm()) return;
      const payload: ManagerFormData = {
        ...formData,
        manager_name: formData.manager_name.trim(),
        manager_phone: formData.manager_phone.trim(),
        manager_email: formData.manager_email.trim(),
        department: formData.department.trim(),
      };
      if (editingManager) {
        updateMutation.mutate({ id: editingManager.id, data: payload });
      } else {
        createMutation.mutate(payload);
      }
    },
    [formData, editingManager, validateForm, updateMutation, createMutation]
  );

  // --- Delete ---
  const openDelete = useCallback((m: Manager) => {
    setDeletingManager(m);
    setShowDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deletingManager) deleteMutation.mutate(deletingManager.id);
  }, [deletingManager, deleteMutation]);

  // --- Bulk upload ---
  const closeBulkUpload = useCallback(() => {
    setShowBulkUpload(false);
    setBulkFile(null);
    setDragOver(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === "text/csv" || file.name.endsWith(".csv"))) {
      setBulkFile(file);
    } else {
      toast.error("Please select a CSV file");
    }
  }, []);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setBulkFile(file);
  }, []);

  const handleBulkUpload = useCallback(() => {
    if (bulkFile) bulkUploadMutation.mutate(bulkFile);
  }, [bulkFile, bulkUploadMutation]);

  // --- Selection actions ---
  const enableSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    toggleMutation.mutate({ ids, is_active: true });
    toast.success(`Enabling ${ids.length} manager(s)`);
  }, [selectedIds, toggleMutation]);

  const disableSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    toggleMutation.mutate({ ids, is_active: false });
    toast.success(`Disabling ${ids.length} manager(s)`);
  }, [selectedIds, toggleMutation]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 text-slate-400" />;
    return sortDir === "asc" ? (
      <ChevronUp className="ml-1 inline h-3.5 w-3.5 text-blue-600" />
    ) : (
      <ChevronDown className="ml-1 inline h-3.5 w-3.5 text-blue-600" />
    );
  };

  const allPageSelected =
    paginated.length > 0 && paginated.every((m) => selectedIds.has(m.id));
  const somePageSelected =
    paginated.some((m) => selectedIds.has(m.id)) && !allPageSelected;

  const hasFilters = search || filterPlant || filterCompany || filterDepartment || filterStatus;

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* ---- Stats Row ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard icon={Users} label="Total" value={stats.total} color="bg-blue-100 text-blue-600" />
        <StatCard icon={UserCheck} label="Active" value={stats.active} color="bg-emerald-100 text-emerald-600" />
        <StatCard icon={UserX} label="Inactive" value={stats.inactive} color="bg-red-100 text-red-600" />
        {PLANTS.map((p) => (
          <StatCard
            key={p}
            icon={Users}
            label={p}
            value={stats.byPlant[p] ?? 0}
            color={plantBadgeClasses(p)}
          />
        ))}
      </div>

      {/* ---- Header Row ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-800">Manager Management</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Manager
          </button>
          <button
            onClick={() => setShowBulkUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Upload className="h-4 w-4" /> Bulk Upload CSV
          </button>
          <button
            onClick={() => toggleAllMutation.mutate(true)}
            disabled={toggleAllMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3.5 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            Enable All
          </button>
          <button
            onClick={() => toggleAllMutation.mutate(false)}
            disabled={toggleAllMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Disable All
          </button>
        </div>
      </div>

      {/* ---- Filters Row ---- */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative min-w-[220px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, phone, email, dept..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Plant filter */}
        <select
          value={filterPlant}
          onChange={(e) => { setFilterPlant(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Plants</option>
          {PLANTS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        {/* Company filter */}
        <select
          value={filterCompany}
          onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Companies</option>
          {COMPANIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Department filter */}
        <select
          value={filterDepartment}
          onChange={(e) => { setFilterDepartment(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Departments</option>
          {uniqueDepartments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ---- Selection Bar ---- */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-800">
            {selectedIds.size} manager{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            onClick={enableSelected}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            Enable Selected
          </button>
          <button
            onClick={disableSelected}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
          >
            Disable Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            Deselect All
          </button>
        </div>
      )}

      {/* ---- Table ---- */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <span className="ml-3 text-sm text-slate-500">Loading managers...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="h-10 w-10 text-red-400" />
            <p className="mt-2 text-sm font-medium text-red-600">Failed to load managers</p>
            <p className="text-xs text-slate-500">Please try refreshing the page.</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="h-10 w-10 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-500">
              {hasFilters ? "No managers match your filters" : "No managers found"}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-1 text-xs text-blue-600 hover:text-blue-800">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                {(
                  [
                    ["manager_name", "Name"],
                    ["manager_phone", "Phone"],
                    ["manager_email", "Email"],
                    ["department", "Department"],
                    ["plant", "Plant"],
                    ["company_code", "Company"],
                    ["is_active", "Status"],
                  ] as [SortField, string][]
                ).map(([field, label]) => (
                  <th
                    key={field}
                    className="px-3 py-3 font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap hover:text-slate-900 transition-colors"
                    onClick={() => handleSort(field)}
                  >
                    {label}
                    <SortIcon field={field} />
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold text-slate-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((m, idx) => (
                <tr
                  key={m.id}
                  className={cn(
                    "transition-colors hover:bg-blue-50/50",
                    idx % 2 === 1 && "bg-slate-50/50",
                    selectedIds.has(m.id) && "bg-blue-50"
                  )}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                    {m.manager_name}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{m.manager_phone}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {m.manager_email ? (
                      <span className="text-slate-600">{m.manager_email}</span>
                    ) : (
                      <span className="text-slate-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{m.department}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        plantBadgeClasses(m.plant)
                      )}
                    >
                      {m.plant}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{m.company_code}</td>
                  <td className="px-3 py-2.5">
                    <ToggleSwitch
                      checked={m.is_active}
                      onChange={() =>
                        toggleMutation.mutate({ ids: [m.id], is_active: !m.is_active })
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => openEdit(m)}
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openDelete(m)}
                      className="ml-1 inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Pagination ---- */}
      {sorted.length > PAGE_SIZE && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-500">
            Showing {(safePage - 1) * PAGE_SIZE + 1}&ndash;{Math.min(safePage * PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length} managers
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<(number | "...")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1]!) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, i) =>
                item === "..." ? (
                  <span key={`e${i}`} className="px-1 text-sm text-slate-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium transition-colors",
                      item === safePage
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 hover:bg-slate-100"
                    )}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================
          MODALS
      ================================================================== */}

      {/* ---- Add / Edit Manager Modal (slide-in from right) ---- */}
      {showAddEdit && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 transition-opacity"
            onClick={closeAddEdit}
          />
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-800">
                {editingManager ? "Edit Manager" : "Add Manager"}
              </h2>
              <button
                onClick={closeAddEdit}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Manager Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Manager Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="manager_name"
                  value={formData.manager_name}
                  onChange={handleFormChange}
                  placeholder="Enter full name"
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1",
                    formErrors.manager_name
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  )}
                />
                {formErrors.manager_name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.manager_name}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="manager_phone"
                  value={formData.manager_phone}
                  onChange={handleFormChange}
                  placeholder="10-digit number"
                  maxLength={10}
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1",
                    formErrors.manager_phone
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  )}
                />
                {formErrors.manager_phone && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.manager_phone}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="text"
                  name="manager_email"
                  value={formData.manager_email}
                  onChange={handleFormChange}
                  placeholder="email@example.com (optional)"
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1",
                    formErrors.manager_email
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  )}
                />
                {formErrors.manager_email && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.manager_email}</p>
                )}
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleFormChange}
                  placeholder="e.g. Sales, Production"
                  list="departments-list"
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1",
                    formErrors.department
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  )}
                />
                <datalist id="departments-list">
                  {uniqueDepartments.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                {formErrors.department && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.department}</p>
                )}
              </div>

              {/* Plant */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Plant <span className="text-red-500">*</span>
                </label>
                <select
                  name="plant"
                  value={formData.plant}
                  onChange={handleFormChange}
                  className={cn(
                    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1",
                    formErrors.plant
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : "border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  )}
                >
                  <option value="">Select a plant</option>
                  {PLANTS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                {formErrors.plant && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.plant}</p>
                )}
              </div>

              {/* Company Code (auto-filled) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Code</label>
                <input
                  type="text"
                  readOnly
                  value={formData.plant ? companyForPlant(formData.plant) : ""}
                  placeholder="Auto-filled from plant"
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>
            </form>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={closeAddEdit}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmitForm}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                )}
                {editingManager ? "Update Manager" : "Create Manager"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ---- Bulk Upload Modal ---- */}
      {showBulkUpload && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 transition-opacity"
            onClick={closeBulkUpload}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-800">Bulk Upload Managers</h2>
                <button
                  onClick={closeBulkUpload}
                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                {/* Hint */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
                  <p className="text-xs font-medium text-blue-800 mb-1">Expected CSV format:</p>
                  <code className="block text-xs text-blue-700 font-mono">
                    manager_name, manager_phone, manager_email, department, plant
                  </code>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors",
                    dragOver
                      ? "border-blue-500 bg-blue-50"
                      : bulkFile
                        ? "border-emerald-400 bg-emerald-50"
                        : "border-slate-300 bg-slate-50 hover:border-slate-400"
                  )}
                >
                  <FileUp
                    className={cn(
                      "h-10 w-10 mb-2",
                      bulkFile ? "text-emerald-500" : "text-slate-400"
                    )}
                  />
                  {bulkFile ? (
                    <div>
                      <p className="text-sm font-medium text-emerald-700">{bulkFile.name}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {(bulkFile.size / 1024).toFixed(1)} KB &mdash; Click or drag to replace
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        Drag & drop your CSV file here
                      </p>
                      <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  onClick={closeBulkUpload}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={!bulkFile || bulkUploadMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {bulkUploadMutation.isPending && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  Upload
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---- Delete Confirmation Dialog ---- */}
      {showDeleteConfirm && deletingManager && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 transition-opacity"
            onClick={() => {
              setShowDeleteConfirm(false);
              setDeletingManager(null);
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl">
              <div className="px-6 py-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Delete Manager</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Are you sure you want to delete{" "}
                  <span className="font-medium text-slate-700">{deletingManager.manager_name}</span>?
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletingManager(null);
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleteMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleteMutation.isPending && (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
