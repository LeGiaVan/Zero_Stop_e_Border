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
