import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Factory,
  Activity,
  Users,
  Upload,
  Bell,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/utils";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navigation: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Sales Daily", path: "/sales/daily", icon: TrendingUp },
  { label: "Sales MTD", path: "/sales/mtd", icon: BarChart3 },
  { label: "Production Daily", path: "/production/daily", icon: Factory },
  { label: "Production MTD", path: "/production/mtd", icon: Activity },
  { label: "Managers", path: "/managers", icon: Users },
  { label: "Data Uploads", path: "/uploads", icon: Upload },
  { label: "Alert Log", path: "/alerts", icon: Bell },
];

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/sales/daily": "Sales Daily Performance",
  "/sales/mtd": "Sales MTD Performance",
  "/production/daily": "Production Daily Performance",
  "/production/mtd": "Production MTD Performance",
  "/managers": "Manager Management",
  "/uploads": "Data Uploads",
  "/alerts": "Alert Log",
};

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pageTitle = pageTitles[location.pathname] || "AceTrack";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ backgroundColor: "#0f172a" }}
      >
        {/* Logo / Brand */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold text-sm">
              A
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white leading-tight">
                AceTrack
              </h1>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-400 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-blue-600/20 text-blue-400"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    )
                  }
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-slate-700/50 px-4 py-3">
          <p className="text-xs text-slate-500 text-center">
            v1.0.0
          </p>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-slate-800">
              {pageTitle}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 sm:flex">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              System Online
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
