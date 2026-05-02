"""
FastAPI backend: verification pipeline for Borderflow.

Pipeline
--------
1. User uploads PDF(s)
2. Extract text via Google Cloud Document AI (OCR / processor)
3. Normalize to a canonical JSON record (heuristics on OCR text)
4. Rule-based compare vs. client-supplied declaration
5. Flag each field + overall: Match | Minor variance | Critical mismatch

Response rows use ``match``: ``valid`` | ``warning`` | ``fraud`` to align with
``src/pages/Verification.tsx``.

Environment (repo root ``.env`` or process env)
----------------------------------------------
- GCP_PROJECT_ID
- DOCUMENT_AI_LOCATION       e.g. ``us`` or ``eu``
- DOCUMENT_AI_PROCESSOR_ID   Document OCR or Form Parser processor ID
- GOOGLE_APPLICATION_CREDENTIALS  path to service account JSON (recommended)

Fallback when GCP is not configured::

    VERIFY_USE_PDFPLUMBER_FALLBACK=true

Uses pdfplumber for text only (same idea as ``extract_to_json.pdf_to_text``),
still runs normalize → compare → flag.

Run::

    cd ai-service
    uvicorn verification_api:app --reload --port 8000

Optional::

    OPENAI_API_KEY + VERIFY_USE_OPENAI_NORMALIZE=true
    refines normalized fields using the same Pydantic schemas as extract_to_json
    (extra dependency on OpenAI; Document AI remains the primary extract step).
"""

from __future__ import annotations

import io
import json
import os
import re
import uuid
from difflib import SequenceMatcher
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parent.parent

load_dotenv(REPO_ROOT / ".env")

# -----------------------------------------------------------------------------
# Document type hint (filename) — mirrors extract_to_json.infer_document_type
# -----------------------------------------------------------------------------


def infer_document_type(stem: str) -> str:
    s = stem.lower()
    if "invoice" in s or "commercial" in s:
        return "commercial_invoice"
    if "pack" in s:
        return "packing_list"
    if "land" in s or "bl" in s or "bill" in s:
        return "bill_of_lading"
    return "generic_trade_document"


DOC_PRIORITY: dict[str, int] = {
    "commercial_invoice": 0,
    "packing_list": 1,
    "bill_of_lading": 2,
    "generic_trade_document": 3,
}


class OverallFlag(str, Enum):
    MATCH = "match"
    MINOR_VARIANCE = "minor_variance"
    CRITICAL_MISMATCH = "critical_mismatch"


# -----------------------------------------------------------------------------
# Document AI
# -----------------------------------------------------------------------------


def _document_ai_settings() -> tuple[str | None, str | None, str | None]:
    project = os.environ.get("GCP_PROJECT_ID") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = os.environ.get("DOCUMENT_AI_LOCATION", "us")
    processor = os.environ.get("DOCUMENT_AI_PROCESSOR_ID")
    return project, location, processor


def process_pdf_document_ai(pdf_bytes: bytes) -> tuple[str, float | None, int]:
    from google.cloud import documentai_v1 as documentai

    project, location, processor_id = _document_ai_settings()
    if not project or not processor_id:
        raise RuntimeError(
            "Document AI: set GCP_PROJECT_ID (or GOOGLE_CLOUD_PROJECT) and DOCUMENT_AI_PROCESSOR_ID"
        )

    endpoint = f"{location}-documentai.googleapis.com"
    client = documentai.DocumentProcessorServiceClient(
        client_options={"api_endpoint": endpoint}
    )
    name = client.processor_path(project, location, processor_id)
    raw = documentai.RawDocument(content=pdf_bytes, mime_type="application/pdf")
    request = documentai.ProcessRequest(name=name, raw_document=raw)
    result = client.process_document(request=request)
    doc = result.document
    text = doc.text or ""

    confidences: list[float] = []
    for page in doc.pages:
        for block in page.blocks:
            if block.layout and block.layout.confidence:
                confidences.append(float(block.layout.confidence))
    avg_conf = sum(confidences) / len(confidences) if confidences else None
    pages = len(doc.pages) if doc.pages else (1 if text else 0)
    return text, avg_conf, pages


def process_pdf_pdfplumber(pdf_bytes: bytes) -> tuple[str, float | None, int]:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        n = len(pdf.pages)
        for i, page in enumerate(pdf.pages, start=1):
            t = page.extract_text() or ""
            parts.append(f"--- Page {i}/{n} ---\n{t}")
    return "\n\n".join(parts), None, len(pdf.pages) if pdf.pages else 0


def extract_pdf_bytes(pdf_bytes: bytes) -> tuple[str, float | None, int, str]:
    """Returns text, optional OCR confidence, page_count, extract_source."""
    use_fallback = os.environ.get("VERIFY_USE_PDFPLUMBER_FALLBACK", "").lower() in (
        "1",
        "true",
        "yes",
    )
    project, _, processor_id = _document_ai_settings()
    if use_fallback or not project or not processor_id:
        text, conf, pages = process_pdf_pdfplumber(pdf_bytes)
        return text, conf, pages, "pdfplumber"
    text, conf, pages = process_pdf_document_ai(pdf_bytes)
    return text, conf, pages, "document_ai"


# -----------------------------------------------------------------------------
# Normalize OCR → canonical dict (rule-based heuristics)
# -----------------------------------------------------------------------------

HS_RE = re.compile(
    r"\b(?:HS\s*(?:CODE)?|H\.S\.(?:\s*CODE)?)\s*[.:]?\s*([\d.\s]{6,16})\b",
    re.I,
)
HS_FALLBACK_RE = re.compile(r"\b(\d{8,10})\b")
CONTAINER_RE = re.compile(r"\b([A-Z]{4}\d{7})\b")
MONEY_RE = re.compile(
    r"(?:USD|US\$|\$|EUR|€|VND)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:USD|US\$|EUR|VND)",
    re.I,
)


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _line_after_keyword(text: str, pattern: re.Pattern[str]) -> str | None:
    for raw in text.splitlines():
        line = raw.strip()
        if pattern.search(line):
            parts = re.split(r"\s*[:\u003a]\s*", line, maxsplit=1)
            if len(parts) > 1 and parts[1].strip():
                return parts[1].strip()[:500]
            # next non-empty line
            continue
    lines = text.splitlines()
    for i, raw in enumerate(lines):
        if pattern.search(raw.strip()):
            for j in range(i + 1, min(i + 4, len(lines))):
                nxt = lines[j].strip()
                if nxt and not pattern.search(nxt):
                    return nxt[:500]
    return None


def heuristic_normalize(text: str) -> dict[str, Any]:
    """Map OCR plain text to canonical keys used for declaration compare."""
    out: dict[str, Any] = {
        "shipper_exporter": None,
        "consignee_buyer": None,
        "hs_code": None,
        "quantity": None,
        "total_amount": None,
        "country_of_origin": None,
        "net_weight": None,
        "gross_weight": None,
        "container_numbers": [],
        "bl_number": None,
        "invoice_number": None,
    }

    shipper_pat = re.compile(
        r"(?i)^(shipper|exporter|seller|from)\b"
    )
    consignee_pat = re.compile(r"(?i)^(consignee|buyer|to\s*order|importer)\b")
    origin_pat = re.compile(r"(?i)(country\s*of\s*origin|origin)\b")
    bl_pat = re.compile(r"(?i)\bB\s*/\s*L\s*(?:No\.?|Number)?\b")
    inv_pat = re.compile(r"(?i)\b(invoice\s*(?:no\.?|number|#)|commercial\s*invoice)\b")

    out["shipper_exporter"] = _line_after_keyword(text, shipper_pat)
    out["consignee_buyer"] = _line_after_keyword(text, consignee_pat)

    m = HS_RE.search(text)
    if not m:
        m = HS_FALLBACK_RE.search(text)
    if m:
        out["hs_code"] = re.sub(r"\s+", "", m.group(1)).replace("..", ".")

    qty_m = re.search(
        r"(?i)(?:quantity|qty|packages)\s*[.:]?\s*([^\n]{1,80})",
        text,
    )
    if qty_m:
        out["quantity"] = qty_m.group(1).strip()

    # Prefer labeled totals
    amt_m = re.search(
        r"(?i)(?:total\s*(?:amount|value)|invoice\s*total|declared\s*value|amount\s*due)\s*[.:]?\s*([^\n]+)",
        text,
    )
    if amt_m:
        out["total_amount"] = amt_m.group(1).strip()[:120]
    else:
        mm = list(MONEY_RE.finditer(text))
        if mm:
            out["total_amount"] = mm[-1].group(0).strip()

    origin_line = _line_after_keyword(text, origin_pat)
    if origin_line:
        out["country_of_origin"] = origin_line[:120]

    nw = re.search(
        r"(?i)(?:net\s*weight|N\.?W\.?)\s*[.:]?\s*([\d,.\s]+)\s*(?:KGS?|KG)\b",
        text,
    )
    if nw:
        out["net_weight"] = f"{nw.group(1).strip()} kg"

    gw = re.search(
        r"(?i)(?:gross\s*weight|G\.?W\.?)\s*[.:]?\s*([\d,.\s]+)\s*(?:KGS?|KG)\b",
        text,
    )
    if gw:
        out["gross_weight"] = f"{gw.group(1).strip()} kg"

    containers = CONTAINER_RE.findall(text)
    out["container_numbers"] = list(dict.fromkeys(containers))

    bln = re.search(r"(?i)B\s*/\s*L\s*(?:No\.?|#)?\s*[.:]?\s*([\w\-\/]+)", text)
    if bln:
        out["bl_number"] = bln.group(1).strip()

    invn = re.search(
        r"(?i)(?:invoice\s*(?:no\.?|#)|inv\.?\s*no\.?)\s*[.:]?\s*([\w\-\/\.]+)",
        text,
    )
    if invn:
        out["invoice_number"] = invn.group(1).strip()

    return out


# Optional: LLM normalize using extract_to_json schemas (Document AI text in → structured dict)
def openai_normalize_if_enabled(text: str, doc_hint: str) -> dict[str, Any] | None:
    if os.environ.get("VERIFY_USE_OPENAI_NORMALIZE", "").lower() not in ("1", "true", "yes"):
        return None
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from openai import OpenAI

        from extract_to_json import (
            extract_bl_data,
            extract_generic_trade_data,
            extract_invoice_data,
            extract_packing_list_data,
        )
    except ImportError:
        return None

    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    client = OpenAI(api_key=api_key)
    if doc_hint == "commercial_invoice":
        raw = extract_invoice_data(text, client, model)
    elif doc_hint == "packing_list":
        raw = extract_packing_list_data(text, client, model)
    elif doc_hint == "bill_of_lading":
        raw = extract_bl_data(text, client, model)
    else:
        raw = extract_generic_trade_data(text, client, model)
    return json.loads(raw)


def merged_llm_into_canonical(
    canonical: dict[str, Any], llm_obj: dict[str, Any], doc_hint: str
) -> dict[str, Any]:
    """Overlay LLM fields onto canonical keys for comparison."""
    m = dict(canonical)
    if doc_hint == "bill_of_lading":
        if llm_obj.get("shipper_name"):
            m["shipper_exporter"] = llm_obj["shipper_name"]
        if llm_obj.get("consignee"):
            m["consignee_buyer"] = llm_obj["consignee"]
        if llm_obj.get("hs_code"):
            m["hs_code"] = str(llm_obj["hs_code"])
        if llm_obj.get("package_quantity"):
            m["quantity"] = str(llm_obj["package_quantity"])
        if llm_obj.get("origin"):
            m["country_of_origin"] = llm_obj["origin"]
        if llm_obj.get("net_weight"):
            m["net_weight"] = str(llm_obj["net_weight"])
        if llm_obj.get("gross_weight"):
            m["gross_weight"] = str(llm_obj["gross_weight"])
        if llm_obj.get("container_no"):
            m["container_numbers"] = [llm_obj["container_no"]]
        if llm_obj.get("bl_number"):
            m["bl_number"] = str(llm_obj["bl_number"])
    elif doc_hint == "commercial_invoice":
        if llm_obj.get("seller_name"):
            m["shipper_exporter"] = llm_obj["seller_name"]
        if llm_obj.get("buyer_name"):
            m["consignee_buyer"] = llm_obj["buyer_name"]
        if llm_obj.get("quantity"):
            m["quantity"] = str(llm_obj["quantity"])
        if llm_obj.get("total_amount"):
            m["total_amount"] = str(llm_obj["total_amount"])
        if llm_obj.get("invoice_number"):
            m["invoice_number"] = str(llm_obj["invoice_number"])
        if llm_obj.get("container_number"):
            m["container_numbers"] = [llm_obj["container_number"]]
        if llm_obj.get("bl_number"):
            m["bl_number"] = str(llm_obj["bl_number"])
    elif doc_hint == "packing_list":
        if llm_obj.get("seller_name"):
            m["shipper_exporter"] = llm_obj["seller_name"]
        if llm_obj.get("buyer_name"):
            m["consignee_buyer"] = llm_obj["buyer_name"]
        if llm_obj.get("origin"):
            m["country_of_origin"] = llm_obj["origin"]
        if llm_obj.get("quantity"):
            m["quantity"] = str(llm_obj["quantity"])
        if llm_obj.get("total_gross_weight"):
            m["gross_weight"] = str(llm_obj["total_gross_weight"])
        if llm_obj.get("total_amount"):
            m["total_amount"] = str(llm_obj["total_amount"])
        if llm_obj.get("invoice_number"):
            m["invoice_number"] = str(llm_obj["invoice_number"])
    else:
        merged_llm_into_canonical(m, llm_obj, "commercial_invoice")
    return m


def merge_document_normalized(results: list[dict[str, Any]]) -> dict[str, Any]:
    sorted_r = sorted(
        results,
        key=lambda r: DOC_PRIORITY.get(r["document_type_hint"], 99),
    )
    merged: dict[str, Any] = {}
    keys = set()
    for r in sorted_r:
        keys.update(r["normalized"].keys())

    for k in keys:
        if k == "container_numbers":
            acc: list[str] = []
            for r in sorted_r:
                v = r["normalized"].get(k) or []
                if isinstance(v, list):
                    acc.extend(str(x) for x in v)
            merged[k] = list(dict.fromkeys(acc))
            continue
        for r in sorted_r:
            v = r["normalized"].get(k)
            if v is not None and v != "" and v != []:
                merged[k] = v
                break
        else:
            merged[k] = [] if k == "container_numbers" else None
    return merged


# -----------------------------------------------------------------------------
# Rule-based compare
# -----------------------------------------------------------------------------

LABEL_TO_KEYS: dict[str, tuple[str, ...]] = {
    "Exporter": ("shipper_exporter",),
    "HS Code": ("hs_code",),
    "Quantity": ("quantity",),
    "Declared Value": ("total_amount",),
    "Country of Origin": ("country_of_origin",),
    "Net Weight": ("net_weight",),
    "Consignee": ("consignee_buyer",),
    "Total Amount": ("total_amount",),
    "Invoice Number": ("invoice_number",),
    "B/L Number": ("bl_number",),
    "Container": ("container_numbers",),
}


def normalize_hs_code(s: str) -> str:
    return re.sub(r"\D", "", s)


def parse_money_value(s: str) -> float | None:
    if not s:
        return None
    t = re.sub(r"[^\d.,]", "", s)
    t = t.replace(",", "")
    try:
        return float(t) if t else None
    except ValueError:
        return None


def fuzzy_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def pick_extracted_for_label(label: str, merged: dict[str, Any]) -> str | None:
    keys = LABEL_TO_KEYS.get(label)
    if not keys:
        lk = label.strip().lower().replace(" ", "_")
        v = merged.get(lk)
        if v is None:
            return None
        if isinstance(v, list):
            return ", ".join(v) if v else None
        return str(v)
    for k in keys:
        v = merged.get(k)
        if v is None:
            continue
        if k == "container_numbers" and isinstance(v, list):
            return ", ".join(v) if v else None
        return str(v)
    return None


def compare_field(
    label: str, declared: str | None, extracted: str | None
) -> Literal["valid", "warning", "fraud"]:
    if declared is None or str(declared).strip() == "":
        return "valid"
    if extracted is None or str(extracted).strip() == "":
        return "warning"

    d = str(declared).strip()
    e = str(extracted).strip()
    ll = label.lower()

    if ll in ("hs code", "h.s. code"):
        if normalize_hs_code(d) == normalize_hs_code(e):
            return "valid"
        return "fraud"

    if ll in (
        "declared value",
        "total amount",
        "invoice total",
        "amount",
    ):
        pd, pe = parse_money_value(d), parse_money_value(e)
        if pd is not None and pe is not None and pd > 0:
            rel = abs(pd - pe) / pd
            if rel > 0.05:
                return "fraud"
            if rel > 0.001:
                return "warning"
            return "valid"

    if ll in ("net weight", "gross weight"):
        pd, pe = parse_money_value(d), parse_money_value(e)
        if pd is not None and pe is not None:
            if pd > 0:
                rel = abs(pd - pe) / pd
                if rel > 0.1:
                    return "fraud"
                if rel > 0.02:
                    return "warning"
            return "valid"

    nd, ne = _normalize_ws(d), _normalize_ws(e)
    if nd == ne:
        return "valid"
    if nd in ne or ne in nd:
        return "warning"
    if fuzzy_ratio(nd, ne) >= 0.88:
        return "warning"
    return "fraud"


# -----------------------------------------------------------------------------
# API models
# -----------------------------------------------------------------------------


class ComparisonRow(BaseModel):
    label: str
    declared: str | None = None
    extracted: str | None = None
    match: Literal["valid", "warning", "fraud"]


def summarize_rows(rows: list[ComparisonRow]) -> tuple[int, int, int, OverallFlag]:
    valid = sum(1 for r in rows if r.match == "valid")
    warn = sum(1 for r in rows if r.match == "warning")
    fraud = sum(1 for r in rows if r.match == "fraud")
    if fraud:
        overall = OverallFlag.CRITICAL_MISMATCH
    elif warn:
        overall = OverallFlag.MINOR_VARIANCE
    else:
        overall = OverallFlag.MATCH
    return valid, warn, fraud, overall


class DocumentSummary(BaseModel):
    id: str
    name: str
    page: str
    status: Literal["valid", "warning"]
    ocr_confidence: float | None = None
    document_type_hint: str
    extract_source: str


class VerificationResponse(BaseModel):
    verification_id: str
    documents: list[DocumentSummary]
    normalized_merged: dict[str, Any]
    comparison: list[ComparisonRow]
    summary: dict[str, int] = Field(
        ...,
        description="documents_scanned, valid_fields, warnings, fraud_risks",
    )
    overall_flag: OverallFlag = Field(
        description="match | minor_variance | critical_mismatch — maps to UI Match / Minor variance / Critical mismatch"
    )


class DeclarationField(BaseModel):
    label: str
    value: str | None = None


def parse_declaration_json(raw: str) -> list[DeclarationField]:
    raw = (raw or "").strip()
    if not raw:
        return []

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid declaration JSON: {exc}") from exc

    out: list[DeclarationField] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and "label" in item:
                out.append(
                    DeclarationField(
                        label=str(item["label"]),
                        value=item.get("value"),
                    )
                )
        return out

    if isinstance(data, dict):
        if "fields" in data and isinstance(data["fields"], list):
            for item in data["fields"]:
                if isinstance(item, dict):
                    out.append(
                        DeclarationField(
                            label=str(item.get("label", "")),
                            value=item.get("value"),
                        )
                    )
            return out
        for k, v in data.items():
            out.append(DeclarationField(label=str(k), value=None if v is None else str(v)))
        return out

    raise HTTPException(status_code=400, detail="Declaration must be a JSON object or array")


app = FastAPI(
    title="Borderflow Verification API",
    version="0.1.0",
    description="PDF → Document AI → normalize → rule compare → flags",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/verify", response_model=VerificationResponse)
async def verify(
    declaration: str = Form(
        default="{}",
        description='JSON: {"Exporter":"...", ...} or {"fields":[{"label":"...","value":"..."}]}',
    ),
    files: list[UploadFile] = File(..., description="One or more PDFs"),
) -> VerificationResponse:
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one PDF")

    decl_rows = parse_declaration_json(declaration)
    vid = str(uuid.uuid4())

    per_docs: list[dict[str, Any]] = []
    summaries: list[DocumentSummary] = []

    for uf in files:
        if not uf.filename or not uf.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Not a PDF: {uf.filename}")
        pdf_bytes = await uf.read()
        if not pdf_bytes:
            raise HTTPException(status_code=400, detail=f"Empty file: {uf.filename}")

        text, ocr_conf, page_count, extract_source = extract_pdf_bytes(pdf_bytes)
        stem = Path(uf.filename).stem
        hint = infer_document_type(stem)

        normalized = heuristic_normalize(text)
        llm_dict = openai_normalize_if_enabled(text, hint)
        if llm_dict:
            normalized = merged_llm_into_canonical(normalized, llm_dict, hint)

        per_docs.append(
            {
                "filename": uf.filename,
                "document_type_hint": hint,
                "normalized": normalized,
                "pages": page_count,
                "extract_source": extract_source,
                "ocr_confidence": ocr_conf,
            }
        )

        doc_status: Literal["valid", "warning"] = (
            "warning" if not any(normalized.values()) else "valid"
        )
        pct = round(float(ocr_conf) * 100, 1) if ocr_conf is not None else None

        summaries.append(
            DocumentSummary(
                id=str(uuid.uuid4()),
                name=_pretty_doc_name(hint, uf.filename),
                page=f"Page 1 of {max(page_count, 1)}",
                status=doc_status,
                ocr_confidence=pct,
                document_type_hint=hint,
                extract_source=extract_source,
            )
        )

    merged = merge_document_normalized(per_docs)

    comparison: list[ComparisonRow] = []
    for dr in decl_rows:
        if not dr.label.strip():
            continue
        ext = pick_extracted_for_label(dr.label.strip(), merged)
        match = compare_field(dr.label.strip(), dr.value, ext)
        comparison.append(
            ComparisonRow(
                label=dr.label.strip(),
                declared=dr.value,
                extracted=ext,
                match=match,
            )
        )

    valid_n, warn_n, fraud_n, overall = summarize_rows(comparison)

    return VerificationResponse(
        verification_id=vid,
        documents=summaries,
        normalized_merged=merged,
        comparison=comparison,
        summary={
            "documents_scanned": len(summaries),
            "valid_fields": valid_n,
            "warnings": warn_n,
            "fraud_risks": fraud_n,
        },
        overall_flag=overall,
    )


def _pretty_doc_name(hint: str, filename: str) -> str:
    mapping = {
        "commercial_invoice": "Commercial Invoice",
        "packing_list": "Packing List",
        "bill_of_lading": "Bill of Lading",
        "generic_trade_document": "Trade Document",
    }
    base = mapping.get(hint, hint.replace("_", " ").title())
    return f"{base} ({filename})"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "verification_api:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=True,
    )
