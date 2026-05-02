import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { UserPlus, MoreHorizontal, Activity, Cpu, Shield } from "lucide-react";

const users = [
  { name: "Amir Karimov", role: "Customs Officer", gate: "Astara · Lane 3", status: "online" },
  { name: "Leyla Mammadova", role: "Senior Inspector", gate: "Baku Port", status: "online" },
  { name: "Tural Hasanov", role: "Risk Analyst", gate: "HQ", status: "offline" },
  { name: "Nigar Aliyeva", role: "AI Operator", gate: "HQ", status: "online" },
  { name: "Vusal Quliyev", role: "Supervisor", gate: "Astara", status: "offline" },
];

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

export default function Admin() {
  return (
    <>
      <PageHeader
        eyebrow="System Administration"
        title="Admin Panel"
        description="Manage users, monitor system logs, and configure AI models."
        actions={<Button className="bg-gradient-ocean shadow-glow gap-2"><UserPlus className="h-4 w-4" /> Add User</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Users */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
          <div className="p-5 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">User Management</h3>
            </div>
            <span className="text-xs text-muted-foreground">{users.length} users</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/30">
                <th className="text-left font-semibold px-5 py-3">User</th>
                <th className="text-left font-semibold px-5 py-3">Role</th>
                <th className="text-left font-semibold px-5 py-3">Assignment</th>
                <th className="text-left font-semibold px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.name} className="border-b border-border/40 hover:bg-muted/30 transition-base">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-gradient-ocean flex items-center justify-center text-white font-semibold text-xs">
                        {u.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <span className="font-medium text-foreground">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.role}</td>
                  <td className="px-5 py-3.5 text-muted-foreground">{u.gate}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      u.status === "online" ? "text-success" : "text-muted-foreground"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${u.status === "online" ? "bg-success" : "bg-muted-foreground"}`} />
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
                <span className={`shrink-0 font-bold ${
                  l.level === "danger" ? "text-destructive" :
                  l.level === "warn" ? "text-warning-foreground" : "text-primary"
                }`}>
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
              <div key={m.name} className="rounded-xl border border-border/60 p-4 hover:shadow-card transition-base">
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
