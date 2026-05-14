"""
FastAPI routes for the AI Auditor pipeline.

Pipeline:
User upload/URL -> extraction -> normalization -> comparison -> risk scoring.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from supabase import create_client

from app.core.config import PROJECT_ROOT, get_openai_model, load_app_env
from app.models.schemas import (
    DocumentSummary,
    GateScanRequest,
    GateScanResponse,
    HSConfirmRequest,
    HSConfirmResponse,
    HSSuggestRequest,
    HSSuggestResponse,
    TrajectoryAnalyzeRequest,
    TrajectoryAnalyzeResponse,
    TrajectoryIngestRequest,
    TrajectoryIngestResponse,
    RiskPayload,
    VerificationResponse,
)
from app.services.comparison import (
    build_comparison_rows,
    compute_risk,
    summarize_rows,
)
from app.services.declaration_pipeline import process_shipment_documents
from app.services.extraction import (
    extract_structured_from_pdf,
    merge_canonical_documents,
    merge_standardized_documents,
)
from app.services.gate_decision import evaluate_gate_scan
from app.services.hs_advisor import generate_hs_suggestion
from app.services.trajectory_guardian import analyze_trajectory, ingest_trajectory_points
from app.services.file_utils import (
    document_display_name,
    download_pdf_from_url,
    parse_declaration_json,
    parse_file_urls,
)

load_app_env()

app = FastAPI(
    title="Borderflow Verification API",
    version="0.2.0",
    description="Zero-Stop E-Border AI Auditor pipeline",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080",
    ).split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def _supabase_admin_client():
    sb_url = (os.environ.get("SUPABASE_URL") or "").strip()
    sb_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not sb_url or not sb_key:
        return None
    return create_client(sb_url, sb_key)


@app.post("/api/hs/suggest", response_model=HSSuggestResponse)
def hs_suggest(body: HSSuggestRequest) -> HSSuggestResponse:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=f"Missing OPENAI_API_KEY. Set it in {PROJECT_ROOT / '.env'}",
        )

    model = os.environ.get("HS_ADVISOR_MODEL", get_openai_model())
    client = OpenAI(api_key=api_key)
    parsed = generate_hs_suggestion(
        client=client,
        model=model,
        product_name=body.product_name,
        product_description=body.product_description,
        product_context=body.product_context,
    )

    sb = _supabase_admin_client()
    if sb and body.shipment_id:
        try:
            sb.table("ai_assistant_messages").insert(
                {
                    "shipment_id": body.shipment_id,
                    "user_id": (
                        sb.table("shipments")
                        .select("user_id")
                        .eq("id", body.shipment_id)
                        .limit(1)
                        .execute()
                        .data[0]["user_id"]
                    ),
                    "role": "assistant",
                    "content": parsed.reasoning,
                    "metadata": {
                        "type": "hs_suggest",
                        "best_hs_code": parsed.best_hs_code,
                        "confidence": parsed.confidence,
                        "candidates": parsed.hs_code_candidates,
                    },
                }
            ).execute()
        except Exception:
            # Keep suggest API resilient even if optional audit logging fails.
            pass

    return HSSuggestResponse(
        best_hs_code=parsed.best_hs_code,
        reasoning=parsed.reasoning,
        confidence=max(0.0, min(1.0, parsed.confidence)),
        hs_code_candidates=parsed.hs_code_candidates,
        legal_basis=parsed.legal_basis,
        questions_missing=parsed.questions_missing,
    )


@app.post("/api/hs/confirm", response_model=HSConfirmResponse)
def hs_confirm(body: HSConfirmRequest) -> HSConfirmResponse:
    hs_code = body.hs_code.strip()
    if not hs_code:
        raise HTTPException(status_code=400, detail="hs_code is required.")

    sb = _supabase_admin_client()
    if not sb or not body.shipment_id:
        return HSConfirmResponse(confirmed=True, hs_code=hs_code, stored=False)

    shipment_id = body.shipment_id.strip()
    if not shipment_id:
        return HSConfirmResponse(confirmed=True, hs_code=hs_code, stored=False)

    ship_res = (
        sb.table("shipments").select("id").eq("id", shipment_id).limit(1).execute()
    )
    if not ship_res.data:
        raise HTTPException(status_code=404, detail="Shipment not found.")

    sb.table("shipments").update({"hs_code": hs_code}).eq("id", shipment_id).execute()

    if body.legal_basis:
        items = sb.table("declaration_items").select("id").eq("shipment_id", shipment_id).execute()
        if items.data:
            first_id = items.data[0]["id"]
            sb.table("declaration_items").update(
                {"legal_references": body.legal_basis, "hs_code": hs_code}
            ).eq("id", first_id).execute()

    return HSConfirmResponse(confirmed=True, hs_code=hs_code, stored=True)


@app.post("/api/trajectory/ingest", response_model=TrajectoryIngestResponse)
def trajectory_ingest(body: TrajectoryIngestRequest) -> TrajectoryIngestResponse:
    out = ingest_trajectory_points(
        shipment_id=body.shipment_id.strip(),
        source=body.source.strip() or "iot_e_seal",
        points=[p.model_dump(mode="json") for p in body.points],
        run_analysis=body.run_analysis,
    )
    return TrajectoryIngestResponse(**out)


@app.post("/api/trajectory/analyze", response_model=TrajectoryAnalyzeResponse)
def trajectory_analyze(body: TrajectoryAnalyzeRequest) -> TrajectoryAnalyzeResponse:
    out = analyze_trajectory(
        shipment_id=body.shipment_id.strip(),
        lookback_points=body.lookback_points,
    )
    return TrajectoryAnalyzeResponse(**out)


@app.post("/api/gate/scan", response_model=GateScanResponse)
def gate_scan(body: GateScanRequest) -> GateScanResponse:
    out = evaluate_gate_scan(
        shipment_id=body.shipment_id.strip(),
        detected_container_id=body.detected_container_id,
        detected_license_plate=body.detected_license_plate,
        vision_status=body.vision_status,
        vision_confidence=body.vision_confidence,
        scan_details=body.scan_details,
    )
    return GateScanResponse(**out)


@app.post("/api/verify", response_model=VerificationResponse)
async def verify(
    declaration: str = Form(
        default="{}",
        description='JSON declaration: {"fields":[{"label":"HS Code","value":"84213920"}]}',
    ),
    file_urls: str = Form(
        default="[]",
        description="JSON string array of uploaded PDFs (e.g. Supabase URLs)",
    ),
    files: list[UploadFile] = File(default=[]),
) -> VerificationResponse:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=f"Missing OPENAI_API_KEY. Set it in {PROJECT_ROOT / '.env'}",
        )

    declaration_rows = parse_declaration_json(declaration)
    urls = parse_file_urls(file_urls)
    if not files and not urls:
        raise HTTPException(status_code=400, detail="Upload files or provide file_urls")

    model = get_openai_model()
    client = OpenAI(api_key=api_key)

    inputs: list[tuple[str, bytes, Literal["upload", "url"]]] = []
    for upload in files:
        if not upload.filename or not upload.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Not a PDF: {upload.filename}")
        content = await upload.read()
        if not content:
            raise HTTPException(status_code=400, detail=f"Empty file: {upload.filename}")
        inputs.append((upload.filename, content, "upload"))
    for url in urls:
        filename, content = download_pdf_from_url(url)
        inputs.append((filename, content, "url"))

    extracted_documents: list[dict[str, Any]] = []
    document_summaries: list[DocumentSummary] = []

    for filename, content, source in inputs:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            tmp.write(content)
            temp_path = Path(tmp.name)
        try:
            extracted = extract_structured_from_pdf(
                pdf_path=temp_path,
                client=client,
                model=model,
                filename_hint=Path(filename).stem,
            )
        finally:
            temp_path.unlink(missing_ok=True)

        extracted_documents.append(extracted)
        has_values = any(
            v if not isinstance(v, list) else len(v) > 0
            for v in extracted["canonical_json"].values()
        )
        document_summaries.append(
            DocumentSummary(
                id=str(uuid.uuid4()),
                name=document_display_name(extracted["inferred_document_type"], filename),
                page=f"Page 1 of {max(int(extracted['pages']), 1)}",
                status="valid" if has_values else "warning",
                document_type_hint=extracted["inferred_document_type"],
                extract_source="extract_to_json",
                source=source,
            )
        )

    normalized_merged = merge_canonical_documents(extracted_documents)
    standardized_json = merge_standardized_documents(extracted_documents)

    comparison_rows = build_comparison_rows(declaration_rows, normalized_merged)
    valid_fields, warnings, fraud_risks, overall = summarize_rows(comparison_rows)
    risk = compute_risk(comparison_rows)

    final_status: Literal["GREEN", "RED"] = "GREEN" if risk["status"] == "GREEN" else "RED"
    verification_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    return VerificationResponse(
        verification_id=verification_id,
        status=final_status,
        risk=RiskPayload(
            status=risk["status"],
            score=risk["score"],
            flags=risk["flags"],
            explanation=risk["explanation"],
        ),
        flags=risk["flags"],
        details={
            "raw_json": {
                doc["source_file"]: doc["raw_json"] for doc in extracted_documents
            },
            "standardized_json": standardized_json,
            "flow": "User Upload -> Extraction -> Normalize -> Compare -> Risk",
        },
        timestamp=now_iso,
        documents=document_summaries,
        comparison=comparison_rows,
        summary={
            "documents_scanned": len(document_summaries),
            "valid_fields": valid_fields,
            "warnings": warnings,
            "fraud_risks": fraud_risks,
        },
        normalized_merged=normalized_merged,
        standardized_json=standardized_json,
        overall_flag=overall,
    )


class ProcessShipmentDocumentsBody(BaseModel):
    shipment_id: str = Field(..., min_length=1, description="Saved shipments.id")


@app.post("/api/declaration/process-documents")
def declaration_process_documents(body: ProcessShipmentDocumentsBody) -> dict[str, Any]:
    """Load PDFs from Supabase Storage by documents.file_url; extract when needed; update mismatch_fields."""
    sid = body.shipment_id.strip()
    return process_shipment_documents(sid)
