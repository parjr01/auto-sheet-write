import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listSheetRows,
  addSheetRow,
  updateSheetRow,
  deleteSheetRow,
  replaceAllSheetRows,
} from "@/lib/sheets.functions";
import { toast } from "sonner";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{ title: "Group Sustainability Cell — Dashboard" }],
  }),
  component: DashboardApp,
});

type Item = {
  _row: number;
  meetingDate: string;
  title: string;
  owner: string;
  priority: string;
  status: string;
  dueDate: string;
  progress: string;
  notes: string;
};
type FormItem = Omit<Item, "_row">;
const emptyForm = (defaults?: Partial<FormItem>): FormItem => ({
  meetingDate: "",
  title: "",
  owner: "",
  priority: defaults?.priority ?? "Medium",
  status: defaults?.status ?? "Pending",
  dueDate: "",
  progress: "0",
  notes: "",
});

type Tab = "dashboard" | "all-items" | "add-item" | "calendar" | "reports" | "export" | "settings" | "help";

const STATUS_COLOR: Record<string, string> = {
  Completed: "bg-green-100 text-green-700",
  Pending: "bg-red-100 text-red-600",
  "In Progress": "bg-yellow-100 text-yellow-700",
  Overdue: "bg-purple-100 text-purple-700",
};
const PRIORITY_COLOR: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-green-100 text-green-700",
};

type Settings = {
  defaultPriority: string;
  defaultStatus: string;
  autoFlag: boolean;
  dashName: string;
};
const defaultSettings: Settings = {
  defaultPriority: "Medium",
  defaultStatus: "Pending",
  autoFlag: true,
  dashName: "Meeting Actions",
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem("dashSettings") || "{}") };
  } catch {
    return defaultSettings;
  }
}

function DashboardApp() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listSheetRows);
  const add = useServerFn(addSheetRow);
  const update = useServerFn(updateSheetRow);
  const del = useServerFn(deleteSheetRow);
  const replaceAll = useServerFn(replaceAllSheetRows);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    localStorage.setItem("dashSettings", JSON.stringify(settings));
  }, [settings]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["sheet-rows"],
    queryFn: () => list(),
  });

  const rawRows = (data?.rows ?? []) as Item[];

  // auto-flag overdue (display only)
  const items = useMemo(() => {
    if (!settings.autoFlag) return rawRows;
    const todayStr = new Date().toISOString().split("T")[0];
    return rawRows.map((r) =>
      ["Pending", "In Progress"].includes(r.status) && r.dueDate && r.dueDate < todayStr
        ? { ...r, status: "Overdue" }
        : r,
    );
  }, [rawRows, settings.autoFlag]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(t)) return;
      if (e.key === "n" || e.key === "N") setTab("add-item");
      if (e.key === "d" || e.key === "D") setTab("dashboard");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const refreshAll = () => {
    refetch();
    toast.success("Refreshed");
  };

  const saveMut = useMutation({
    mutationFn: async (p: { rowNumber: number | null; form: FormItem }) => {
      if (p.rowNumber == null) await add({ data: p.form });
      else await update({ data: { rowNumber: p.rowNumber, row: p.form } });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.rowNumber == null ? "Item added ✓" : "Item updated ✓");
      qc.invalidateQueries({ queryKey: ["sheet-rows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: async (rowNumber: number) => del({ data: { rowNumber } }),
    onSuccess: () => {
      toast.success("Item deleted");
      qc.invalidateQueries({ queryKey: ["sheet-rows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const replaceMut = useMutation({
    mutationFn: async (rows: FormItem[]) => replaceAll({ data: { rows } }),
    onSuccess: () => {
      toast.success("Data imported ✓");
      qc.invalidateQueries({ queryKey: ["sheet-rows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Import failed"),
  });

  const navItems: { id: Tab; icon: string; label: string }[] = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "all-items", icon: "📋", label: "All Action Items" },
    { id: "add-item", icon: "➕", label: "Add New Item" },
    { id: "calendar", icon: "📅", label: "Calendar View" },
    { id: "reports", icon: "📈", label: "Reports" },
    { id: "export", icon: "💾", label: "Export / Import" },
    { id: "settings", icon: "⚙️", label: "Settings" },
    { id: "help", icon: "❓", label: "Help" },
  ];

  const syncTime = useMemo(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }, [data]);

  return (
    <div className="flex min-h-screen bg-gray-100 font-sans text-gray-800">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-slate-950 to-blue-950 text-white p-5 hidden md:flex flex-col flex-shrink-0">
        <h1 className="text-xl font-bold mb-8 tracking-tight leading-tight">{settings.dashName}</h1>
        <nav className="space-y-1 flex-1">
          {navItems.map((n) => (
            <a
              key={n.id}
              onClick={() => setTab(n.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm ${
                tab === n.id
                  ? "bg-blue-600 text-white font-semibold"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{n.icon}</span> {n.label}
            </a>
          ))}
        </nav>
        <div className="mt-6 bg-white/10 rounded-2xl p-4 border border-white/10 text-sm">
          <p className="text-green-400 font-semibold text-xs">● Live Data</p>
          <p className="mt-1 text-gray-200">{items.length} items tracked</p>
          <p className="text-xs mt-1 text-gray-400">
            {isFetching ? "Syncing…" : `Last synced ${syncTime}`}
          </p>
        </div>
        <button
          onClick={signOut}
          className="mt-4 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-red-500/20 transition-all"
        >
          <span>🚪</span> Sign Out
        </button>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 inset-x-0 bg-slate-950 text-white p-3 z-40 flex gap-2 overflow-x-auto">
        {navItems.map((n) => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap ${
              tab === n.id ? "bg-blue-600" : "bg-white/10"
            }`}
          >
            {n.icon} {n.label}
          </button>
        ))}
        <button onClick={signOut} className="px-3 py-1.5 rounded-lg text-xs bg-red-500/30">
          🚪
        </button>
      </div>

      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        {tab === "dashboard" && (
          <DashboardView items={items} onRefresh={refreshAll} isFetching={isFetching} />
        )}
        {tab === "all-items" && (
          <AllItemsView
            items={items}
            onAdd={() => setTab("add-item")}
            onEdit={(it, form) => saveMut.mutate({ rowNumber: it._row, form })}
            onDelete={(it) => {
              if (confirm("Delete this action item?")) delMut.mutate(it._row);
            }}
          />
        )}
        {tab === "add-item" && (
          <AddItemView
            settings={settings}
            onSubmit={(form) =>
              saveMut.mutate(
                { rowNumber: null, form },
                { onSuccess: () => setTab("all-items") },
              )
            }
          />
        )}
        {tab === "calendar" && <CalendarView items={items} />}
        {tab === "reports" && <ReportsView items={items} />}
        {tab === "export" && (
          <ExportView
            items={items}
            onImport={(rows) => replaceMut.mutate(rows)}
          />
        )}
        {tab === "settings" && (
          <SettingsView settings={settings} setSettings={setSettings} />
        )}
        {tab === "help" && <HelpView />}
      </main>
    </div>
  );
}

/* ───────── Dashboard view ───────── */
function DashboardView({
  items,
  onRefresh,
  isFetching,
}: {
  items: Item[];
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const total = items.length;
  const done = items.filter((i) => i.status === "Completed").length;
  const prog = items.filter((i) => i.status === "In Progress").length;
  const pend = items.filter((i) => i.status === "Pending").length;
  const over = items.filter((i) => i.status === "Overdue").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const circ = 276.5;

  const recent = [...items]
    .sort((a, b) => (b.meetingDate || "").localeCompare(a.meetingDate || ""))
    .slice(0, 5);

  const ownerMap: Record<string, number> = {};
  items.forEach((i) => {
    if (!i.owner) return;
    ownerMap[i.owner] = (ownerMap[i.owner] || 0) + 1;
  });
  const ownerSorted = Object.entries(ownerMap).sort((a, b) => b[1] - a[1]);
  const maxOwner = ownerSorted[0]?.[1] || 1;

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Live overview of all meeting action items</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-xs font-semibold">
            ● Live
          </span>
          <button
            onClick={onRefresh}
            disabled={isFetching}
            className="bg-white shadow text-sm px-4 py-2 rounded-xl hover:bg-gray-50 transition"
          >
            ↺ {isFetching ? "Syncing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Kpi label="Total" value={total} border="border-blue-500" color="text-gray-500" />
        <Kpi label="Completed" value={done} border="border-green-500" color="text-green-600" />
        <Kpi label="In Progress" value={prog} border="border-yellow-400" color="text-yellow-600" />
        <Kpi label="Pending" value={pend} border="border-red-400" color="text-red-500" />
        <Kpi label="Overdue" value={over} border="border-purple-500" color="text-purple-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
        <div className="bg-white p-5 rounded-2xl shadow">
          <h2 className="font-semibold text-sm text-gray-600 mb-4">Status Breakdown</h2>
          <Doughnut
            data={{
              labels: ["Completed", "In Progress", "Pending", "Overdue"],
              datasets: [
                {
                  data: [done, prog, pend, over],
                  backgroundColor: ["#10b981", "#f59e0b", "#f87171", "#a78bfa"],
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              cutout: "68%",
              plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
            }}
          />
        </div>
        <div className="bg-white p-5 rounded-2xl shadow">
          <h2 className="font-semibold text-sm text-gray-600 mb-4">Priority Split</h2>
          <Bar
            data={{
              labels: ["High", "Medium", "Low"],
              datasets: [
                {
                  data: [
                    items.filter((i) => i.priority === "High").length,
                    items.filter((i) => i.priority === "Medium").length,
                    items.filter((i) => i.priority === "Low").length,
                  ],
                  backgroundColor: ["#ef4444", "#f59e0b", "#10b981"],
                  borderRadius: 7,
                },
              ],
            }}
            options={{
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { grid: { display: false } } },
            }}
          />
        </div>
        <div className="bg-white p-5 rounded-2xl shadow flex flex-col items-center justify-center">
          <h2 className="font-semibold text-sm text-gray-600 mb-4 self-start">Completion Rate</h2>
          <div className="relative w-[110px] h-[110px]">
            <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="55" cy="55" r="44" fill="none" stroke="#e5e7eb" strokeWidth="13" />
              <circle
                cx="55"
                cy="55"
                r="44"
                fill="none"
                stroke="#2563eb"
                strokeWidth="13"
                strokeDasharray={circ}
                strokeDashoffset={circ - (circ * pct) / 100}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[22px] font-bold text-blue-800">
              {pct}%
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">of all items completed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-sm text-gray-600 mb-4">Recent Activity</h2>
          <ul className="space-y-3 text-sm">
            {recent.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                    i.status === "Completed"
                      ? "bg-green-500"
                      : i.status === "Overdue"
                        ? "bg-purple-400"
                        : "bg-yellow-400"
                  }`}
                />
                <span>
                  <span className="font-medium text-gray-700">{i.title}</span>
                  <span className="text-gray-400"> — {i.owner}</span>
                  <br />
                  <span className="text-xs text-gray-400">
                    {i.dueDate} · {i.status}
                  </span>
                </span>
              </li>
            ))}
            {!recent.length && <li className="text-gray-400 text-sm">No items yet.</li>}
          </ul>
        </div>
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-sm text-gray-600 mb-4">Top Owners</h2>
          <div className="space-y-3">
            {ownerSorted.slice(0, 6).map(([name, count]) => (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="w-24 truncate text-gray-600 font-medium text-xs">{name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{ width: `${(count / maxOwner) * 100}%` }}
                  />
                </div>
                <span className="text-gray-400 text-xs w-5 text-right">{count}</span>
              </div>
            ))}
            {!ownerSorted.length && <p className="text-gray-400 text-sm">No owners yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  border,
  color,
}: {
  label: string;
  value: number;
  border: string;
  color: string;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow p-5 border-l-4 ${border}`}>
      <p className={`${color} text-xs font-medium uppercase tracking-wide`}>{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

/* ───────── All Items view ───────── */
function AllItemsView({
  items,
  onAdd,
  onEdit,
  onDelete,
}: {
  items: Item[];
  onAdd: () => void;
  onEdit: (it: Item, form: FormItem) => void;
  onDelete: (it: Item) => void;
}) {
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fPri, setFPri] = useState("");
  const [fOwner, setFOwner] = useState("");
  const [sortKey, setSortKey] = useState<keyof Item>("meetingDate");
  const [sortAsc, setSortAsc] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const owners = useMemo(
    () => [...new Set(items.map((i) => i.owner).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const term = q.toLowerCase();
    const f = items.filter(
      (it) =>
        (!term || it.title.toLowerCase().includes(term) || it.owner.toLowerCase().includes(term)) &&
        (!fStatus || it.status === fStatus) &&
        (!fPri || it.priority === fPri) &&
        (!fOwner || it.owner === fOwner),
    );
    return [...f].sort((a, b) => {
      const va = String(a[sortKey] ?? "");
      const vb = String(b[sortKey] ?? "");
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [items, q, fStatus, fPri, fOwner, sortKey, sortAsc]);

  const sortBy = (k: keyof Item) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else {
      setSortKey(k);
      setSortAsc(true);
    }
  };
  const sortIcon = (k: keyof Item) => (sortKey === k ? (sortAsc ? "↑" : "↓") : "↕");

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold">All Action Items</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Showing {filtered.length} of {items.length} items
          </p>
        </div>
        <button
          onClick={onAdd}
          className="bg-blue-600 text-white px-5 py-2 rounded-xl hover:bg-blue-700 text-sm font-medium"
        >
          + Add Item
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 mb-5 flex flex-wrap gap-3 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍  Search title or owner…"
          className="border rounded-xl px-4 py-2 text-sm flex-1 min-w-44 outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm outline-none"
        >
          <option value="">All Status</option>
          <option>Completed</option>
          <option>In Progress</option>
          <option>Pending</option>
          <option>Overdue</option>
        </select>
        <select
          value={fPri}
          onChange={(e) => setFPri(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm outline-none"
        >
          <option value="">All Priority</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select
          value={fOwner}
          onChange={(e) => setFOwner(e.target.value)}
          className="border rounded-xl px-3 py-2 text-sm outline-none"
        >
          <option value="">All Owners</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <button
          onClick={() => {
            setQ("");
            setFStatus("");
            setFPri("");
            setFOwner("");
          }}
          className="text-sm text-blue-600 hover:underline"
        >
          Clear
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-gray-500 text-left text-xs uppercase tracking-wide">
              <th className="p-3 cursor-pointer whitespace-nowrap" onClick={() => sortBy("meetingDate")}>
                Date {sortIcon("meetingDate")}
              </th>
              <th className="p-3 cursor-pointer" onClick={() => sortBy("title")}>
                Action Item {sortIcon("title")}
              </th>
              <th className="p-3 cursor-pointer" onClick={() => sortBy("owner")}>
                Owner {sortIcon("owner")}
              </th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3 cursor-pointer whitespace-nowrap" onClick={() => sortBy("dueDate")}>
                Due Date {sortIcon("dueDate")}
              </th>
              <th className="p-3">Progress</th>
              <th className="p-3">Notes</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && (
              <tr>
                <td colSpan={9} className="text-center p-10 text-gray-400 text-sm">
                  No items match your filters
                </td>
              </tr>
            )}
            {filtered.map((it) => (
              <tr key={it._row} className="border-b hover:bg-gray-50">
                <td className="p-3 text-gray-400 text-xs whitespace-nowrap">{it.meetingDate}</td>
                <td className="p-3 font-medium text-sm max-w-xs">{it.title}</td>
                <td className="p-3 text-gray-600 text-sm whitespace-nowrap">{it.owner}</td>
                <td className="p-3">
                  <span
                    className={`${PRIORITY_COLOR[it.priority] || ""} px-2.5 py-1 rounded-full text-xs font-semibold`}
                  >
                    {it.priority}
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`${STATUS_COLOR[it.status] || ""} px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap`}
                  >
                    {it.status}
                  </span>
                </td>
                <td className="p-3 text-gray-400 text-xs whitespace-nowrap">{it.dueDate}</td>
                <td className="p-3 w-32">
                  <ProgressBar pct={parseInt(it.progress) || 0} />
                </td>
                <td className="p-3 text-gray-400 text-xs max-w-[140px] truncate">{it.notes}</td>
                <td className="p-3 whitespace-nowrap">
                  <button
                    onClick={() => setEditing(it)}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg mr-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(it)}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1 rounded-lg"
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(form) => {
            onEdit(editing, form);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const col = p === 100 ? "bg-green-500" : p > 50 ? "bg-blue-500" : "bg-yellow-400";
  return (
    <>
      <div className="bg-gray-200 rounded-full h-2">
        <div className={`${col} h-2 rounded-full`} style={{ width: `${p}%` }} />
      </div>
      <p className="text-xs mt-0.5 text-gray-400">{p}%</p>
    </>
  );
}

/* ───────── Edit modal ───────── */
function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: Item;
  onClose: () => void;
  onSave: (f: FormItem) => void;
}) {
  const [f, setF] = useState<FormItem>({
    meetingDate: item.meetingDate,
    title: item.title,
    owner: item.owner,
    priority: item.priority || "Medium",
    status: item.status || "Pending",
    dueDate: item.dueDate,
    progress: item.progress || "0",
    notes: item.notes,
  });
  return (
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center p-4 z-50">
      <div className="bg-white rounded-2xl p-7 w-full max-w-2xl shadow-2xl">
        <h2 className="text-xl font-bold mb-5 text-gray-800">Edit Action Item</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Lbl label="Meeting Date">
            <input
              type="date"
              value={f.meetingDate}
              onChange={(e) => setF({ ...f, meetingDate: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-300 w-full"
            />
          </Lbl>
          <Lbl label="Action Item">
            <input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-300 w-full"
            />
          </Lbl>
          <Lbl label="Owner">
            <input
              value={f.owner}
              onChange={(e) => setF({ ...f, owner: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-300 w-full"
            />
          </Lbl>
          <Lbl label="Priority">
            <select
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </Lbl>
          <Lbl label="Status">
            <select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            >
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
              <option>Overdue</option>
            </select>
          </Lbl>
          <Lbl label="Due Date">
            <input
              type="date"
              value={f.dueDate}
              onChange={(e) => setF({ ...f, dueDate: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            />
          </Lbl>
          <Lbl label="Progress %">
            <input
              type="number"
              min={0}
              max={100}
              value={f.progress}
              onChange={(e) => setF({ ...f, progress: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            />
          </Lbl>
          <Lbl label="Notes">
            <input
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            />
          </Lbl>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-5 py-2 border rounded-xl text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => onSave(f)}
            disabled={!f.title.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      {children}
    </div>
  );
}

/* ───────── Add Item ───────── */
function AddItemView({
  settings,
  onSubmit,
}: {
  settings: Settings;
  onSubmit: (f: FormItem) => void;
}) {
  const [f, setF] = useState<FormItem>(() =>
    emptyForm({ priority: settings.defaultPriority, status: settings.defaultStatus }),
  );
  const handle = () => {
    if (!f.title.trim() || !f.owner.trim() || !f.meetingDate) {
      toast.error("Please fill Meeting Date, Action Item and Owner");
      return;
    }
    onSubmit(f);
    setF(emptyForm({ priority: settings.defaultPriority, status: settings.defaultStatus }));
  };
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-1">Add Action Item</h1>
      <p className="text-gray-500 text-sm mb-7">Create a new meeting action and assign an owner</p>
      <div className="bg-white rounded-2xl shadow p-8 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldCol label="Meeting Date *">
            <input
              type="date"
              value={f.meetingDate}
              onChange={(e) => setF({ ...f, meetingDate: e.target.value })}
              className="border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 outline-none w-full"
            />
          </FieldCol>
          <FieldCol label="Action Item *">
            <input
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
              placeholder="Describe the action…"
              className="border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 outline-none w-full"
            />
          </FieldCol>
          <FieldCol label="Owner *">
            <input
              value={f.owner}
              onChange={(e) => setF({ ...f, owner: e.target.value })}
              placeholder="Assigned person"
              className="border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-400 outline-none w-full"
            />
          </FieldCol>
          <FieldCol label="Priority">
            <select
              value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            >
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </FieldCol>
          <FieldCol label="Status">
            <select
              value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            >
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
              <option>Overdue</option>
            </select>
          </FieldCol>
          <FieldCol label="Due Date">
            <input
              type="date"
              value={f.dueDate}
              onChange={(e) => setF({ ...f, dueDate: e.target.value })}
              className="border rounded-xl p-3 text-sm outline-none w-full"
            />
          </FieldCol>
          <FieldCol
            label={
              <>
                Progress — <span className="text-blue-600">{f.progress}%</span>
              </>
            }
          >
            <input
              type="range"
              min={0}
              max={100}
              value={f.progress}
              onChange={(e) => setF({ ...f, progress: e.target.value })}
              className="w-full accent-blue-600"
            />
          </FieldCol>
          <FieldCol label="Notes">
            <input
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
              placeholder="Optional context or link…"
              className="border rounded-xl p-3 text-sm outline-none w-full"
            />
          </FieldCol>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() =>
              setF(emptyForm({ priority: settings.defaultPriority, status: settings.defaultStatus }))
            }
            className="px-5 py-2 border rounded-xl text-sm hover:bg-gray-50"
          >
            Reset
          </button>
          <button
            onClick={handle}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-semibold"
          >
            Save Item
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldCol({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

/* ───────── Calendar ───────── */
function CalendarView({ items }: { items: Item[] }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const monthLabel = new Date(year, month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const firstDay = new Date(year, month, 1).getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const todayStr = today.toISOString().split("T")[0];

  const byDate: Record<string, Item[]> = {};
  items.forEach((it) => {
    if (!it.dueDate) return;
    (byDate[it.dueDate] ||= []).push(it);
  });

  const prev = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const next = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`b${i}`} className="cal-day opacity-20" />);
  for (let d = 1; d <= daysCount; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayItems = byDate[ds] || [];
    const isToday = ds === todayStr;
    cells.push(
      <div
        key={ds}
        className={`min-h-[82px] rounded-lg p-1.5 border ${
          isToday ? "border-2 border-blue-600 bg-blue-50" : dayItems.length ? "bg-yellow-50 border-gray-200" : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className="text-xs font-semibold text-gray-600 mb-1">{d}</div>
        {dayItems.slice(0, 2).map((it, i) => {
          const colorClass =
            it.status === "Completed"
              ? "bg-gray-500"
              : it.priority === "High"
                ? "bg-red-500"
                : it.priority === "Medium"
                  ? "bg-amber-500"
                  : "bg-emerald-500";
          return (
            <div
              key={i}
              title={`${it.title} — ${it.owner}`}
              className={`${colorClass} text-white text-[10px] rounded px-1.5 py-px mt-0.5 truncate`}
            >
              {it.title.slice(0, 14)}
            </div>
          );
        })}
        {dayItems.length > 2 && (
          <div className="text-[10px] text-gray-400 mt-0.5">+{dayItems.length - 2} more</div>
        )}
      </div>,
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-4">
        <div>
          <h1 className="text-3xl font-bold">Calendar View</h1>
          <p className="text-gray-500 text-sm mt-0.5">Items plotted by due date</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prev} className="bg-white shadow px-3 py-2 rounded-xl text-sm hover:bg-gray-50">
            ‹ Prev
          </button>
          <span className="font-semibold text-gray-700 min-w-40 text-center text-sm">{monthLabel}</span>
          <button onClick={next} className="bg-white shadow px-3 py-2 rounded-xl text-sm hover:bg-gray-50">
            Next ›
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow p-5">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-xs font-semibold text-gray-400 text-center pb-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">{cells}</div>
      </div>
      <div className="flex flex-wrap gap-5 mt-4 text-xs text-gray-500">
        <span><span className="inline-block w-3 h-3 rounded bg-red-500 mr-1 align-middle" />High Priority</span>
        <span><span className="inline-block w-3 h-3 rounded bg-amber-500 mr-1 align-middle" />Medium</span>
        <span><span className="inline-block w-3 h-3 rounded bg-emerald-500 mr-1 align-middle" />Low</span>
        <span><span className="inline-block w-3 h-3 rounded bg-gray-500 mr-1 align-middle" />Completed</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-blue-600 mr-1 align-middle" />Today</span>
      </div>
    </div>
  );
}

/* ───────── Reports ───────── */
function ReportsView({ items }: { items: Item[] }) {
  const avgProgress = items.length
    ? Math.round(items.reduce((s, i) => s + (parseInt(i.progress) || 0), 0) / items.length)
    : 0;
  const completed = items.filter((i) => i.status === "Completed");
  const ontimePct = items.length ? Math.round((completed.length / items.length) * 100) + "%" : "—";
  const owners = [...new Set(items.map((i) => i.owner).filter(Boolean))];

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-1">Reports</h1>
      <p className="text-gray-500 text-sm mb-7">Analytics and performance metrics</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportCard from="from-blue-600" to="to-blue-700" label="Avg. Completion" value={avgProgress + "%"} />
        <ReportCard from="from-green-500" to="to-emerald-600" label="On-time Rate" value={ontimePct} />
        <ReportCard
          from="from-yellow-500"
          to="to-orange-500"
          label="High Priority"
          value={String(items.filter((i) => i.priority === "High").length)}
        />
        <ReportCard from="from-purple-600" to="to-indigo-600" label="Unique Owners" value={String(owners.length)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-sm text-gray-600 mb-4">Items per Owner</h2>
          <Bar
            data={{
              labels: owners,
              datasets: [
                {
                  label: "Items",
                  data: owners.map((o) => items.filter((i) => i.owner === o).length),
                  backgroundColor: "#3b82f6",
                  borderRadius: 6,
                },
              ],
            }}
            options={{
              indexAxis: "y",
              plugins: { legend: { display: false } },
              scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } }, y: { grid: { display: false } } },
            }}
          />
        </div>
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="font-semibold text-sm text-gray-600 mb-4">Priority Distribution</h2>
          <Doughnut
            data={{
              labels: ["High", "Medium", "Low"],
              datasets: [
                {
                  data: [
                    items.filter((i) => i.priority === "High").length,
                    items.filter((i) => i.priority === "Medium").length,
                    items.filter((i) => i.priority === "Low").length,
                  ],
                  backgroundColor: ["#ef4444", "#f59e0b", "#10b981"],
                  borderWidth: 0,
                },
              ],
            }}
            options={{
              cutout: "55%",
              plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
            }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5">
        <h2 className="font-semibold text-sm text-gray-600 mb-4">Owner Performance Table</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-400 text-left text-xs uppercase tracking-wide">
                <th className="p-3">Owner</th>
                <th className="p-3">Total</th>
                <th className="p-3 text-green-600">Done</th>
                <th className="p-3 text-yellow-600">In Progress</th>
                <th className="p-3 text-purple-600">Overdue</th>
                <th className="p-3">Avg Progress</th>
              </tr>
            </thead>
            <tbody>
              {owners.sort().map((o) => {
                const mine = items.filter((i) => i.owner === o);
                const avg = Math.round(
                  mine.reduce((s, i) => s + (parseInt(i.progress) || 0), 0) / mine.length,
                );
                return (
                  <tr key={o} className="border-b hover:bg-gray-50 text-sm">
                    <td className="p-3 font-medium">{o}</td>
                    <td className="p-3">{mine.length}</td>
                    <td className="p-3 text-green-600 font-medium">
                      {mine.filter((i) => i.status === "Completed").length}
                    </td>
                    <td className="p-3 text-yellow-600 font-medium">
                      {mine.filter((i) => i.status === "In Progress").length}
                    </td>
                    <td className="p-3 text-purple-600 font-medium">
                      {mine.filter((i) => i.status === "Overdue").length}
                    </td>
                    <td className="p-3 w-36">
                      <ProgressBar pct={avg} />
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
function ReportCard({
  from,
  to,
  label,
  value,
}: {
  from: string;
  to: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`bg-gradient-to-br ${from} ${to} text-white rounded-2xl p-5 shadow`}>
      <p className="text-xs opacity-75 mb-1 font-medium">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

/* ───────── Export / Import ───────── */
function ExportView({
  items,
  onImport,
}: {
  items: Item[];
  onImport: (rows: FormItem[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const headers: (keyof FormItem)[] = [
    "meetingDate",
    "title",
    "owner",
    "priority",
    "status",
    "dueDate",
    "progress",
    "notes",
  ];

  const trigger = (filename: string, dataUri: string) => {
    const a = document.createElement("a");
    a.href = dataUri;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const exportCSV = () => {
    const rows = items.map((i) =>
      headers.map((h) => `"${String((i as any)[h] || "").replace(/"/g, '""')}"`).join(","),
    );
    trigger(
      "meeting_actions.csv",
      "data:text/csv;charset=utf-8," + encodeURIComponent([headers.join(","), ...rows].join("\n")),
    );
    toast.success("CSV exported ✓");
  };
  const exportJSON = () => {
    const clean = items.map(({ _row, ...rest }) => rest);
    trigger(
      "meeting_actions.json",
      "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clean, null, 2)),
    );
    toast.success("JSON exported ✓");
  };

  const process = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || "");
        let parsed: FormItem[];
        if (file.name.endsWith(".json")) {
          const arr = JSON.parse(text);
          if (!Array.isArray(arr)) throw new Error("Not an array");
          parsed = arr.map((r: any) => ({
            meetingDate: String(r.meetingDate || ""),
            title: String(r.title || ""),
            owner: String(r.owner || ""),
            priority: String(r.priority || ""),
            status: String(r.status || ""),
            dueDate: String(r.dueDate || ""),
            progress: String(r.progress ?? ""),
            notes: String(r.notes || ""),
          }));
        } else {
          const lines = text.split("\n").filter((l) => l.trim());
          parsed = lines.slice(1).map((line) => {
            const vals = line
              .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
              .map((v) => v.replace(/^"|"$/g, "").trim());
            return Object.fromEntries(headers.map((k, i) => [k, vals[i] || ""])) as FormItem;
          });
        }
        parsed = parsed.filter((r) => r.title);
        if (!confirm(`Replace all ${items.length} items with ${parsed.length} imported items?`)) return;
        onImport(parsed);
      } catch {
        toast.error("Import failed — check format");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-1">Export / Import</h1>
      <p className="text-gray-500 text-sm mb-7">Download your data or load from CSV / JSON</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mb-6">
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-base font-bold mb-5 text-gray-700">⬇ Export Data</h2>
          <div className="space-y-3">
            <ExportRow label="CSV Format" sub="Excel, Google Sheets compatible">
              <button onClick={exportCSV} className="bg-blue-600 text-white text-xs px-4 py-2 rounded-xl hover:bg-blue-700">
                Export CSV
              </button>
            </ExportRow>
            <ExportRow label="JSON Format" sub="For APIs and developer use">
              <button onClick={exportJSON} className="bg-slate-700 text-white text-xs px-4 py-2 rounded-xl hover:bg-slate-800">
                Export JSON
              </button>
            </ExportRow>
            <ExportRow label="Print / PDF" sub="Formatted snapshot">
              <button onClick={() => window.print()} className="bg-gray-100 text-gray-700 text-xs px-4 py-2 rounded-xl hover:bg-gray-200">
                Print
              </button>
            </ExportRow>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-base font-bold mb-5 text-gray-700">⬆ Import Data</h2>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) process(f);
            }}
            className="border-2 border-dashed border-blue-300 rounded-xl p-8 text-center cursor-pointer hover:bg-blue-50 transition mb-4"
          >
            <p className="text-3xl mb-2">📂</p>
            <p className="text-sm font-medium text-gray-600">Drop a CSV or JSON file here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) process(f);
                e.target.value = "";
              }}
            />
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500">
            <p className="font-semibold text-gray-600 mb-1">CSV Column Order:</p>
            <code className="block text-gray-500">
              meetingDate, title, owner, priority, status, dueDate, progress, notes
            </code>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5 max-w-4xl">
        <h2 className="font-semibold text-sm text-gray-600 mb-4">Data Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center text-sm">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-blue-600">{items.length}</p>
            <p className="text-gray-500 mt-1 text-xs">Total Records</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-600">
              {(JSON.stringify(items).length / 1024).toFixed(1)} KB
            </p>
            <p className="text-gray-500 mt-1 text-xs">Approx. Size</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-600">
              {[...new Set(items.map((i) => i.owner).filter(Boolean))].length}
            </p>
            <p className="text-gray-500 mt-1 text-xs">Unique Owners</p>
          </div>
        </div>
      </div>
    </div>
  );
}
function ExportRow({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-xl p-4 flex justify-between items-center gap-4">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

/* ───────── Settings ───────── */
function SettingsView({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
}) {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-7">Customise dashboard behaviour</p>
      <div className="space-y-4">
        <SettingRow label="Default Priority" sub="Pre-fill when adding items">
          <select
            value={settings.defaultPriority}
            onChange={(e) => setSettings({ ...settings, defaultPriority: e.target.value })}
            className="border rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </SettingRow>
        <SettingRow label="Default Status" sub="Pre-fill when adding items">
          <select
            value={settings.defaultStatus}
            onChange={(e) => setSettings({ ...settings, defaultStatus: e.target.value })}
            className="border rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option>Pending</option>
            <option>In Progress</option>
          </select>
        </SettingRow>
        <SettingRow label="Dashboard Title" sub="Shown in the sidebar header">
          <input
            value={settings.dashName}
            onChange={(e) => setSettings({ ...settings, dashName: e.target.value })}
            className="border rounded-xl px-3 py-2 text-sm w-44 outline-none focus:ring-2 focus:ring-blue-300"
          />
        </SettingRow>
        <SettingRow label="Overdue Auto-flag" sub="Mark past-due items as Overdue on display">
          <label className="relative inline-flex items-center cursor-pointer select-none">
            <input
              type="checkbox"
              checked={settings.autoFlag}
              onChange={(e) => setSettings({ ...settings, autoFlag: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full transition-colors" />
          </label>
        </SettingRow>
      </div>
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-600">
        💡 Press <kbd className="bg-white border rounded px-1.5 py-0.5 font-mono">N</kbd> to jump to Add
        Item, <kbd className="bg-white border rounded px-1.5 py-0.5 font-mono">D</kbd> for Dashboard.
      </div>
    </div>
  );
}
function SettingRow({
  label,
  sub,
  children,
}: {
  label: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-5 flex justify-between items-center gap-4">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
      {children}
    </div>
  );
}

/* ───────── Help ───────── */
function HelpView() {
  const faqs = [
    {
      q: "How do I add a new action item?",
      a: "Click Add New Item in the sidebar, or press N. Fill in Meeting Date, Action Item, and Owner (required), then click Save. The item appears instantly in All Action Items and the Dashboard.",
    },
    {
      q: "How do I edit an existing item?",
      a: "Go to All Action Items, find the row, and click the Edit button. A modal opens with all fields pre-filled. Update any field and click Save Changes.",
    },
    {
      q: "How does the Calendar View work?",
      a: "The Calendar plots items by their due date. Navigate months with Prev / Next. Dots are colour-coded: red = High, amber = Medium, green = Low, grey = Completed. Today's date has a blue border.",
    },
    {
      q: "How do I sort or filter the table?",
      a: "Click any column header marked with ↕ to sort. Use the filter dropdowns above the table to narrow by Status, Priority, or Owner. The search box matches title and owner.",
    },
    {
      q: "How do I export or back up my data?",
      a: "Go to Export / Import and choose CSV or JSON. To import, drag-and-drop a file into the import zone — CSV columns must match the listed order. Import replaces all rows in the sheet.",
    },
    {
      q: "Where is my data stored?",
      a: "All action items are stored live in the connected Google Sheet. Every add, edit, or delete writes directly to the sheet. Settings preferences are stored locally in your browser.",
    },
  ];
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-1">Help & Guide</h1>
      <p className="text-gray-500 text-sm mb-7">Quick answers and usage tips</p>
      <div className="space-y-3">
        {faqs.map((f, i) => (
          <details key={i} className="bg-white rounded-2xl shadow p-5" open={i === 0}>
            <summary className="font-semibold text-sm cursor-pointer flex justify-between items-center list-none">
              {f.q}
              <span className="text-blue-500 text-lg leading-none">+</span>
            </summary>
            <p className="text-sm text-gray-500 mt-3 leading-relaxed">{f.a}</p>
          </details>
        ))}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mt-2">
          <p className="font-semibold text-blue-700 text-sm mb-2">⌨ Keyboard Shortcuts</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-blue-600">
            <span>
              <kbd className="bg-white border rounded px-1.5 py-0.5 font-mono">D</kbd> — Dashboard
            </span>
            <span>
              <kbd className="bg-white border rounded px-1.5 py-0.5 font-mono">N</kbd> — Add New Item
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
