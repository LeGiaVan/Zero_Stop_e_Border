"""Trajectory ingest + anomaly detection for e-seal blackbox data."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from math import asin, cos, radians, sin, sqrt
from typing import Any

import numpy as np
from fastapi import HTTPException
from sklearn.ensemble import IsolationForest
from supabase import create_client


@dataclass
class PointRow:
    ts: datetime
    lat: float
    lng: float
    lock_status: str


@dataclass
class AnomalyRow:
    type: str
    score: float
    severity: str
    message: str
    ts: str


def _sb_admin():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
        )
    return create_client(url, key)


def _parse_iso(ts: str) -> datetime:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp: {ts}") from exc


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    return 2 * r * asin(sqrt(a))


def _parse_stop_zones() -> list[dict[str, Any]]:
    raw = (os.environ.get("TRAJECTORY_ALLOWED_STOPS") or "").strip()
    if not raw:
        return []
    try:
        arr = json.loads(raw)
    except Exception:
        return []
    if not isinstance(arr, list):
        return []
    out = []
    for row in arr:
        if not isinstance(row, dict):
            continue
        try:
            out.append(
                {
                    "name": str(row.get("name") or "allowed_stop"),
                    "lat": float(row["lat"]),
                    "lng": float(row["lng"]),
                    "radius_km": float(row.get("radius_km", 0.8)),
                }
            )
        except Exception:
            continue
    return out


def _inside_stop_zone(lat: float, lng: float, zones: list[dict[str, Any]]) -> bool:
    for z in zones:
        dist = _haversine_km(lat, lng, z["lat"], z["lng"])
        if dist <= z["radius_km"]:
            return True
    return False


def _rows_to_features(points: list[PointRow]) -> np.ndarray:
    feats: list[list[float]] = []
    if len(points) < 2:
        return np.array(feats)
    for idx in range(1, len(points)):
        prev = points[idx - 1]
        cur = points[idx]
        dist_km = _haversine_km(prev.lat, prev.lng, cur.lat, cur.lng)
        delta_h = max((cur.ts - prev.ts).total_seconds() / 3600.0, 1e-6)
        speed_kmh = dist_km / delta_h
        gap_min = (cur.ts - prev.ts).total_seconds() / 60.0
        lock = 1.0 if cur.lock_status.lower() in ("locked", "intact", "closed") else 0.0
        feats.append([speed_kmh, dist_km, gap_min, lock])
    return np.array(feats, dtype=float)


def _isolation_forest_anomalies(points: list[PointRow]) -> set[int]:
    if len(points) < 8:
        return set()
    x = _rows_to_features(points)
    if x.shape[0] < 6:
        return set()
    model = IsolationForest(contamination=0.15, random_state=42)
    preds = model.fit_predict(x)
    return {idx + 1 for idx, p in enumerate(preds) if p == -1}


def _build_anomalies(points: list[PointRow]) -> list[AnomalyRow]:
    if len(points) < 2:
        return []

    zones = _parse_stop_zones()
    iso_idx = _isolation_forest_anomalies(points)
    anomalies: list[AnomalyRow] = []

    max_gap_min = float(os.environ.get("TRAJECTORY_MAX_SIGNAL_GAP_MIN", "45"))
    max_jump_km = float(os.environ.get("TRAJECTORY_MAX_JUMP_KM", "25"))

    for idx in range(1, len(points)):
        prev = points[idx - 1]
        cur = points[idx]
        gap_min = (cur.ts - prev.ts).total_seconds() / 60.0
        dist_km = _haversine_km(prev.lat, prev.lng, cur.lat, cur.lng)

        if gap_min > max_gap_min:
            anomalies.append(
                AnomalyRow(
                    type="signal_loss",
                    score=min(1.0, gap_min / (max_gap_min * 2)),
                    severity="medium",
                    message=f"Signal gap {gap_min:.1f} minutes exceeds threshold.",
                    ts=cur.ts.isoformat(),
                )
            )

        if dist_km > max_jump_km:
            anomalies.append(
                AnomalyRow(
                    type="route_deviation",
                    score=min(1.0, dist_km / (max_jump_km * 2)),
                    severity="high",
                    message=f"Unusual route jump {dist_km:.2f} km detected.",
                    ts=cur.ts.isoformat(),
                )
            )

        if cur.lock_status.lower() in ("unlocked", "open", "broken"):
            anomalies.append(
                AnomalyRow(
                    type="unauthorized_unlock",
                    score=0.95,
                    severity="critical",
                    message="E-seal lock state indicates unauthorized unlock.",
                    ts=cur.ts.isoformat(),
                )
            )

        if idx in iso_idx:
            if not _inside_stop_zone(cur.lat, cur.lng, zones):
                anomalies.append(
                    AnomalyRow(
                        type="unexplained_pattern",
                        score=0.7,
                        severity="medium",
                        message="Trajectory point flagged by IsolationForest outside allowed stop zones.",
                        ts=cur.ts.isoformat(),
                    )
                )

    seen: set[tuple[str, str]] = set()
    deduped: list[AnomalyRow] = []
    for a in anomalies:
        k = (a.type, a.ts)
        if k in seen:
            continue
        seen.add(k)
        deduped.append(a)
    return deduped


def _persist_anomalies(sb, shipment_id: str, anomalies: list[AnomalyRow]) -> None:
    if not anomalies:
        return
    rows = []
    for a in anomalies:
        rows.append(
            {
                "shipment_id": shipment_id,
                "event_type": "anomaly_detected",
                "event_title": a.type,
                "event_description": a.message,
                "location": "trajectory_stream",
                "lat": 0,
                "lng": 0,
                "event_time": a.ts,
            }
        )
    sb.table("tracking_events").insert(rows).execute()


def ingest_trajectory_points(
    *,
    shipment_id: str,
    source: str,
    points: list[dict[str, Any]],
    run_analysis: bool,
) -> dict[str, Any]:
    if not points:
        raise HTTPException(status_code=400, detail="points is required.")
    sb = _sb_admin()

    ship = sb.table("shipments").select("id").eq("id", shipment_id).limit(1).execute()
    if not ship.data:
        raise HTTPException(status_code=404, detail="Shipment not found.")

    insert_rows = []
    for p in points:
        ts = _parse_iso(str(p.get("timestamp") or ""))
        insert_rows.append(
            {
                "shipment_id": shipment_id,
                "point_time": ts.isoformat(),
                "lat": float(p["lat"]),
                "lng": float(p["lng"]),
                "lock_status": str(p.get("lock_status") or "locked"),
                "source": source,
            }
        )
    sb.table("trajectory_points").insert(insert_rows).execute()

    anomalies: list[AnomalyRow] = []
    if run_analysis:
        analyzed = analyze_trajectory(shipment_id=shipment_id, lookback_points=120)
        anomalies = [
            AnomalyRow(
                type=a["type"],
                score=float(a["score"]),
                severity=str(a["severity"]),
                message=str(a["message"]),
                ts=str(a["ts"]),
            )
            for a in analyzed["anomalies"]
        ]
    return {
        "ok": True,
        "shipment_id": shipment_id,
        "inserted_points": len(insert_rows),
        "anomalies": [a.__dict__ for a in anomalies],
    }


def analyze_trajectory(*, shipment_id: str, lookback_points: int = 120) -> dict[str, Any]:
    sb = _sb_admin()
    rows = (
        sb.table("trajectory_points")
        .select("point_time, lat, lng, lock_status")
        .eq("shipment_id", shipment_id)
        .order("point_time", desc=False)
        .limit(max(1, lookback_points))
        .execute()
        .data
        or []
    )

    points: list[PointRow] = []
    for r in rows:
        points.append(
            PointRow(
                ts=_parse_iso(str(r["point_time"])),
                lat=float(r["lat"]),
                lng=float(r["lng"]),
                lock_status=str(r.get("lock_status") or "locked"),
            )
        )

    anomalies = _build_anomalies(points)
    _persist_anomalies(sb, shipment_id, anomalies)

    if any(a.type == "unauthorized_unlock" for a in anomalies):
        sb.table("shipments").update({"seal_status": "broken"}).eq("id", shipment_id).execute()

    return {
        "ok": True,
        "shipment_id": shipment_id,
        "analyzed_points": len(points),
        "anomalies": [a.__dict__ for a in anomalies],
    }

