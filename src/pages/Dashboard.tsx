import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Package, AlertTriangle, Clock, CheckCircle2, Download, Plus,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const shipmentData = [
  { day: "Mon", shipments: 240, cleared: 215 },
  { day: "Tue", shipments: 318, cleared: 290 },
  { day: "Wed", shipments: 286, cleared: 260 },
  { day: "Thu", shipments: 402, cleared: 372 },
  { day: "Fri", shipments: 478, cleared: 450 },
  { day: "Sat", shipments: 365, cleared: 340 },
  { day: "Sun", shipments: 298, cleared: 280 },
];

const riskData = [
  { name: "Low", value: 68, color: "hsl(var(--success))" },
  { name: "Medium", value: 24, color: "hsl(var(--warning))" },
  { name: "High", value: 8, color: "hsl(var(--destructive))" },
];

const recent = [
  { id: "ZSB-2401-8821", origin: "Shanghai → Baku", goods: "Electronics", risk: 12, status: "cleared" as const },
  { id: "ZSB-2401-8820", origin: "Istanbul → Tbilisi", goods: "Textiles", risk: 47, status: "warning" as const },
  { id: "ZSB-2401-8819", origin: "Hamburg → Baku", goods: "Auto parts", risk: 8, status: "valid" as const },
  { id: "ZSB-2401-8818", origin: "Dubai → Baku", goods: "Pharmaceuticals", risk: 89, status: "fraud" as const },
  { id: "ZSB-2401-8817", origin: "Rotterdam → Tbilisi", goods: "Machinery", risk: 22, status: "valid" as const },
];

export default function Dashboard() {
  return (
    <>
      <PageHeader
        eyebrow="Operations Center"
        title="Real-time Border Intelligence"
        description="AI-powered overview of shipments, clearance performance, and risk signals across all gates."
        actions={
          <>
            <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Export</Button>
            <Button className="gap-2 bg-gradient-ocean shadow-glow"><Plus className="h-4 w-4" /> New Declaration</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Shipments" value="12,486" icon={Package} trend={{ value: "+8.4%", positive: true }} variant="primary" />
        <StatCard label="Risk Percentage" value="7.2%" icon={AlertTriangle} trend={{ value: "-1.1%", positive: true }} variant="danger" />
        <StatCard label="Avg. Clearance" value="14m 32s" icon={Clock} trend={{ value: "-22%", positive: true }} variant="warning" />
        <StatCard label="AI Approvals" value="9,841" icon={CheckCircle2} trend={{ value: "+12.6%", positive: true }} variant="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-card rounded-2xl p-6 border border-border/60 shadow-card">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">Shipments Over Time</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Last 7 days · processed vs cleared</p>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Processed</div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary-glow" /> Cleared</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={shipmentData}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary-glow))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary-glow))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
              <Area type="monotone" dataKey="shipments" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#g1)" />
              <Area type="monotone" dataKey="cleared" stroke="hsl(var(--primary-glow))" strokeWidth={2.5} fill="url(#g2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-2xl p-6 border border-border/60 shadow-card">
          <h3 className="text-base font-semibold text-foreground">Risk Distribution</h3>
          <p className="text-sm text-muted-foreground mt-0.5 mb-4">Past 24 hours</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={riskData} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={3} strokeWidth={0}>
                {riskData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {riskData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name} risk
                </span>
                <span className="font-semibold text-foreground">{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Recent Shipments</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Live feed from all border gates</p>
          </div>
          <Button variant="ghost" size="sm">View all</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted-foreground border-y border-border/60 bg-muted/30">
                <th className="text-left font-semibold px-6 py-3">Shipment ID</th>
                <th className="text-left font-semibold px-6 py-3">Route</th>
                <th className="text-left font-semibold px-6 py-3">Goods</th>
                <th className="text-left font-semibold px-6 py-3">Risk Score</th>
                <th className="text-left font-semibold px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 transition-base">
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-primary">{r.id}</td>
                  <td className="px-6 py-4 text-foreground">{r.origin}</td>
                  <td className="px-6 py-4 text-muted-foreground">{r.goods}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 max-w-[140px]">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${r.risk}%`,
                            background: r.risk > 70 ? "hsl(var(--destructive))" : r.risk > 30 ? "hsl(var(--warning))" : "hsl(var(--success))",
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-foreground w-8 text-right">{r.risk}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
