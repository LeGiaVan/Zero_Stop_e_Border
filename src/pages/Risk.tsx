import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { AlertTriangle, ShieldAlert, TrendingUp } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabaseClient";

type ShipmentRiskRow = {
  id: string;
  shipment_number: string;
  risk_score: number | null;
  risk_level: string | null;
  risk_explanation: string | null;
  status: string | null;
  created_at: string | null;
};

async function fetchRiskSnapshot() {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Workspace is not configured.");
  const shipRes = await sb
    .from("shipments")
    .select("id, shipment_number, risk_score, risk_level, risk_explanation, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ShipmentRiskRow>();
  if (shipRes.error) throw shipRes.error;
  const shipment = shipRes.data;
  if (!shipment) return { shipment: null, warnings: 0, fraud: 0, anomalies: 0, holds: 0 };

  const [docsRes, eventsRes, scansRes] = await Promise.all([
    sb.from("documents").select("verification_status").eq("shipment_id", shipment.id),
    sb.from("tracking_events").select("event_type").eq("shipment_id", shipment.id),
    sb.from("border_scans").select("scan_result").eq("shipment_id", shipment.id),
  ]);
  if (docsRes.error) throw docsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (scansRes.error) throw scansRes.error;

  const warningDocs = (docsRes.data ?? []).filter((d) => d.verification_status === "warning").length;
  const fraudDocs = (docsRes.data ?? []).filter((d) => d.verification_status === "fraud_risk").length;
  const anomalyEvents = (eventsRes.data ?? []).filter((e) => e.event_type === "anomaly_detected").length;
  const holdScans = (scansRes.data ?? []).filter((s) => s.scan_result === "hold").length;
  return { shipment, warnings: warningDocs, fraud: fraudDocs, anomalies: anomalyEvents, holds: holdScans };
}

function severityLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: "High Risk — Manual Review", color: "text-destructive" };
  if (score >= 40) return { text: "Medium Risk — Enhanced Checks", color: "text-warning-foreground" };
  return { text: "Low Risk — Standard Flow", color: "text-success" };
}

export default function Risk() {
  const workspaceReady = isSupabaseConfigured();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["risk", "snapshot"],
    queryFn: fetchRiskSnapshot,
    enabled: workspaceReady,
  });

  const overall = useMemo(() => {
    const base = Number(data?.shipment?.risk_score ?? 0);
    const extra = (data?.fraud ?? 0) * 25 + (data?.warnings ?? 0) * 10 + (data?.anomalies ?? 0) * 12 + (data?.holds ?? 0) * 8;
    return Math.max(0, Math.min(100, Math.round(base + extra)));
  }, [data?.anomalies, data?.fraud, data?.holds, data?.shipment?.risk_score, data?.warnings]);

  const factors = [
    { label: "Document mismatch risk", score: Math.min(100, (data?.fraud ?? 0) * 50 + (data?.warnings ?? 0) * 20), weight: "High" },
    { label: "Trajectory anomaly risk", score: Math.min(100, (data?.anomalies ?? 0) * 30), weight: "High" },
    { label: "Gate hold frequency", score: Math.min(100, (data?.holds ?? 0) * 25), weight: "Medium" },
    { label: "Base declaration score", score: Math.min(100, Number(data?.shipment?.risk_score ?? 0)), weight: "Medium" },
  ];
  const sev = severityLabel(overall);

  return (
    <>
      <PageHeader
        eyebrow="AI Risk Engine"
        title="Risk Analysis"
        description="Risk score synthesized from verification, trajectory, and gate outcomes."
      />

      {!workspaceReady ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Risk analysis requires Supabase workspace configuration.
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading risk metrics...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load risk data: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      ) : !data?.shipment ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          No shipments available for risk scoring.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="bg-card rounded-2xl p-6 border border-border/60 shadow-card flex flex-col items-center text-center">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">Overall Risk Score</div>
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  <circle cx="100" cy="100" r="80" stroke="hsl(var(--muted))" strokeWidth="14" fill="none" />
                  <circle
                    cx="100"
                    cy="100"
                    r="80"
                    stroke="hsl(var(--destructive))"
                    strokeWidth="14"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(overall / 100) * 502} 502`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-5xl font-bold text-destructive">{overall}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">/ 100</div>
                </div>
              </div>
              <div className={`inline-flex items-center gap-2 mt-4 px-3 py-1.5 bg-destructive-soft rounded-full text-sm font-semibold ${sev.color}`}>
                <ShieldAlert className="h-4 w-4" /> {sev.text}
              </div>
            </div>

            <div className="lg:col-span-2 bg-gradient-primary text-white rounded-2xl p-6 shadow-elegant">
              <div className="font-semibold mb-2">AI Explanation</div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-5 space-y-2 text-sm leading-relaxed">
                <p>
                  <strong>Shipment:</strong> {data.shipment.shipment_number}
                </p>
                <p>
                  <strong>Status:</strong> {(data.shipment.status ?? "pending").toUpperCase()}
                </p>
                <p>
                  <strong>Model note:</strong>{" "}
                  {data.shipment.risk_explanation?.trim() ||
                    "Risk explanation not provided yet. Score derived from verification warnings, trajectory anomalies, and gate holds."}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-6 border border-border/60 shadow-card">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold">Risk Factor Breakdown</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Latest calculated contributors</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <TrendingUp className="h-4 w-4" /> Updated now
              </div>
            </div>
            <div className="space-y-5">
              {factors.map((f) => (
                <div key={f.label}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{f.label}</span>
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                        {f.weight}
                      </span>
                    </div>
                    <span className={`text-sm font-bold ${f.score > 70 ? "text-destructive" : f.score > 30 ? "text-warning-foreground" : "text-success"}`}>
                      {f.score}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${f.score}%`,
                        background: f.score > 70 ? "hsl(var(--destructive))" : f.score > 30 ? "hsl(var(--warning))" : "hsl(var(--success))",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 p-4 rounded-xl bg-warning-soft border border-warning/30 flex gap-3">
              <AlertTriangle className="h-5 w-5 text-warning-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <strong>Officer note:</strong> Prioritize shipments with repeated gate holds and unresolved trajectory anomalies.
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
