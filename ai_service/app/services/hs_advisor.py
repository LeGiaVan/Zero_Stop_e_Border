"""HS advisor retrieval + recommendation helpers."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from openai import OpenAI
from pydantic import BaseModel

from app.core.config import AI_SERVICE_ROOT

try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qdrant_models
except Exception:  # pragma: no cover
    QdrantClient = None  # type: ignore[assignment]
    qdrant_models = None  # type: ignore[assignment]


@dataclass
class HSContextDoc:
    hs_code: str
    title: str
    legal_basis: list[str]
    description: str
    source: str


class HSLLMOutput(BaseModel):
    best_hs_code: str | None = None
    reasoning: str
    confidence: float
    hs_code_candidates: list[str]
    legal_basis: list[str]
    questions_missing: list[str]


def _hs_knowledge_path() -> Path:
    raw = (os.environ.get("HS_KNOWLEDGE_PATH") or "").strip()
    if raw:
        p = Path(raw)
        return p if p.is_absolute() else AI_SERVICE_ROOT / p
    return AI_SERVICE_ROOT / "data" / "hs_knowledge.json"


def _qdrant_ready() -> bool:
    return bool(
        (os.environ.get("QDRANT_URL") or "").strip()
        and (os.environ.get("QDRANT_COLLECTION_NAME") or "").strip()
        and (os.environ.get("OPENAI_API_KEY") or "").strip()
        and QdrantClient is not None
        and qdrant_models is not None
    )


def _split_lines(v: Any) -> list[str]:
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        return [s.strip() for s in v.split("\n") if s.strip()]
    return []


@lru_cache(maxsize=1)
def load_local_hs_docs() -> list[HSContextDoc]:
    p = _hs_knowledge_path()
    if not p.exists():
        return []
    try:
        payload = json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(payload, list):
        return []

    docs: list[HSContextDoc] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        hs_code = str(row.get("hs_code") or "").strip()
        title = str(row.get("title") or "").strip()
        description = str(row.get("description") or "").strip()
        if not hs_code or not description:
            continue
        docs.append(
            HSContextDoc(
                hs_code=hs_code,
                title=title or hs_code,
                legal_basis=_split_lines(row.get("legal_basis")),
                description=description,
                source=str(row.get("source") or "local_knowledge"),
            )
        )
    return docs


def _keyword_score(doc: HSContextDoc, query: str) -> int:
    q_terms = {t for t in query.lower().split() if len(t) >= 3}
    if not q_terms:
        return 0
    hay = " ".join([doc.hs_code, doc.title, doc.description, " ".join(doc.legal_basis)]).lower()
    score = 0
    for t in q_terms:
        if t in hay:
            score += 1
    return score


def _search_local_docs(query: str, top_k: int) -> list[HSContextDoc]:
    docs = load_local_hs_docs()
    if not docs:
        return []
    ranked = sorted(docs, key=lambda d: _keyword_score(d, query), reverse=True)
    return [d for d in ranked if _keyword_score(d, query) > 0][:top_k]


def _search_qdrant_docs(client: OpenAI, query: str, top_k: int) -> list[HSContextDoc]:
    if not _qdrant_ready():
        return []

    url = (os.environ.get("QDRANT_URL") or "").strip()
    api_key = (os.environ.get("QDRANT_API_KEY") or "").strip() or None
    collection = (os.environ.get("QDRANT_COLLECTION_NAME") or "").strip()
    embedding_model = (os.environ.get("HS_EMBEDDING_MODEL") or "text-embedding-3-small").strip()

    emb = client.embeddings.create(model=embedding_model, input=query)
    vector = emb.data[0].embedding

    qdrant = QdrantClient(url=url, api_key=api_key, timeout=20.0)
    points = qdrant.search(
        collection_name=collection,
        query_vector=vector,
        limit=max(1, min(top_k, 10)),
        with_payload=True,
    )

    docs: list[HSContextDoc] = []
    for point in points:
        payload = point.payload or {}
        hs_code = str(payload.get("hs_code") or payload.get("code") or "").strip()
        title = str(payload.get("title") or payload.get("commodity") or hs_code).strip()
        description = str(payload.get("description") or payload.get("text") or "").strip()
        if not description:
            continue
        docs.append(
            HSContextDoc(
                hs_code=hs_code,
                title=title,
                legal_basis=_split_lines(payload.get("legal_basis")),
                description=description,
                source=str(payload.get("source") or "qdrant"),
            )
        )
    return docs


def retrieve_hs_context(client: OpenAI, query: str, top_k: int = 4) -> list[HSContextDoc]:
    docs = _search_qdrant_docs(client, query, top_k)
    if docs:
        return docs
    return _search_local_docs(query, top_k)


def _context_to_prompt(docs: list[HSContextDoc]) -> str:
    if not docs:
        return "No retrieval context available."
    parts: list[str] = []
    for idx, d in enumerate(docs, start=1):
        basis = "; ".join(d.legal_basis) if d.legal_basis else "N/A"
        parts.append(
            f"[{idx}] HS={d.hs_code}\nTitle={d.title}\nDescription={d.description}\nLegalBasis={basis}\nSource={d.source}"
        )
    return "\n\n".join(parts)


def generate_hs_suggestion(
    *,
    client: OpenAI,
    model: str,
    product_name: str,
    product_description: str,
    product_context: str | None,
) -> HSLLMOutput:
    query = " ".join(
        p.strip()
        for p in [product_name, product_description, product_context or ""]
        if p and p.strip()
    )
    if not query:
        raise HTTPException(status_code=400, detail="Missing product input.")

    context_docs = retrieve_hs_context(client=client, query=query, top_k=4)
    context_prompt = _context_to_prompt(context_docs)

    system_prompt = (
        "You are a customs HS advisor for import/export declarations. "
        "Use retrieval context as legal references, but never invent regulations. "
        "If confidence is low or key details are missing, ask clarifying questions. "
        "Return concise, practical outputs for declaration operators."
    )
    user_prompt = (
        f"Product name: {product_name}\n"
        f"Product description: {product_description}\n"
        f"Additional context: {product_context or 'N/A'}\n\n"
        f"Retrieved context:\n{context_prompt}\n\n"
        "Return best HS suggestion, 2-4 candidate codes, legal basis lines, and missing questions."
    )

    resp = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_format=HSLLMOutput,
        temperature=0.1,
    )
    parsed = resp.choices[0].message.parsed
    if parsed is None:
        raise HTTPException(status_code=502, detail="HS advisor returned empty output.")
    return parsed

