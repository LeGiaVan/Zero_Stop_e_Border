"""Helpers for parsing form payloads and downloading PDFs."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from fastapi import HTTPException


def parse_declaration_json(raw: str) -> list[dict[str, str | None]]:
    raw = (raw or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid declaration JSON: {exc}"
        ) from exc

    rows: list[dict[str, str | None]] = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and "label" in item:
                rows.append(
                    {
                        "label": str(item["label"]),
                        "value": None
                        if item.get("value") is None
                        else str(item.get("value")),
                    }
                )
        return rows

    if isinstance(data, dict):
        fields = data.get("fields")
        if isinstance(fields, list):
            for item in fields:
                if isinstance(item, dict):
                    rows.append(
                        {
                            "label": str(item.get("label", "")),
                            "value": None
                            if item.get("value") is None
                            else str(item.get("value")),
                        }
                    )
            return rows
        for k, v in data.items():
            rows.append({"label": str(k), "value": None if v is None else str(v)})
        return rows

    raise HTTPException(status_code=400, detail="Declaration must be object/list JSON")


def parse_file_urls(raw: str) -> list[str]:
    raw = (raw or "").strip()
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid file_urls JSON: {exc}") from exc
    if not isinstance(data, list) or any(not isinstance(v, str) for v in data):
        raise HTTPException(status_code=400, detail="file_urls must be a JSON string array")
    return data


def download_pdf_from_url(url: str) -> tuple[str, bytes]:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"Unsupported URL scheme: {url}")
    filename = Path(parsed.path).name or "document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail=f"URL is not a PDF: {url}")
    try:
        with urlopen(url, timeout=30) as resp:
            content = resp.read()
    except HTTPError as exc:
        raise HTTPException(
            status_code=400, detail=f"Cannot download {url}: HTTP {exc.code}"
        ) from exc
    except URLError as exc:
        raise HTTPException(
            status_code=400, detail=f"Cannot download {url}: {exc.reason}"
        ) from exc
    if not content:
        raise HTTPException(status_code=400, detail=f"Downloaded empty file: {url}")
    return filename, content


def document_display_name(doc_type: str, filename: str) -> str:
    mapping = {
        "commercial_invoice": "Commercial Invoice",
        "packing_list": "Packing List",
        "bill_of_lading": "Bill of Lading",
        "generic_trade_document": "Trade Document",
    }
    label = mapping.get(doc_type, doc_type.replace("_", " ").title())
    return f"{label} ({filename})"
