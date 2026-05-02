import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MapPin, Truck, Lock, Navigation, Clock, CheckCircle2, Circle } from "lucide-react";

const events = [
  { time: "09:42", title: "Shipment Created", place: "Shanghai Port", done: true },
  { time: "11:18", title: "Loaded onto vessel", place: "Yangshan Terminal", done: true },
  { time: "14:55", title: "Customs cleared (export)", place: "Shanghai Customs", done: true },
  { time: "—", title: "Arrived at Baku Port", place: "Caspian Sea Terminal", done: true, current: true },
  { time: "—", title: "Border clearance", place: "Astara Gate", done: false },
  { time: "—", title: "Delivered", place: "Tbilisi Warehouse", done: false },
];

export default function Tracking() {
  return (
    <>
      <PageHeader
        eyebrow="Live Operations"
        title="Shipment Tracking"
        description="Real-time GPS, seal status, and event timeline for shipment ZSB-2401-8821."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border/60 shadow-card overflow-hidden">
          <div className="relative aspect-[16/10] bg-gradient-to-br from-primary-deep via-primary to-primary-glow overflow-hidden">
            {/* grid pattern */}
            <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            {/* route */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 800 500">
              <path d="M 80 380 Q 250 200 420 280 T 720 120" stroke="white" strokeWidth="3" fill="none" strokeDasharray="8 6" opacity="0.85" />
              <circle cx="80" cy="380" r="8" fill="hsl(var(--success))" />
              <circle cx="420" cy="280" r="10" fill="hsl(var(--warning))" className="animate-pulse" />
              <circle cx="720" cy="120" r="8" fill="white" stroke="hsl(var(--primary-deep))" strokeWidth="3" />
            </svg>

            {/* labels */}
            <div className="absolute top-4 left-4 right-4 flex justify-between text-white text-xs font-semibold">
              <div className="bg-black/30 backdrop-blur px-3 py-1.5 rounded-lg">Shanghai</div>
              <div className="bg-black/30 backdrop-blur px-3 py-1.5 rounded-lg">Tbilisi</div>
            </div>

            <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur rounded-xl p-3 shadow-elegant flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Truck className="h-5 w-5 text-warning-foreground" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Current Location</div>
                <div className="font-semibold text-sm">Caspian Sea · 39.42°N, 50.18°E</div>
              </div>
            </div>

            <div className="absolute top-4 right-4 bg-card/95 backdrop-blur rounded-xl px-3 py-2 shadow-elegant">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">ETA</div>
              <div className="text-sm font-bold text-primary">2d 14h</div>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/60">
            {[
              { icon: Navigation, label: "Speed", value: "18.4 kn" },
              { icon: Lock, label: "Seal Status", value: "Intact", color: "text-success" },
              { icon: MapPin, label: "Distance", value: "1,247 km" },
            ].map((s) => (
              <div key={s.label} className="p-4 text-center">
                <s.icon className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <div className={`text-base font-bold ${s.color || "text-foreground"}`}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border/60 shadow-card p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold">Event Timeline</h3>
            <StatusBadge status="pending" label="In Transit" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">ZSB-2401-8821</p>

          <div className="relative space-y-5">
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
            {events.map((e, i) => (
              <div key={i} className="flex gap-4 relative">
                <div className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                  e.current ? "bg-warning ring-4 ring-warning/20 animate-pulse" :
                  e.done ? "bg-success" : "bg-muted border-2 border-border"
                }`}>
                  {e.done && !e.current && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                  {e.current && <Clock className="h-3 w-3 text-white" />}
                  {!e.done && <Circle className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex items-center gap-2">
                    <div className={`text-sm font-semibold ${e.done ? "text-foreground" : "text-muted-foreground"}`}>{e.title}</div>
                    {e.current && <span className="text-[10px] uppercase font-bold text-warning-foreground bg-warning/20 px-1.5 py-0.5 rounded">Now</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{e.place} · {e.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
