"""
Run::

    cd ai-service
    uvicorn main:app --reload --port 8000

After the Declaration UI saves shipments + documents, it POSTs to
``/api/declaration/process-documents`` to extract PDFs and fill ``documents.extracted_data``
and ``documents.mismatch_fields`` (requires OPENAI_API_KEY + SUPABASE_SERVICE_ROLE_KEY).
"""

from __future__ import annotations

import os

import uvicorn

from app.api import app
from app.core.config import load_app_env

if __name__ == "__main__":
    load_app_env()
    uvicorn.run(
        "main:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=True,
    )
