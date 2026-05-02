import { PageHeader } from "@/components/layout/PageHeader";
import { Camera, Container, ScanLine, CheckCircle2, XCircle, Truck } from "lucide-react";

export default function Gate() {
  return (
    <>
      <PageHeader
        eyebrow="Astara Border Gate · Lane 3"
        title="Border Gate Simulation"
        description="Live ANPR + container ID verification. AI matches scan against declared shipment data."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Camera feeds */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: "License Plate Camera", value: "10-AZ-4471", icon: Camera },
              { label: "Container Scanner", value: "MSCU-7184629", icon: Container },
            ].map((c) => (
              <div key={c.label} className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
                <div className="aspect-video bg-gradient-to-br from-primary-deep to-foreground relative overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <pattern id={`g-${c.label}`} width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.3" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill={`url(#g-${c.label})`} />
                  </svg>

                  <div className="absolute inset-0 flex items-center justify-center">
                    <Truck className="h-20 w-20 text-white/30" strokeWidth={1} />
                  </div>

                  {/* scan corners */}
                  <div className="absolute inset-8 border-2 border-primary-glow rounded-lg">
                    {[
                      "top-0 left-0 border-t-4 border-l-4",
                      "top-0 right-0 border-t-4 border-r-4",
                      "bottom-0 left-0 border-b-4 border-l-4",
                      "bottom-0 right-0 border-b-4 border-r-4",
                    ].map((p) => (
                      <div key={p} className={`absolute h-5 w-5 border-warning ${p}`} />
                    ))}
                    <div className="absolute inset-x-0 h-0.5 bg-warning shadow-[0_0_12px_hsl(var(--warning))] animate-scan" />
                  </div>

                  <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-destructive/90 backdrop-blur text-white px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur rounded-lg p-2.5">
                    <div className="flex items-center gap-2 text-xs text-white/70 mb-0.5">
                      <c.icon className="h-3.5 w-3.5" /> {c.label}
                    </div>
                    <div className="text-xl font-bold text-white font-mono tracking-wider">{c.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Match table */}
          <div className="bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
            <div className="p-5 border-b border-border/60 flex items-center justify-between">
              <h3 className="text-base font-semibold">Verification Matrix</h3>
              <div className="text-xs text-muted-foreground">Processed in 0.84s</div>
            </div>
            <div className="divide-y divide-border/40">
              {[
                { check: "License Plate", scanned: "10-AZ-4471", expected: "10-AZ-4471", ok: true },
                { check: "Container ID", scanned: "MSCU-7184629", expected: "MSCU-7184629", ok: true },
                { check: "Driver ID", scanned: "AZ-7782134", expected: "AZ-7782134", ok: true },
                { check: "Seal Number", scanned: "SL-882104", expected: "SL-882104", ok: true },
                { check: "Weight (kg)", scanned: "18,420", expected: "18,400", ok: true },
                { check: "X-ray Anomaly", scanned: "None detected", expected: "—", ok: true },
              ].map((r) => (
                <div key={r.check} className="grid grid-cols-12 px-5 py-3.5 text-sm items-center">
                  <div className="col-span-3 font-medium">{r.check}</div>
                  <div className="col-span-4 font-mono text-xs text-muted-foreground">{r.scanned}</div>
                  <div className="col-span-4 font-mono text-xs text-muted-foreground">{r.expected}</div>
                  <div className="col-span-1 flex justify-end">
                    {r.ok ? <CheckCircle2 className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Big status */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-success to-[hsl(152_75%_30%)] rounded-2xl p-8 text-center text-white shadow-elegant relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,white,transparent_60%)] opacity-10" />
            <div className="h-20 w-20 rounded-full bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-4 animate-pulse-glow">
              <CheckCircle2 className="h-12 w-12" strokeWidth={2.5} />
            </div>
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/80 font-semibold mb-1">Decision</div>
            <div className="text-5xl font-black tracking-tight mb-2">PASS</div>
            <p className="text-sm text-white/90">All 6 checks matched. Vehicle cleared to proceed.</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/15 rounded-lg p-2">
                <div className="text-white/70 uppercase tracking-wider text-[10px]">Confidence</div>
                <div className="font-bold text-base">99.2%</div>
              </div>
              <div className="bg-white/15 rounded-lg p-2">
                <div className="text-white/70 uppercase tracking-wider text-[10px]">Time</div>
                <div className="font-bold text-base">0.84s</div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl p-5 border border-border/60 shadow-card">
            <div className="flex items-center gap-2 text-sm font-semibold mb-3">
              <ScanLine className="h-4 w-4 text-primary" /> Recent Gate Activity
            </div>
            <div className="space-y-2.5">
              {[
                { plate: "10-AZ-4471", status: "PASS", color: "success" },
                { plate: "21-BA-9923", status: "HOLD", color: "destructive" },
                { plate: "08-CC-1140", status: "PASS", color: "success" },
                { plate: "33-DE-7782", status: "PASS", color: "success" },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-muted-foreground">{r.plate}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    r.color === "success" ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
