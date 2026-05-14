"""Gate decision service (PASS/HOLD) combining vision, auditor and trajectory."""

from __future__ import annotations

import os
from typing import Any

from fastapi import HTTPException
from supabase import create_client

from app.services.trajectory_guardian import analyze_trajectory


def _sb_admin():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
        )
    return create_client(url, key)


def _norm(s: str | None) -> str:
    return (s or "").strip().upper()


def _verification_ok(docs: list[dict[str, Any]]) -> tuple[bool, str]:
    if not docs:
        return False, "No verification documents attached."
    statuses = {(d.get("verification_status") or "pending").lower() for d in docs}
    if "fraud_risk" in statuses:
        return False, "Auditor flagged fraud_risk."
    if "warning" in statuses:
        return False, "Auditor reported warning mismatches."
    if statuses == {"valid"}:
        return True, "All documents verified as valid."
    return False, "Verification incomplete (pending)."


def evaluate_gate_scan(
    *,
    shipment_id: str,
    detected_container_id: str | None,
    detected_license_plate: str | None,
    vision_status: str | None,
    vision_confidence: float | None,
    scan_details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sb = _sb_admin()
    ship_res = (
        sb.table("shipments")
        .select("id, status, container_id, license_plate")
        .eq("id", shipment_id)
        .limit(1)
        .execute()
    )
    if not ship_res.data:
        raise HTTPException(status_code=404, detail="Shipment not found.")
    shipment = ship_res.data[0]

    docs = (
        sb.table("documents")
        .select("verification_status")
        .eq("shipment_id", shipment_id)
        .execute()
        .data
        or []
    )
    verification_ok, verification_reason = _verification_ok(docs)

    traj = analyze_trajectory(shipment_id=shipment_id, lookback_points=120)
    traj_anomalies = traj.get("anomalies", [])
    trajectory_ok = len(traj_anomalies) == 0

    expected_container = _norm(shipment.get("container_id"))
    expected_plate = _norm(shipment.get("license_plate"))
    observed_container = _norm(detected_container_id)
    observed_plate = _norm(detected_license_plate)

    container_ok = True
    if expected_container and expected_container != "—":
        container_ok = observed_container == expected_container

    plate_ok = True
    if expected_plate:
        plate_ok = observed_plate == expected_plate

    vision_ok = True
    if vision_status:
        vision_ok = vision_status.upper() == "FOUND"

    reasons: list[str] = []
    if not verification_ok:
        reasons.append(verification_reason)
    if not trajectory_ok:
        reasons.append("Trajectory anomalies detected and unresolved.")
    if not container_ok:
        reasons.append("Detected container number does not match declaration.")
    if not plate_ok:
        reasons.append("Detected license plate does not match declaration.")
    if not vision_ok:
        reasons.append("Vision module did not return a reliable container detection.")

    decision = "pass" if not reasons else "hold"
    if decision == "pass":
        reasons.append("All gate checks passed.")

    scan_payload = {
        "shipment_id": shipment_id,
        "scan_type": "container",
        "license_plate": observed_plate or "",
        "container_id": observed_container or "",
        "scan_result": decision,
        "scan_details": {
            "vision_status": vision_status,
            "vision_confidence": vision_confidence,
            "verification_ok": verification_ok,
            "trajectory_anomalies": len(traj_anomalies),
            "reasons": reasons,
            **(scan_details or {}),
        },
    }
    scan_insert = sb.table("border_scans").insert(scan_payload).execute()
    scan_id = str(scan_insert.data[0]["id"]) if scan_insert.data else None

    next_status = "cleared" if decision == "pass" else "held"
    sb.table("shipments").update({"status": next_status}).eq("id", shipment_id).execute()

    return {
        "ok": True,
        "shipment_id": shipment_id,
        "decision": decision,
        "reasons": reasons,
        "scan_id": scan_id,
    }

