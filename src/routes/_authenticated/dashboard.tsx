import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listSheetRows,
  addSheetRow,
  updateSheetRow,
  deleteSheetRow,
} from "@/lib/sheets.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Plus,
  Search,
  LogOut,
  Pencil,
  Trash2,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CircleDashed,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Sustainability Cell — Dashboard" },
      { name: "description", content: "Track Group Sustainability Cell action items synced with Google Sheets." },
    ],
  }),
  component: Dashboard,
});

type FormState = {
  meetingDate: string;
  title: string;
  owner: string;
  priority: string;
  status: string;
  dueDate: string;
  progress: string;
  notes: string;
};
const empty: FormState = {
  meetingDate: "",
  title: "",
  owner: "",
  priority: "Medium",
  status: "Not Started",
  dueDate: "",
  progress: "0",
  notes: "",
};

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1F8vHgPla-myhSS6JlVYLpQXxHzBw5rBY6Y4Me438zus/edit";

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useServerFn(listSheetRows);
  const add = useServerFn(addSheetRow);
  const update = useServerFn(updateSheetRow);
  const del = useServerFn(deleteSheetRow);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["sheet-rows"],
    queryFn: () => list(),
  });

  const [editing, setEditing] = useState<{ rowNumber: number | null; form: FormState } | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        r.owner.toLowerCase().includes(term) ||
        r.notes.toLowerCase().includes(term)
      );
    });
  }, [rows, q, statusFilter]);

  const stats = useMemo(() => {
    const s = { total: rows.length, completed: 0, inProgress: 0, blocked: 0 };
    for (const r of rows) {
      if (r.status === "Completed") s.completed++;
      else if (r.status === "In Progress") s.inProgress++;
      else if (r.status === "Blocked") s.blocked++;
    }
    return s;
  }, [rows]);

  const saveMut = useMutation({
    mutationFn: async (payload: { rowNumber: number | null; form: FormState }) => {
      if (payload.rowNumber == null) await add({ data: payload.form });
      else await update({ data: { rowNumber: payload.rowNumber, row: payload.form } });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.rowNumber == null ? "Item added" : "Item updated");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["sheet-rows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  const delMut = useMutation({
    mutationFn: async (rowNumber: number) => {
      await del({ data: { rowNumber } });
    },
    onSuccess: () => {
      toast.success("Item deleted");
      setConfirmDel(null);
      qc.invalidateQueries({ queryKey: ["sheet-rows"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-lg shadow-glow">
            🌱
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight">Group Sustainability Cell</h1>
            <p className="text-xs text-muted-foreground">Synced with Google Sheets · live edits</p>
          </div>
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Open sheet <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Stats */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total items" value={stats.total} icon={<CircleDashed className="h-4 w-4" />} tone="muted" />
          <StatCard label="In progress" value={stats.inProgress} icon={<Clock className="h-4 w-4" />} tone="primary" />
          <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
          <StatCard label="Blocked" value={stats.blocked} icon={<AlertTriangle className="h-4 w-4" />} tone="danger" />
        </section>

        {/* Controls */}
        <Card className="shadow-card">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search title, owner, notes…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Not Started">Not Started</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Blocked">Blocked</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setEditing({ rowNumber: null, form: { ...empty } })}>
              <Plus className="mr-1.5 h-4 w-4" /> Add item
            </Button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Progress</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading from Google Sheets…</td></tr>
                ) : error ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-danger">{(error as Error).message}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    {rows.length === 0 ? "Sheet is empty. Add your first item." : "No items match the filters."}
                  </td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r._row} className="border-t hover:bg-muted/30">
                      <td className="max-w-[26rem] px-4 py-3">
                        <div className="font-medium truncate">{r.title || "—"}</div>
                        {r.notes && <div className="truncate text-xs text-muted-foreground">{r.notes}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.owner || "—"}</td>
                      <td className="px-4 py-3"><StatusBadge value={r.status} /></td>
                      <td className="px-4 py-3"><PriorityBadge value={r.priority} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{r.dueDate || "—"}</td>
                      <td className="px-4 py-3 w-40">
                        <ProgressBar value={Number(r.progress) || 0} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ rowNumber: r._row, form: { ...r } as FormState })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setConfirmDel(r._row)}>
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {/* Edit / Add dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.rowNumber == null ? "Add item" : "Edit item"}</DialogTitle>
            <DialogDescription>Changes write directly to the connected Google Sheet.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title *" className="md:col-span-2">
                <Input value={editing.form.title} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, title: e.target.value } })} />
              </Field>
              <Field label="Owner">
                <Input value={editing.form.owner} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, owner: e.target.value } })} />
              </Field>
              <Field label="Meeting date">
                <Input type="date" value={editing.form.meetingDate} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, meetingDate: e.target.value } })} />
              </Field>
              <Field label="Status">
                <Select value={editing.form.status || "Not Started"} onValueChange={(v) => setEditing({ ...editing, form: { ...editing.form, status: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Not Started", "In Progress", "Blocked", "Completed"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={editing.form.priority || "Medium"} onValueChange={(v) => setEditing({ ...editing, form: { ...editing.form, priority: v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Low", "Medium", "High", "Critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Due date">
                <Input type="date" value={editing.form.dueDate} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, dueDate: e.target.value } })} />
              </Field>
              <Field label="Progress (%)">
                <Input type="number" min={0} max={100} value={editing.form.progress} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, progress: e.target.value } })} />
              </Field>
              <Field label="Notes" className="md:col-span-2">
                <Textarea rows={3} value={editing.form.notes} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, notes: e.target.value } })} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              disabled={!editing?.form.title.trim() || saveMut.isPending}
              onClick={() => editing && saveMut.mutate(editing)}
            >
              {saveMut.isPending ? "Saving…" : "Save to sheet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDel !== null} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this row?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the row from the Google Sheet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={() => confirmDel != null && delMut.mutate(confirmDel)}
            >
              {delMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "muted" | "primary" | "success" | "danger" }) {
  const toneClass = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    danger: "bg-danger/10 text-danger",
  }[tone];
  return (
    <Card className="flex items-center gap-4 p-5 shadow-card">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass}`}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    "Completed": "bg-success/15 text-success border-success/30",
    "In Progress": "bg-primary/15 text-primary border-primary/30",
    "Blocked": "bg-danger/15 text-danger border-danger/30",
    "Not Started": "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[value] ?? ""}>{value}</Badge>;
}

function PriorityBadge({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    Critical: "bg-danger/15 text-danger border-danger/30",
    High: "bg-warning/20 text-warning-foreground border-warning/40",
    Medium: "bg-primary/10 text-primary border-primary/30",
    Low: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={map[value] ?? ""}>{value}</Badge>;
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-brand-gradient transition-all" style={{ width: `${v}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{v}%</span>
    </div>
  );
}
