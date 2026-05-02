"""
Extract structured data from shipping PDFs to JSON.

PDF → plain text (pdfplumber) → LLM structured extraction (Pydantic + parse),
matching ai-service/test.py.

Requires OPENAI_API_KEY in borderflow-ai/.env (repo root).
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Optional

import pdfplumber
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel, Field

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    load_dotenv(REPO_ROOT / ".env")


class BillOfLadingExtraction(BaseModel):
    carrier: Optional[str] = Field(description="Carrier name, e.g., MAERSK LINE")
    bl_number: Optional[str] = Field(description="Bill of Lading number")
    bl_date: Optional[str] = Field(description="Date of the Bill of Lading (YYYY-MM-DD)")
    shipper_name: Optional[str] = Field(description="Name of the shipper")
    shipper_address: Optional[str] = Field(description="Address of the shipper")
    consignee: Optional[str] = Field(description="Consignee details, keep 'TO ORDER OF' if present")
    notify_party_name: Optional[str] = Field(description="Name of the notify party")
    notify_party_address: Optional[str] = Field(description="Address of the notify party")
    vessel: Optional[str] = Field(description="Vessel name")
    voyage_number: Optional[str] = Field(description="Voyage number")
    port_of_loading: Optional[str] = Field(description="Port of loading")
    port_of_discharge: Optional[str] = Field(description="Port of discharge")
    container_no: Optional[str] = Field(description="Container number")
    seal_no: Optional[str] = Field(description="Seal number")
    cargo_description: Optional[str] = Field(description="Description of goods")
    hs_code: Optional[str] = Field(description="HS Code")
    origin: Optional[str] = Field(description="Origin of goods, e.g., Korea")
    container_type_quantity: Optional[str] = Field(
        description="Quantity and type of containers, e.g., 1 x 20GP"
    )
    package_quantity: Optional[str] = Field(
        description="Quantity of packages, e.g., 1000 CARTONS"
    )
    product_quantity: Optional[int] = Field(
        description="Quantity of individual products/units, e.g., 500"
    )
    net_weight: Optional[str] = Field(
        description="Net weight including unit, e.g., 3250 KGS"
    )
    gross_weight: Optional[str] = Field(
        description="Gross weight including unit, e.g., 3650 KGS"
    )
    freight_terms: Optional[str] = Field(
        description="Freight terms, e.g., FREIGHT PREPAID"
    )
    place_of_issue: Optional[str] = Field(description="Place of B/L issue")


class CommercialInvoiceExtraction(BaseModel):
    invoice_number: Optional[str] = Field(
        description="Invoice number, e.g., TPH-CI-2201/2026"
    )
    invoice_date: Optional[str] = Field(description="Date of the invoice")
    seller_name: Optional[str] = Field(description="Shipper/Exporter (Seller) name")
    seller_address: Optional[str] = Field(description="Address of the seller")
    buyer_name: Optional[str] = Field(description="Consignee (Buyer) name")
    buyer_address: Optional[str] = Field(description="Address of the buyer")
    contract_number: Optional[str] = Field(description="Contract number and date")
    lc_details: Optional[str] = Field(
        description="L/C number, date, and issuing bank details"
    )
    port_of_loading: Optional[str] = Field(description="Port of loading")
    port_of_discharge: Optional[str] = Field(description="Port of discharge")
    vessel_name: Optional[str] = Field(description="Vessel name")
    shipment_date: Optional[str] = Field(description="Date of shipment")
    container_number: Optional[str] = Field(description="Container number")
    bl_number: Optional[str] = Field(description="Bill of Lading (B/L) number")
    goods_description: Optional[str] = Field(
        description="Detailed description of goods including model, year, etc."
    )
    quantity: Optional[str] = Field(
        description="Total quantity and unit, e.g., 500 units"
    )
    unit_price: Optional[str] = Field(
        description="Unit price including currency, e.g., 200 USD/unit"
    )
    price_term: Optional[str] = Field(
        description="Price term and incoterms, e.g., CIF CAT LAI PORT..."
    )
    total_amount: Optional[str] = Field(
        description="Total amount including currency, e.g., 100,000.00 USD"
    )
    total_in_words: Optional[str] = Field(description="Total amount in words")
    beneficiary_bank_details: Optional[str] = Field(
        description="Full beneficiary bank details including bank name, account no, SWIFT"
    )


class PackingListExtraction(BaseModel):
    packing_list_number: Optional[str] = Field(
        description="Packing List Number (Số phiếu đóng gói), e.g., TPH-CI-2201/2026"
    )
    date: Optional[str] = Field(
        description="Date of the Packing List (Ngày lập), e.g., Feb 02, 2026 or 02/02/2026"
    )
    seller_name: Optional[str] = Field(description="Seller/Exporter name (Người bán)")
    seller_address: Optional[str] = Field(description="Seller address (Địa chỉ người bán)")
    buyer_name: Optional[str] = Field(description="Buyer/Importer name (Người mua)")
    buyer_address: Optional[str] = Field(description="Buyer address (Địa chỉ người mua)")
    invoice_number: Optional[str] = Field(description="Invoice Number (Số hóa đơn)")
    port_of_loading: Optional[str] = Field(description="Port of Loading (Cảng bốc hàng)")
    port_of_discharge: Optional[str] = Field(description="Port of Discharge (Cảng dỡ hàng)")
    goods_description: Optional[str] = Field(description="Description of Goods (Mô tả hàng hóa)")
    year_of_manufacture: Optional[int] = Field(
        description="Year of Manufacture (Năm sản xuất)"
    )
    origin: Optional[str] = Field(description="Origin (Xuất xứ), e.g., Korea")
    quantity: Optional[str] = Field(
        description="Quantity with unit (Số lượng), e.g., 500 units"
    )
    total_gross_weight: Optional[str] = Field(
        description="Total Gross Weight with unit (Tổng trọng lượng), e.g., 3,650 kg"
    )
    unit_price: Optional[str] = Field(
        description="Unit price with currency (Đơn giá), e.g., 200 USD/units"
    )
    total_amount: Optional[str] = Field(
        description="Total Amount with currency (Tổng số tiền), e.g., 100,000.00 USD"
    )
    packaging_details: Optional[str] = Field(
        description="Packaging details and specifications (Quy cách đóng gói)"
    )
    price_term: Optional[str] = Field(
        description="Price term / Incoterms (Điều kiện giá)"
    )


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


def extract_by_doc_type(
    doc_type: str, text: str, client: OpenAI, model: str
) -> str:
    if doc_type == "commercial_invoice":
        return extract_invoice_data(text, client, model)
    if doc_type == "packing_list":
        return extract_packing_list_data(text, client, model)
    if doc_type == "bill_of_lading":
        return extract_bl_data(text, client, model)
    return extract_generic_trade_data(text, client, model)


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
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return out_path


def default_data_dir() -> Path:
    return REPO_ROOT / "data"


def main() -> None:
    load_env()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise SystemExit(
            f"Missing OPENAI_API_KEY. Set it in {REPO_ROOT / '.env'}"
        )

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
        default=REPO_ROOT / "ai-service" / "output",
        help="Directory for JSON files (default: ai-service/output)",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
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
