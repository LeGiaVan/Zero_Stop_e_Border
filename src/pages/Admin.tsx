import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Activity, Cpu, MoreHorizontal, Pencil, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import type { UserProfileRow, UserRole } from "@/types/profile";

const logs = [
  { t: "10:42:18", evt: "Shipment ZSB-2401-8818 flagged HIGH RISK", level: "danger" },
  { t: "10:41:55", evt: "Gate 3 — Vehicle 10-AZ-4471 PASS", level: "info" },
  { t: "10:40:12", evt: "AI model 'risk-v4.2' retraining started", level: "warn" },
  { t: "10:38:47", evt: "User Tural Hasanov logged out", level: "info" },
  { t: "10:35:22", evt: "OCR engine restarted (auto-recovery)", level: "warn" },
];

const models = [
  { name: "Risk Scoring", version: "v4.2", accuracy: 96.4, enabled: true },
  { name: "HS Code Classifier", version: "v3.8", accuracy: 98.1, enabled: true },
  { name: "OCR Document Extractor", version: "v2.5", accuracy: 99.2, enabled: true },
  { name: "ANPR / Plate Recognition", version: "v5.1", accuracy: 99.7, enabled: true },
  { name: "Anomaly Detection (X-ray)", version: "v1.4 beta", accuracy: 87.3, enabled: false },
];

const ROLE_OPTIONS: UserRole[] = ["admin", "operator", "inspector", "viewer"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

async function fetchAllProfiles(): Promise<UserProfileRow[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Workspace is not configured.");
  const { data, error } = await supabase.from("user_profiles").select("*").order("full_name");
  if (error) throw error;
  return (data ?? []) as UserProfileRow[];
}

function UserManagementBlock() {
  const queryClient = useQueryClient();
  const { profile: myProfile, refreshAuthSession } = useAuth();
  const myUserId = myProfile?.user_id ?? null;

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<UserProfileRow | null>(null);
  const [formName, setFormName] = useState("");
  const [formDept, setFormDept] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("operator");
  const [formActive, setFormActive] = useState(true);

  const [removeTarget, setRemoveTarget] = useState<UserProfileRow | null>(null);

  const { data: users = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin", "user_profiles"],
    queryFn: fetchAllProfiles,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin", "user_profiles"] });

  const updateMutation = useMutation({
    mutationFn: async (patch: {
      id: string;
      user_id: string;
      full_name: string;
      department: string;
      role: UserRole;
      is_active: boolean;
    }) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Workspace is not configured.");
      const { error: upErr } = await supabase
        .from("user_profiles")
        .update({
          full_name: patch.full_name.trim(),
          department: patch.department.trim(),
          role: patch.role,
          is_active: patch.is_active,
        })
        .eq("id", patch.id);
      if (upErr) throw upErr;
    },
    onSuccess: async (_data, variables) => {
      toast.success("Profile updated.");
      invalidate();
      setEditOpen(false);
      setEditing(null);
      if (variables.user_id === myUserId) await refreshAuthSession();
    },
    onError: (e: Error) => toast.error(e.message || "Update failed."),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; user_id: string; is_active: boolean }) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Workspace is not configured.");
      const { error: upErr } = await supabase.from("user_profiles").update({ is_active }).eq("id", id);
      if (upErr) throw upErr;
    },
    onSuccess: async (_data, variables) => {
      invalidate();
      if (variables.user_id === myUserId) await refreshAuthSession();
    },
    onError: (e: Error) => toast.error(e.message || "Could not update status."),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id }: { id: string; user_id: string }) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw new Error("Workspace is not configured.");
      const { error: delErr } = await supabase.from("user_profiles").delete().eq("id", id);
      if (delErr) throw delErr;
    },
    onSuccess: async (_data, variables) => {
      toast.success("Profile removed.");
      invalidate();
      setRemoveTarget(null);
      if (variables.user_id === myUserId) await refreshAuthSession();
    },
    onError: (e: Error) => toast.error(e.message || "Remove failed."),
  });

  function openEdit(row: UserProfileRow) {
    setEditing(row);
    setFormName(row.full_name);
    setFormDept(row.department ?? "");
    setFormRole(row.role);
    setFormActive(row.is_active);
    setEditOpen(true);
  }

  function submitEdit() {
    if (!editing) return;
    updateMutation.mutate({
      id: editing.id,
      user_id: editing.user_id,
      full_name: formName,
      department: formDept,
      role: formRole,
      is_active: formActive,
    });
  }

  const errMessage = error instanceof Error ? error.message : "Could not load users.";

  return (
    <>
      <div className="lg:col-span-2 bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
        <div className="p-5 border-b border-border/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">User Management</h3>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {isLoading ? "Loading…" : `${users.length} users`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/30">
                <th className="text-left font-semibold px-5 py-3">User</th>
                <th className="text-left font-semibold px-5 py-3">Role</th>
                <th className="text-left font-semibold px-5 py-3">Team</th>
                <th className="text-left font-semibold px-5 py-3">Access</th>
                <th className="text-left font-semibold px-5 py-3">Last sign-in</th>
                <th className="text-left font-semibold px-5 py-3">Account ID</th>
                <th className="px-5 py-3 w-12" />
              </tr>
            </thead>
            <tbody>
              {isError ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">
                    {errMessage}
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">
                    Loading profiles…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground text-sm">
                    No profiles yet.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = myUserId === u.user_id;
                  return (
                    <tr key={u.id} className="border-b border-border/40 hover:bg-muted/30 transition-base">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-ocean flex items-center justify-center text-white font-semibold text-xs shrink-0">
                            {initials(u.full_name)}
                          </div>
                          <span className="font-medium text-foreground">{u.full_name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">{formatRole(u.role)}</td>
                      <td className="px-5 py-3.5 text-muted-foreground max-w-[180px] truncate" title={u.department}>
                        {u.department || "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={u.is_active}
                            disabled={toggleActiveMutation.isPending}
                            onCheckedChange={(checked) => {
                              toggleActiveMutation.mutate({
                                id: u.id,
                                user_id: u.user_id,
                                is_active: checked,
                              });
                            }}
                            aria-label={u.is_active ? "Active" : "Disabled"}
                          />
                          <span
                            className={`text-xs font-semibold ${
                              u.is_active ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            {u.is_active ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap text-xs">
                        {formatWhen(u.last_login)}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-[11px] text-muted-foreground" title={u.user_id}>
                        {u.user_id.slice(0, 8)}…
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="User actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onSelect={(ev) => {
                                ev.preventDefault();
                                openEdit(u);
                              }}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit profile
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={isSelf}
                              onSelect={(ev) => {
                                ev.preventDefault();
                                if (!isSelf) setRemoveTarget(u);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove profile
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Update display name, team, role, and access for this workspace user.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="admin-name">Full name</Label>
              <Input id="admin-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-dept">Team / unit</Label>
              <Input
                id="admin-dept"
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
                placeholder="e.g. HQ · Gate operations"
              />
            </div>
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={formRole} onValueChange={(v) => setFormRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {formatRole(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
              <div>
                <p className="text-sm font-medium">Workspace access</p>
                <p className="text-xs text-muted-foreground">Inactive users cannot use the application.</p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-gradient-ocean shadow-glow"
              disabled={!formName.trim() || updateMutation.isPending}
              onClick={() => void submitEdit()}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove workspace profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the profile record for{" "}
              <span className="font-medium text-foreground">{removeTarget?.full_name}</span>. The authentication
              account may still exist; the user might get a new default profile when they sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending || !removeTarget}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget) {
                  deleteMutation.mutate({ id: removeTarget.id, user_id: removeTarget.user_id });
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Admin() {
  return (
    <>
      <PageHeader
        eyebrow="System Administration"
        title="Admin Panel"
        description="Manage users, monitor system logs, and configure AI models."
        actions={
          <Button
            type="button"
            className="bg-gradient-ocean shadow-glow gap-2"
            onClick={() =>
              toast.message("Adding people", {
                description:
                  "Share the sign-up link with new staff, then assign their role here after they register.",
              })
            }
          >
            <UserPlus className="h-4 w-4" /> Add user
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <UserManagementBlock />

        {/* Logs */}
        <div className="bg-card rounded-2xl border border-border/60 shadow-card">
          <div className="p-5 border-b border-border/60 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">System Logs</h3>
          </div>
          <div className="p-2 max-h-[420px] overflow-y-auto font-mono text-xs">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-3 px-3 py-2 hover:bg-muted/40 rounded-md">
                <span className="text-muted-foreground shrink-0">{l.t}</span>
                <span
                  className={`shrink-0 font-bold ${
                    l.level === "danger"
                      ? "text-destructive"
                      : l.level === "warn"
                        ? "text-warning-foreground"
                        : "text-primary"
                  }`}
                >
                  {l.level === "danger" ? "ERR" : l.level === "warn" ? "WRN" : "INF"}
                </span>
                <span className="text-foreground">{l.evt}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI Models */}
        <div className="lg:col-span-3 bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
          <div className="p-5 border-b border-border/60 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">AI Model Configuration</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
            {models.map((m) => (
              <div
                key={m.name}
                className="rounded-xl border border-border/60 p-4 hover:shadow-card transition-base"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-sm">{m.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{m.version}</div>
                  </div>
                  <Switch defaultChecked={m.enabled} />
                </div>
                <div className="text-xs text-muted-foreground mb-1.5 flex justify-between">
                  <span>Accuracy</span>
                  <span className="font-semibold text-foreground">{m.accuracy}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-ocean rounded-full" style={{ width: `${m.accuracy}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
