"""Declaration vs extracted document comparison and risk scoring."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

from app.models.schemas import ComparisonRow, MatchLevel, OverallFlag, RiskStatus


LABEL_TO_KEYS: dict[str, tuple[str, ...]] = {
    "Goods Description": ("goods_description",),
    "Exporter": ("shipper_exporter",),
    "HS Code": ("hs_code",),
    "Quantity": ("quantity",),
    # Declaration unit_value ↔ invoice unit_price (not invoice total_amount).
    "Unit value": ("unit_price",),
    # Legacy uploads may still send this label — prefer unit_price, avoid matching header total first alone.
    "Declared Value": ("unit_price", "total_amount"),
    "Line total": ("total_amount",),
    "Country of Origin": ("country_of_origin",),
    "Net Weight": ("net_weight",),
    "Gross Weight": ("gross_weight",),
    "Consignee": ("consignee_buyer",),
    "Total Amount": ("total_amount",),
    "Invoice Number": ("invoice_number",),
    "B/L Number": ("bl_number",),
    "Container": ("container_numbers",),
}


def _normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def normalize_hs_code(s: str) -> str:
    return re.sub(r"\D", "", s)


def parse_money_value(s: str) -> float | None:
    if not s:
        return None
    t = re.sub(r"[^\d.,]", "", s).replace(",", "")
    try:
        return float(t) if t else None
    except ValueError:
        return None


def parse_quantity_number(s: str) -> float | None:
    """Strip unit suffixes like `500 units`, `500 PCS`, compare numeric core only."""
    if not s:
        return None
    m = re.search(r"[-+]?\d[\d,]*(?:\.\d+)?", str(s))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", ""))
    except ValueError:
        return None


def fuzzy_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio()


def pick_extracted_for_label(label: str, normalized_merged: dict[str, Any]) -> str | None:
    keys = LABEL_TO_KEYS.get(label)
    if not keys:
        lookup = label.strip().lower().replace(" ", "_")
        value = normalized_merged.get(lookup)
        if value is None:
            return None
        if isinstance(value, list):
            return ", ".join(str(v) for v in value) if value else None
        text = str(value).strip()
        return text if text else None

    for key in keys:
        value = normalized_merged.get(key)
        if value is None:
            continue
        if key == "container_numbers" and isinstance(value, list):
            joined = ", ".join(str(v) for v in value if str(v).strip())
            if joined:
                return joined
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def compare_field(label: str, declared: str | None, extracted: str | None) -> MatchLevel:
    if declared is None or str(declared).strip() == "":
        return "valid"
    if extracted is None or str(extracted).strip() == "":
        return "warning"

    d = str(declared).strip()
    e = str(extracted).strip()
    ll = label.lower()

    if ll in ("hs code", "h.s. code"):
        return "valid" if normalize_hs_code(d) == normalize_hs_code(e) else "fraud"

    if ll == "quantity":
        pd, pe = parse_quantity_number(d), parse_quantity_number(e)
        if pd is not None and pe is not None:
            if abs(pd - pe) <= max(1e-9, abs(pd) * 1e-12):
                return "valid"
            denom = max(abs(pd), abs(pe), 1e-9)
            rel = abs(pd - pe) / denom
            return "fraud" if rel > 0.05 else "warning"

    if ll in ("goods description",):
        nd, ne = _normalize_ws(d), _normalize_ws(e)
        if nd == ne:
            return "valid"
        # One side often shorter (declaration summary vs full OCR line).
        if len(nd) >= 12 and nd in ne:
            return "valid"
        if len(ne) >= 12 and ne in nd:
            return "valid"
        if nd in ne or ne in nd:
            return "warning"
        if fuzzy_ratio(nd, ne) >= 0.82:
            return "warning"
        return "fraud"

    if ll in ("declared value", "total amount", "invoice total", "amount", "unit value", "line total"):
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
        if pd is not None and pe is not None and pd > 0:
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


def _dedupe_comparison_rows(rows: list[ComparisonRow]) -> list[ComparisonRow]:
    """Drop duplicate rows (same label + declared + extracted + match), preserve order."""
    seen: set[tuple[str, str | None, str | None, str]] = set()
    out: list[ComparisonRow] = []
    for r in rows:
        key = (r.label, r.declared, r.extracted, r.match)
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def build_comparison_rows(
    declaration_fields: list[dict[str, str | None]],
    normalized_merged: dict[str, Any],
) -> list[ComparisonRow]:
    rows: list[ComparisonRow] = []
    for item in declaration_fields:
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        declared = item.get("value")
        extracted = pick_extracted_for_label(label, normalized_merged)
        rows.append(
            ComparisonRow(
                label=label,
                declared=declared,
                extracted=extracted,
                match=compare_field(label, declared, extracted),
            )
        )
    return _dedupe_comparison_rows(rows)


def summarize_rows(rows: list[ComparisonRow]) -> tuple[int, int, int, OverallFlag]:
    valid = sum(1 for r in rows if r.match == "valid")
    warning = sum(1 for r in rows if r.match == "warning")
    fraud = sum(1 for r in rows if r.match == "fraud")

    if fraud:
        overall = OverallFlag.CRITICAL_MISMATCH
    elif warning:
        overall = OverallFlag.MINOR_VARIANCE
    else:
        overall = OverallFlag.MATCH
    return valid, warning, fraud, overall


def compute_risk(rows: list[ComparisonRow]) -> dict[str, Any]:
    valid, warning, fraud, _ = summarize_rows(rows)
    score = max(0, 100 - (warning * 15) - (fraud * 40))

    if fraud > 0 or score < 60:
        status = RiskStatus.RED
    elif warning > 0:
        status = RiskStatus.YELLOW
    else:
        status = RiskStatus.GREEN

    flags = [f"{r.label}: {r.match}" for r in rows if r.match != "valid"]
    explanation = (
        f"{valid} match, {warning} minor variance, {fraud} critical mismatch."
    )
    return {
        "status": status.value,
        "score": score,
        "flags": flags,
        "explanation": explanation,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
