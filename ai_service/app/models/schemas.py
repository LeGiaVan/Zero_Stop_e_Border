"""API and pipeline response models."""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

MatchLevel = Literal["valid", "warning", "fraud"]


class OverallFlag(str, Enum):
    MATCH = "match"
    MINOR_VARIANCE = "minor_variance"
    CRITICAL_MISMATCH = "critical_mismatch"


class RiskStatus(str, Enum):
    GREEN = "GREEN"
    YELLOW = "YELLOW"
    RED = "RED"


class ComparisonRow(BaseModel):
    label: str
    declared: str | None = None
    extracted: str | None = None
    match: MatchLevel


class DeclarationField(BaseModel):
    label: str
    value: str | None = None


class DocumentSummary(BaseModel):
    id: str
    name: str
    page: str
    status: Literal["valid", "warning"]
    document_type_hint: str
    extract_source: str
    source: Literal["upload", "url"]


class RiskPayload(BaseModel):
    status: Literal["GREEN", "YELLOW", "RED"]
    score: int
    flags: list[str]
    explanation: str


class VerificationResponse(BaseModel):
    verification_id: str
    status: Literal["GREEN", "RED"] = Field(
        description="Final gate status returned to frontend"
    )
    risk: RiskPayload
    flags: list[str]
    details: dict[str, Any]
    timestamp: str
    documents: list[DocumentSummary]
    comparison: list[ComparisonRow]
    summary: dict[str, int]
    normalized_merged: dict[str, Any]
    standardized_json: dict[str, Any]
    overall_flag: OverallFlag


class HSSuggestRequest(BaseModel):
    session_id: str | None = None
    shipment_id: str | None = None
    product_name: str
    product_description: str
    product_context: str | None = None


class HSSuggestResponse(BaseModel):
    best_hs_code: str | None = None
    reasoning: str
    confidence: float
    hs_code_candidates: list[str]
    legal_basis: list[str]
    questions_missing: list[str]


class HSConfirmRequest(BaseModel):
    shipment_id: str | None = None
    hs_code: str
    legal_basis: list[str] = []
    note: str | None = None


class HSConfirmResponse(BaseModel):
    confirmed: bool
    hs_code: str
    stored: bool


class TrajectoryPointIn(BaseModel):
    timestamp: str
    lat: float
    lng: float
    lock_status: str = "locked"


class TrajectoryIngestRequest(BaseModel):
    shipment_id: str
    source: str = "iot_e_seal"
    points: list[TrajectoryPointIn]
    run_analysis: bool = True


class TrajectoryAnomaly(BaseModel):
    type: str
    score: float
    severity: str
    message: str
    ts: str


class TrajectoryIngestResponse(BaseModel):
    ok: bool
    shipment_id: str
    inserted_points: int
    anomalies: list[TrajectoryAnomaly] = []


class TrajectoryAnalyzeRequest(BaseModel):
    shipment_id: str
    lookback_points: int = 120


class TrajectoryAnalyzeResponse(BaseModel):
    ok: bool
    shipment_id: str
    analyzed_points: int
    anomalies: list[TrajectoryAnomaly]


class GateScanRequest(BaseModel):
    shipment_id: str
    detected_container_id: str | None = None
    detected_license_plate: str | None = None
    vision_status: str | None = None
    vision_confidence: float | None = None
    scan_details: dict[str, Any] = {}


class GateScanResponse(BaseModel):
    ok: bool
    shipment_id: str
    decision: Literal["pass", "hold"]
    reasons: list[str]
    scan_id: str | None = None
