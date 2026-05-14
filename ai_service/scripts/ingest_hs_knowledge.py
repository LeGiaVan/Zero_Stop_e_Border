"""Ingest HS knowledge JSON/CSV into Qdrant.

Usage:
  python scripts/ingest_hs_knowledge.py --input data/hs_knowledge.json
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import OpenAI
from qdrant_client import QdrantClient
from qdrant_client.http import models as qdrant_models

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT.parent / ".env")
load_dotenv(ROOT / ".env")


def _parse_row(row: dict[str, Any]) -> dict[str, Any] | None:
    hs_code = str(row.get("hs_code") or "").strip()
    description = str(row.get("description") or "").strip()
    if not hs_code or not description:
        return None
    legal_basis_raw = row.get("legal_basis")
    if isinstance(legal_basis_raw, str):
        legal_basis = [s.strip() for s in legal_basis_raw.split("|") if s.strip()]
    elif isinstance(legal_basis_raw, list):
        legal_basis = [str(s).strip() for s in legal_basis_raw if str(s).strip()]
    else:
        legal_basis = []
    return {
        "hs_code": hs_code,
        "title": str(row.get("title") or hs_code),
        "description": description,
        "legal_basis": legal_basis,
        "source": str(row.get("source") or "ingestion_script"),
    }


def load_input(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError("JSON input must be an array.")
        out = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            parsed = _parse_row(item)
            if parsed:
                out.append(parsed)
        return out
    if path.suffix.lower() == ".csv":
        out = []
        with path.open("r", encoding="utf-8-sig", newline="") as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                parsed = _parse_row(dict(row))
                if parsed:
                    out.append(parsed)
        return out
    raise ValueError("Input must be .json or .csv")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to JSON/CSV knowledge file")
    parser.add_argument("--collection", default=os.environ.get("QDRANT_COLLECTION_NAME", "hs_codes_agriculture_viet"))
    parser.add_argument("--embedding-model", default=os.environ.get("HS_EMBEDDING_MODEL", "text-embedding-3-small"))
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.is_absolute():
        input_path = ROOT / input_path
    if not input_path.exists():
        raise FileNotFoundError(f"Input not found: {input_path}")

    qdrant_url = (os.environ.get("QDRANT_URL") or "").strip()
    openai_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not qdrant_url or not openai_key:
        raise RuntimeError("QDRANT_URL and OPENAI_API_KEY are required.")

    data = load_input(input_path)
    if not data:
        raise RuntimeError("No valid rows to ingest.")

    client = OpenAI(api_key=openai_key)
    qdrant = QdrantClient(url=qdrant_url, api_key=(os.environ.get("QDRANT_API_KEY") or "").strip() or None)

    sample = client.embeddings.create(model=args.embedding_model, input=data[0]["description"])
    dim = len(sample.data[0].embedding)
    qdrant.recreate_collection(
        collection_name=args.collection,
        vectors_config=qdrant_models.VectorParams(size=dim, distance=qdrant_models.Distance.COSINE),
    )

    points: list[qdrant_models.PointStruct] = []
    for idx, row in enumerate(data, start=1):
        text = "\n".join(
            [
                f"HS Code: {row['hs_code']}",
                f"Title: {row['title']}",
                f"Description: {row['description']}",
                f"Legal Basis: {'; '.join(row['legal_basis'])}",
            ]
        )
        emb = client.embeddings.create(model=args.embedding_model, input=text)
        points.append(
            qdrant_models.PointStruct(
                id=idx,
                vector=emb.data[0].embedding,
                payload=row,
            )
        )

    qdrant.upsert(collection_name=args.collection, points=points)
    print(f"Ingested {len(points)} HS rows into collection '{args.collection}'.")


if __name__ == "__main__":
    main()

