"""Post-save pipeline: download declaration PDFs from Supabase Storage, extract, compare vs shipment."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import HTTPException
from openai import OpenAI
from supabase import create_client

from app.core.config import get_openai_model, load_app_env
from app.models.schemas import ComparisonRow
from app.services.comparison import build_comparison_rows, summarize_rows
from app.services.extraction import extract_structured_from_pdf, merge_canonical_documents
from app.services.file_utils import download_pdf_from_url

load_app_env()


def _declaration_pipeline_env_missing() -> list[str]:
    missing: list[str] = []
    if not (os.environ.get("OPENAI_API_KEY") or "").strip():
        missing.append("OPENAI_API_KEY")
    if not (os.environ.get("SUPABASE_URL") or "").strip():
        missing.append("SUPABASE_URL")
    if not (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip():
        missing.append("SUPABASE_SERVICE_ROLE_KEY")
    return missing


def _parse_storage_object_url(url: str) -> tuple[str, str] | None:
    for marker in (
        "/storage/v1/object/public/",
        "/storage/v1/object/authenticated/",
    ):
        if marker not in url:
            continue
        rest = url.split(marker, 1)[1]
        slash = rest.find("/")
        if slash <= 0:
            return None
        bucket = rest[:slash]
        path = unquote(rest[slash + 1 :])
        return bucket, path
    return None


def download_declaration_pdf(url: str) -> tuple[str, bytes]:
    """Prefer Supabase Storage download with service role for private buckets; else HTTP GET."""
    supabase_url = (os.environ.get("SUPABASE_URL") or "").strip().rstrip("/")
    service_key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    parsed = _parse_storage_object_url(url)

    if parsed and service_key and supabase_url:
        bucket, obj_path = parsed
        sb = create_client(supabase_url, service_key)
        try:
            data = sb.storage.from_(bucket).download(obj_path)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=502,
                detail=f"Storage download failed ({bucket}/{obj_path}): {exc}",
            ) from exc
        name = Path(obj_path).name or "document.pdf"
        return name, bytes(data)

    filename, content = download_pdf_from_url(url)
    return filename, content


def _sb_admin():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for declaration processing.",
        )
    return create_client(url, key)


def extracted_data_needs_processing(ed: Any) -> bool:
    """Treat SQL NULL, {}, or stubs without canonical_json as needing extraction."""
    if ed is None:
        return True
    if not isinstance(ed, dict):
        return True
    if len(ed) == 0:
        return True
    cj = ed.get("canonical_json")
    if not isinstance(cj, dict):
        return True
    return len(cj) == 0


def normalize_stored_extracted(ed: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_file": ed.get("source_file") or "stored.pdf",
        "inferred_document_type": ed.get("inferred_document_type") or "generic_trade_document",
        "pages": ed.get("pages", 1),
        "canonical_json": ed.get("canonical_json") or {},
        "raw_json": ed.get("raw_json"),
        "standardized_json": ed.get("standardized_json"),
        "model": ed.get("model"),
    }


def shipment_declaration_fields(
    shipment: dict[str, Any], items: list[dict[str, Any]]
) -> list[dict[str, str | None]]:
    """Build comparable declaration-side fields without duplicate shipment/line noise."""

    fields: list[dict[str, str | None]] = []

    def add(label: str, val: Any) -> None:
        if val is None:
            return
        s = str(val).strip()
        if not s:
            return
        fields.append({"label": label, "value": s})

    add("Goods Description", shipment.get("product_description"))

    ship_origin = (shipment.get("origin_country") or "").strip()
    items_list = list(items)

    if not items_list:
        if ship_origin:
            add("Country of Origin", ship_origin)
        add("HS Code", shipment.get("hs_code"))
        return fields

    if len(items_list) == 1:
        row = items_list[0]
        line_origin = (row.get("country_of_origin") or "").strip()
        origin_display = ship_origin or line_origin
        if origin_display:
            add("Country of Origin", origin_display)
        add("HS Code", row.get("hs_code"))
        add("Quantity", row.get("quantity"))
        add("Unit value", row.get("unit_value"))
        tv = row.get("total_value")
        if tv is not None:
            add("Line total", tv)
        return fields

    non_empty_co = [(row.get("country_of_origin") or "").strip() for row in items_list]
    distinct_line_origins = {o for o in non_empty_co if o}

    origin_singleton: str | None = None
    if ship_origin:
        origin_singleton = ship_origin
    elif len(distinct_line_origins) == 1:
        origin_singleton = next(iter(distinct_line_origins))

    if origin_singleton:
        add("Country of Origin", origin_singleton)

    for row in items_list:
        add("HS Code", row.get("hs_code"))
        add("Quantity", row.get("quantity"))
        add("Unit value", row.get("unit_value"))
        co = (row.get("country_of_origin") or "").strip()
        if origin_singleton:
            if co and co.casefold() != origin_singleton.casefold():
                add("Country of Origin", co)
        elif co:
            add("Country of Origin", co)

    return fields


def verification_status_from_rows(rows: list[ComparisonRow]) -> str:
    if not rows:
        return "pending"
    _, _, fraud, _ = summarize_rows(rows)
    has_warn = any(r.match == "warning" for r in rows)
    has_fraud = any(r.match == "fraud" for r in rows) or fraud > 0
    if has_fraud:
        return "fraud_risk"
    if has_warn:
        return "warning"
    return "valid"


def process_shipment_documents(shipment_id: str) -> dict[str, Any]:
    missing_env = _declaration_pipeline_env_missing()
    if missing_env:
        raise HTTPException(
            status_code=503,
            detail=(
                "Missing environment variables: "
                + ", ".join(missing_env)
                + ". Set them in ai_service/.env. "
                "Use SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from Supabase Project Settings → API."
            ),
        )

    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()

    sb = _sb_admin()
    ship_res = sb.table("shipments").select("*").eq("id", shipment_id).limit(1).execute()
    ship_rows = ship_res.data or []
    if not ship_rows:
        raise HTTPException(status_code=404, detail="Shipment not found.")
    shipment = ship_rows[0]

    items_res = (
        sb.table("declaration_items").select("*").eq("shipment_id", shipment_id).execute()
    )
    items = list(items_res.data or [])

    docs_res = (
        sb.table("documents").select("*").eq("shipment_id", shipment_id).execute()
    )
    docs = list(docs_res.data or [])
    if not docs:
        return {"ok": True, "message": "No documents for this shipment.", "updated": 0}

    client = OpenAI(api_key=api_key)
    model = get_openai_model()

    extracted_documents: list[dict[str, Any]] = []
    fresh_extractions: dict[str, dict[str, Any]] = {}

    for doc in docs:
        file_url = doc.get("file_url")
        if not file_url or not isinstance(file_url, str):
            continue

        ed = doc.get("extracted_data")
        doc_id = doc["id"]

        if extracted_data_needs_processing(ed):
            fname, content = download_declaration_pdf(file_url)
            if not fname.lower().endswith(".pdf"):
                raise HTTPException(status_code=400, detail=f"Not a PDF: {fname}")

            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(content)
                temp_path = Path(tmp.name)

            try:
                extracted = extract_structured_from_pdf(
                    pdf_path=temp_path,
                    client=client,
                    model=model,
                    filename_hint=Path(fname).stem,
                )
            finally:
                temp_path.unlink(missing_ok=True)

            extracted_documents.append(extracted)
            fresh_extractions[str(doc_id)] = extracted
        else:
            extracted_documents.append(normalize_stored_extracted(ed))

    if not extracted_documents:
        return {"ok": True, "message": "No downloadable PDF rows.", "updated": 0}

    normalized_merged = merge_canonical_documents(extracted_documents)
    declaration_fields = shipment_declaration_fields(shipment, items)
    comparison_rows = build_comparison_rows(declaration_fields, normalized_merged)
    mismatch_payload = [r.model_dump(mode="json") for r in comparison_rows]
    vstatus = verification_status_from_rows(comparison_rows)

    updated = 0
    for doc in docs:
        doc_id = str(doc["id"])
        patch: dict[str, Any] = {
            "mismatch_fields": mismatch_payload,
            "verification_status": vstatus,
        }
        if doc_id in fresh_extractions:
            patch["extracted_data"] = fresh_extractions[doc_id]

        sb.table("documents").update(patch).eq("id", doc_id).execute()
        updated += 1

    return {
        "ok": True,
        "shipment_id": shipment_id,
        "documents_updated": updated,
        "fresh_extractions": len(fresh_extractions),
        "verification_status": vstatus,
        "comparison_rows": len(comparison_rows),
    }
