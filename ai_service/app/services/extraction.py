"""
PDF text extraction (pdfplumber) and LLM structured extraction.

CLI: ``python -m app.services.extraction`` from ``ai-service/`` (or pass PDF paths).
Requires ``OPENAI_API_KEY`` in repo root ``.env``.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Any

import pdfplumber
from openai import OpenAI

from app.core.config import AI_SERVICE_ROOT, PROJECT_ROOT, get_openai_model, load_app_env
from app.models.extractions import (
    BillOfLadingExtraction,
    CommercialInvoiceExtraction,
    PackingListExtraction,
)

DOC_PRIORITY: dict[str, int] = {
    "commercial_invoice": 0,
    "packing_list": 1,
    "bill_of_lading": 2,
    "generic_trade_document": 3,
}
EMPTY_CANONICAL_BASE: dict[str, Any] = {
    "shipper_exporter": None,
    "consignee_buyer": None,
    "goods_description": None,
    "hs_code": None,
    "quantity": None,
    "unit_price": None,
    "total_amount": None,
    "country_of_origin": None,
    "net_weight": None,
    "gross_weight": None,
    "container_numbers": [],
    "bl_number": None,
    "invoice_number": None,
}


def extract_invoice_data(raw_text: str, client: OpenAI, model: str) -> str:
    system_prompt = (
        "You are an expert data extractor for international trade documents. "
        "Extract the required fields from the provided Commercial Invoice OCR text. "
        "Match the extracted data exactly to the provided schema. "
        "If a field is not explicitly found or cannot be confidently inferred, return null."
    )
    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Extract data from this Commercial Invoice:\n\n{raw_text}",
            },
        ],
        response_format=CommercialInvoiceExtraction,
        temperature=0.1,
    )
    return response.choices[0].message.parsed.model_dump_json(indent=2)


def extract_packing_list_data(raw_text: str, client: OpenAI, model: str) -> str:
    system_prompt = (
        "You are an expert data extractor for international trade documents. "
        "Extract the required fields from the provided Packing List OCR text. "
        "Match the extracted data exactly to the provided schema. "
        "If a field is not explicitly found or cannot be confidently inferred, return null."
    )
    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Extract data from this Packing List:\n\n{raw_text}",
            },
        ],
        response_format=PackingListExtraction,
        temperature=0.1,
    )
    return response.choices[0].message.parsed.model_dump_json(indent=2)


def extract_bl_data(raw_text: str, client: OpenAI, model: str) -> str:
    system_prompt = (
        "You are an expert in logistics and supply chain data extraction. "
        "Extract the required fields from the provided Bill of Lading OCR text. "
        "If a field is not found in the text, return null for that field. "
        "Pay special attention to extracting exact container numbers, seal numbers, and weights."
    )
    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extract data from this B/L text:\n\n{raw_text}"},
        ],
        response_format=BillOfLadingExtraction,
        temperature=0.1,
    )
    return response.choices[0].message.parsed.model_dump_json(indent=2)


def extract_generic_trade_data(raw_text: str, client: OpenAI, model: str) -> str:
    """Same schema as commercial invoice; broader prompt for unknown filenames."""
    system_prompt = (
        "You are an expert data extractor for international trade documents. "
        "Extract the required fields from the provided document OCR text. "
        "The document may be an invoice, certificate, or other trade paper — map "
        "information to the schema where it fits; otherwise use null. "
        "If a field is not explicitly found or cannot be confidently inferred, return null."
    )
    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"Extract data from this trade/shipping document:\n\n{raw_text}",
            },
        ],
        response_format=CommercialInvoiceExtraction,
        temperature=0.1,
    )
    return response.choices[0].message.parsed.model_dump_json(indent=2)


def pdf_to_text(pdf_path: Path) -> tuple[str, int]:
    parts: list[str] = []
    with pdfplumber.open(pdf_path) as pdf:
        n = len(pdf.pages)
        for i, page in enumerate(pdf.pages, start=1):
            t = page.extract_text() or ""
            parts.append(f"--- Page {i}/{n} ---\n{t}")
    return "\n\n".join(parts), n


def infer_document_type(stem: str) -> str:
    s = stem.lower()
    if "invoice" in s or "commercial" in s:
        return "commercial_invoice"
    if "pack" in s:
        return "packing_list"
    if "land" in s or "bl" in s or "bill" in s:
        return "bill_of_lading"
    return "generic_trade_document"


def extract_by_doc_type(doc_type: str, text: str, client: OpenAI, model: str) -> str:
    if doc_type == "commercial_invoice":
        return extract_invoice_data(text, client, model)
    if doc_type == "packing_list":
        return extract_packing_list_data(text, client, model)
    if doc_type == "bill_of_lading":
        return extract_bl_data(text, client, model)
    return extract_generic_trade_data(text, client, model)


def llm_to_canonical(llm_obj: dict[str, Any], doc_type: str) -> dict[str, Any]:
    """Map extraction schema fields to compare-ready canonical fields."""
    canonical = dict(EMPTY_CANONICAL_BASE)
    if doc_type == "bill_of_lading":
        canonical["goods_description"] = _to_text(llm_obj.get("cargo_description"))
        canonical["shipper_exporter"] = llm_obj.get("shipper_name")
        canonical["consignee_buyer"] = llm_obj.get("consignee")
        canonical["hs_code"] = _to_text(llm_obj.get("hs_code"))
        canonical["quantity"] = _to_text(llm_obj.get("package_quantity") or llm_obj.get("product_quantity"))
        canonical["unit_price"] = None
        canonical["total_amount"] = _to_text(llm_obj.get("freight_currency_amount"))
        canonical["country_of_origin"] = llm_obj.get("origin")
        canonical["net_weight"] = _to_text(llm_obj.get("net_weight"))
        canonical["gross_weight"] = _to_text(llm_obj.get("gross_weight"))
        canonical["container_numbers"] = _listify(llm_obj.get("container_no"))
        canonical["bl_number"] = _to_text(llm_obj.get("bl_number"))
        canonical["invoice_number"] = _to_text(llm_obj.get("export_references"))   
        return canonical

    if doc_type == "commercial_invoice":
        canonical["goods_description"] = _to_text(llm_obj.get("goods_description"))
        canonical["shipper_exporter"] = llm_obj.get("seller_name")
        canonical["consignee_buyer"] = llm_obj.get("buyer_name")
        canonical["hs_code"] = _extract_hs_from_text(llm_obj.get("goods_description"))
        canonical["quantity"] = _to_text(llm_obj.get("quantity"))
        canonical["unit_price"] = _to_text(llm_obj.get("unit_price"))
        canonical["total_amount"] = _to_text(llm_obj.get("total_amount"))
        canonical["country_of_origin"] = (
            _extract_origin_from_text(llm_obj.get("goods_description"))
            or _origin_hint_from_seller(llm_obj)
        )
        canonical["net_weight"] = None
        canonical["gross_weight"] = None
        canonical["container_numbers"] = _listify(llm_obj.get("container_number"))
        canonical["bl_number"] = _to_text(llm_obj.get("bl_number"))
        canonical["invoice_number"] = _to_text(llm_obj.get("invoice_number"))
        return canonical

    if doc_type == "packing_list":
        canonical["goods_description"] = _to_text(llm_obj.get("goods_description"))
        canonical["shipper_exporter"] = llm_obj.get("seller_name")
        canonical["consignee_buyer"] = llm_obj.get("buyer_name")
        canonical["hs_code"] = _extract_hs_from_text(llm_obj.get("goods_description"))
        canonical["quantity"] = _to_text(llm_obj.get("quantity"))
        canonical["unit_price"] = _to_text(llm_obj.get("unit_price"))
        canonical["total_amount"] = _to_text(llm_obj.get("total_amount"))
        canonical["country_of_origin"] = llm_obj.get("origin")
        canonical["net_weight"] = None
        canonical["gross_weight"] = _to_text(llm_obj.get("total_gross_weight"))
        canonical["container_numbers"] = []
        canonical["bl_number"] = None
        canonical["invoice_number"] = _to_text(llm_obj.get("invoice_number"))
        return canonical

    canonical["goods_description"] = _to_text(llm_obj.get("goods_description"))
    canonical["shipper_exporter"] = llm_obj.get("seller_name")
    canonical["consignee_buyer"] = llm_obj.get("buyer_name")
    canonical["hs_code"] = _extract_hs_from_text(llm_obj.get("goods_description"))
    canonical["quantity"] = _to_text(llm_obj.get("quantity"))
    canonical["unit_price"] = _to_text(llm_obj.get("unit_price"))
    canonical["total_amount"] = _to_text(llm_obj.get("total_amount"))
    canonical["country_of_origin"] = _extract_origin_from_text(llm_obj.get("goods_description"))
    canonical["bl_number"] = _to_text(llm_obj.get("bl_number"))
    canonical["invoice_number"] = _to_text(llm_obj.get("invoice_number"))
    return canonical


def extract_structured_from_pdf(
    pdf_path: Path,
    client: OpenAI,
    model: str,
    filename_hint: str | None = None,
) -> dict[str, Any]:
    """
    Single document pipeline:
    PDF -> text -> typed extraction -> canonical -> standardized.
    """
    text, pages = pdf_to_text(pdf_path)
    doc_type = infer_document_type(filename_hint or pdf_path.stem)
    raw_json = json.loads(extract_by_doc_type(doc_type, text, client, model))
    canonical = llm_to_canonical(raw_json, doc_type)
    standardized = canonical_to_standardized(canonical)
    return {
        "source_file": pdf_path.name,
        "inferred_document_type": doc_type,
        "pages": pages,
        "model": model,
        "raw_json": raw_json,
        "canonical_json": canonical,
        "standardized_json": standardized,
    }


def merge_canonical_documents(documents: list[dict[str, Any]]) -> dict[str, Any]:
    sorted_docs = sorted(
        documents, key=lambda d: DOC_PRIORITY.get(d["inferred_document_type"], 99)
    )
    merged: dict[str, Any] = dict(EMPTY_CANONICAL_BASE)

    for key in merged.keys():
        if key == "container_numbers":
            all_containers: list[str] = []
            for doc in sorted_docs:
                values = doc["canonical_json"].get("container_numbers") or []
                all_containers.extend(str(v) for v in values if str(v).strip())
            merged[key] = list(dict.fromkeys(all_containers))
            continue

        for doc in sorted_docs:
            val = doc["canonical_json"].get(key)
            if val is not None and str(val).strip():
                merged[key] = val
                break
    return merged


def merge_standardized_documents(documents: list[dict[str, Any]]) -> dict[str, Any]:
    merged_canonical = merge_canonical_documents(documents)
    return canonical_to_standardized(merged_canonical)


def canonical_to_standardized(canonical: dict[str, Any]) -> dict[str, Any]:
    """Normalized schema required by pipeline step 6."""
    return {
        "value": _extract_first_number(canonical.get("total_amount")),
        "weight": _extract_first_number(
            canonical.get("net_weight") or canonical.get("gross_weight")
        ),
        "quantity": _extract_first_number(canonical.get("quantity")),
        "container": _first_item(canonical.get("container_numbers")),
        "bl_number": _to_text(canonical.get("bl_number")),
    }


def _to_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _listify(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    return [text] if text else []


def _first_item(value: Any) -> str | None:
    if isinstance(value, list) and value:
        return str(value[0])
    text = _to_text(value)
    return text


def _extract_first_number(value: Any) -> float | None:
    text = _to_text(value)
    if not text:
        return None
    match = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group(0).replace(",", ""))
    except ValueError:
        return None


def _extract_hs_from_text(text: Any) -> str | None:
    source = _to_text(text)
    if not source:
        return None
    match = re.search(r"\b\d{8,10}\b", source)
    return match.group(0) if match else None


def _extract_origin_from_text(text: Any) -> str | None:
    source = _to_text(text)
    if not source:
        return None
    match = re.search(r"origin[:\s]+([A-Za-z ]+)", source, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


def _origin_hint_from_seller(llm_obj: dict[str, Any]) -> str | None:
    """When invoice lacks explicit origin, infer likely manufacturing/jurisdiction hint from seller address."""
    addr = (_to_text(llm_obj.get("seller_address")) or "").lower()
    if not addr:
        return None
    if any(x in addr for x in ("korea", "seoul", "busan", "incheon")):
        return "Korea"
    if "vietnam" in addr or "ho chi minh" in addr or "hanoi" in addr:
        return "Vietnam"
    if "china" in addr or "shanghai" in addr or "shenzhen" in addr:
        return "China"
    if "japan" in addr or "tokyo" in addr:
        return "Japan"
    return None


def process_pdf(
    pdf_path: Path,
    client: OpenAI,
    model: str,
    out_dir: Path,
) -> Path:
    text, pages = pdf_to_text(pdf_path)
    doc_type = infer_document_type(pdf_path.stem)
    json_str = extract_by_doc_type(doc_type, text, client, model)
    extracted = json.loads(json_str)

    payload = {
        "source_file": pdf_path.name,
        "source_path": str(pdf_path.resolve()),
        "inferred_document_type": doc_type,
        "pages": pages,
        "model": model,
        "extracted": extracted,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{pdf_path.stem}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return out_path


def default_data_dir() -> Path:
    return PROJECT_ROOT / "data"


def main() -> None:
    load_app_env()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit(f"Missing OPENAI_API_KEY. Set it in {PROJECT_ROOT / '.env'}")

    parser = argparse.ArgumentParser(
        description="Extract structured JSON from PDFs under data/ (or given paths)."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="PDF files; if omitted, all .pdf files in data/",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=AI_SERVICE_ROOT / "output",
        help="Directory for JSON files (default: ai-service/output)",
    )
    parser.add_argument(
        "--model",
        default=get_openai_model(),
        help="Chat model (default: gpt-4o-mini or OPENAI_MODEL)",
    )
    args = parser.parse_args()

    client = OpenAI(api_key=api_key)

    if args.paths:
        pdfs = [p.resolve() for p in args.paths]
    else:
        data_dir = default_data_dir()
        pdfs = sorted(data_dir.glob("*.pdf"))

    if not pdfs:
        raise SystemExit(f"No PDF files found in {default_data_dir()}")

    for pdf in pdfs:
        if not pdf.is_file():
            raise SystemExit(f"Not a file: {pdf}")
        if pdf.suffix.lower() != ".pdf":
            raise SystemExit(f"Not a PDF: {pdf}")
        out = process_pdf(pdf, client, args.model, args.output_dir.resolve())
        print(f"Wrote {out}")


if __name__ == "__main__":
    main()
