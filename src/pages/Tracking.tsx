import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AlertTriangle, Lock, MapPin, Navigation, RefreshCw } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabaseClient";
import { requestTrajectoryAnalyze } from "@/lib/declarationAiPipeline";
import { toast } from "sonner";

type ShipmentRow = {
  id: string;
  shipment_number: string;
  status: string | null;
  seal_status: string | null;
  current_lat: number | null;
  current_lng: number | null;
  created_at: string | null;
};

type TrackingEventRow = {
  id: string;
  event_type: string;
  event_title: string;
  event_description: string | null;
  location: string | null;
  event_time: string | null;
};

type TrajectoryPointRow = {
  point_time: string;
  lat: number;
  lng: number;
  lock_status: string;
};

type TrackingSnapshot = {
  shipment: ShipmentRow | null;
  events: TrackingEventRow[];
  points: TrajectoryPointRow[];
};

type RoutePoint = {
  x: number;
  y: number;
  lock_status: string;
  point_time: string;
};

async function fetchShipments(): Promise<ShipmentRow[]> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("shipments")
    .select("id, shipment_number, status, seal_status, current_lat, current_lng, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ShipmentRow[];
}

async function fetchTrackingSnapshot(shipmentId: string): Promise<TrackingSnapshot> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Workspace is not configured.");
  if (!shipmentId) return { shipment: null, events: [], points: [] };

  const shipRes = await sb
    .from("shipments")
    .select("id, shipment_number, status, seal_status, current_lat, current_lng, created_at")
    .eq("id", shipmentId)
    .limit(1)
    .maybeSingle<ShipmentRow>();
  if (shipRes.error) throw shipRes.error;
  if (!shipRes.data) return { shipment: null, events: [], points: [] };
  const shipment = shipRes.data;

  const [eventsRes, pointsRes] = await Promise.all([
    sb
      .from("tracking_events")
      .select("id, event_type, event_title, event_description, location, event_time")
      .eq("shipment_id", shipment.id)
      .order("event_time", { ascending: false })
      .limit(20),
    sb
      .from("trajectory_points")
      .select("point_time, lat, lng, lock_status")
      .eq("shipment_id", shipment.id)
      .order("point_time", { ascending: false })
      .limit(2000),
  ]);
  if (eventsRes.error) throw eventsRes.error;
  if (pointsRes.error) throw pointsRes.error;

  const points: TrajectoryPointRow[] = ((pointsRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
    point_time: String(p.point_time ?? ""),
    lat: Number(p.lat ?? 0),
    lng: Number(p.lng ?? 0),
    lock_status: String(p.lock_status ?? "locked"),
  }));

  return {
    shipment,
    events: (eventsRes.data ?? []) as TrackingEventRow[],
    points,
  };
}

function trackingStatus(status: string | null): "pending" | "cleared" | "hold" {
  const s = (status ?? "").toLowerCase();
  if (s === "cleared" || s === "delivered") return "cleared";
  if (s === "held") return "hold";
  return "pending";
}

function toRoutePoints(rawPoints: TrajectoryPointRow[], width = 900, height = 340): RoutePoint[] {
  if (rawPoints.length < 2) return [];
  const ascending = [...rawPoints].sort(
    (a, b) => new Date(a.point_time).getTime() - new Date(b.point_time).getTime()
  );
  const maxPoints = 450;
  const step = Math.max(1, Math.floor(ascending.length / maxPoints));
  const sampled = ascending.filter((_, idx) => idx % step === 0);

  const lats = sampled.map((p) => p.lat);
  const lngs = sampled.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const pad = 20;
  const usableW = width - pad * 2;
  const usableH = height - pad * 2;
  const latRange = Math.max(maxLat - minLat, 1e-9);
  const lngRange = Math.max(maxLng - minLng, 1e-9);

  return sampled.map((p) => {
    const x = pad + ((p.lng - minLng) / lngRange) * usableW;
    // SVG y-axis inverted
    const y = pad + (1 - (p.lat - minLat) / latRange) * usableH;
    return { x, y, lock_status: p.lock_status, point_time: p.point_time };
  });
}

export default function Tracking() {
  const workspaceReady = isSupabaseConfigured();
  const queryClient = useQueryClient();
  const [selectedShipmentId, setSelectedShipmentId] = useState("");

  const {
    data: shipments = [],
    isLoading: isLoadingShipments,
    isError: isErrorShipments,
    error: shipmentsError,
  } = useQuery({
    queryKey: ["tracking", "shipments"],
    queryFn: fetchShipments,
    enabled: workspaceReady,
  });

  useEffect(() => {
    if (!selectedShipmentId && shipments.length > 0) {
      setSelectedShipmentId(shipments[0].id);
    }
  }, [selectedShipmentId, shipments]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tracking", "snapshot", selectedShipmentId],
    queryFn: () => fetchTrackingSnapshot(selectedShipmentId),
    enabled: workspaceReady && !!selectedShipmentId,
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedShipmentId) throw new Error("Select shipment first.");
      return requestTrajectoryAnalyze({
        shipment_id: selectedShipmentId,
        lookback_points: 50000,
      });
    },
    onSuccess: (resp) => {
      toast.success(
        `Trajectory analyzed (${resp.analyzed_points} points, ${resp.anomalies.length} anomalies).`
      );
      void queryClient.invalidateQueries({
        queryKey: ["tracking", "snapshot", selectedShipmentId],
      });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Failed to analyze trajectory.");
    },
  });

  const anomalyCount = useMemo(
    () => (data?.events ?? []).filter((e) => e.event_type === "anomaly_detected").length,
    [data?.events]
  );

  const routePoints = useMemo(() => toRoutePoints(data?.points ?? []), [data?.points]);
  const routePath = useMemo(() => {
    if (routePoints.length < 2) return "";
    return routePoints
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" ");
  }, [routePoints]);

  const latestPoint = data?.points?.[0];
  const locLabel =
    latestPoint != null
      ? `${latestPoint.lat.toFixed(5)}, ${latestPoint.lng.toFixed(5)}`
      : data?.shipment?.current_lat != null && data?.shipment?.current_lng != null
      ? `${Number(data.shipment.current_lat).toFixed(5)}, ${Number(data.shipment.current_lng).toFixed(5)}`
      : "No location yet";

  return (
    <>
      <PageHeader
        eyebrow="Live Operations"
        title="Shipment Tracking"
        description="Trajectory Guardian feed: timeline, e-seal state, and anomaly events."
      />

      {!workspaceReady ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Tracking requires Supabase workspace configuration.
        </div>
      ) : isLoadingShipments ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading shipments...
        </div>
      ) : isErrorShipments ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load shipment list:{" "}
          {shipmentsError instanceof Error ? shipmentsError.message : "Unknown error"}
        </div>
      ) : shipments.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          No shipments found.
        </div>
      ) : isLoading ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading latest trajectory snapshot...
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Unable to load tracking data: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      ) : !data?.shipment ? (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          No shipments found.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-card rounded-2xl border border-border/60 shadow-card p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground min-w-[120px]">
                Select shipment
              </div>
              <select
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                value={selectedShipmentId}
                onChange={(e) => setSelectedShipmentId(e.target.value)}
              >
                {shipments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shipment_number}
                  </option>
                ))}
              </select>
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={!selectedShipmentId || analyzeMutation.isPending}
                className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-border text-sm hover:bg-muted/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
                {analyzeMutation.isPending ? "Analyzing..." : "Analyze trajectory"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-2xl border border-border/60 shadow-card p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Active shipment</p>
                <h3 className="text-xl font-semibold">{data.shipment.shipment_number}</h3>
              </div>
              <StatusBadge status={trackingStatus(data.shipment.status)} />
            </div>
            <div className="rounded-xl border border-border/60 bg-gradient-to-br from-slate-900 to-slate-800 overflow-hidden">
              <div className="h-[340px] p-2">
                {routePoints.length < 2 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-300">
                    Need at least 2 trajectory points to draw route.
                  </div>
                ) : (
                  <svg viewBox="0 0 900 340" className="w-full h-full">
                    <defs>
                      <pattern id="grid-track" width="35" height="35" patternUnits="userSpaceOnUse">
                        <path d="M 35 0 L 0 0 0 35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.7" />
                      </pattern>
                    </defs>
                    <rect x="0" y="0" width="900" height="340" fill="url(#grid-track)" />
                    <path d={routePath} fill="none" stroke="#22d3ee" strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx={routePoints[0].x} cy={routePoints[0].y} r="5" fill="#22c55e" />
                    <circle
                      cx={routePoints[routePoints.length - 1].x}
                      cy={routePoints[routePoints.length - 1].y}
                      r="5"
                      fill="#f59e0b"
                    />
                    {routePoints
                      .filter((p) => ["unlocked", "open", "broken"].includes((p.lock_status || "").toLowerCase()))
                      .slice(-40)
                      .map((p, idx) => (
                        <circle key={`${p.point_time}-${idx}`} cx={p.x} cy={p.y} r="3.2" fill="#ef4444" />
                      ))}
                  </svg>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border/60 p-4">
                <MapPin className="h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-xs uppercase text-muted-foreground">Latest GPS</div>
                <div className="text-sm font-semibold">{locLabel}</div>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <Lock className="h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-xs uppercase text-muted-foreground">Seal status</div>
                <div className="text-sm font-semibold">{data.shipment.seal_status ?? "unknown"}</div>
              </div>
              <div className="rounded-xl border border-border/60 p-4">
                <Navigation className="h-4 w-4 text-muted-foreground mb-1" />
                <div className="text-xs uppercase text-muted-foreground">Points buffered</div>
                <div className="text-sm font-semibold">{data.points.length}</div>
              </div>
            </div>
            {anomalyCount > 0 && (
              <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-warning-foreground" />
                <span>{anomalyCount} anomaly event(s) detected in the latest trajectory window.</span>
              </div>
            )}
          </div>

          <div className="bg-card rounded-2xl border border-border/60 shadow-card p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold">Event Timeline</h3>
              <span className="text-xs text-muted-foreground">{data.events.length} events</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{data.shipment.shipment_number}</p>
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {data.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tracking events yet.</p>
              ) : (
                data.events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-border/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold">{event.event_title}</div>
                      <span className="text-[11px] text-muted-foreground">{event.event_type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {event.location || "Unknown location"} ·{" "}
                      {event.event_time ? new Date(event.event_time).toLocaleString() : "n/a"}
                    </p>
                    {event.event_description ? (
                      <p className="text-sm mt-2 text-muted-foreground">{event.event_description}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </div>
      )}
    </>
  );
}
