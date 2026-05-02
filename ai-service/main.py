"""
Run::

    cd ai-service
    uvicorn main:app --reload --port 8000
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
