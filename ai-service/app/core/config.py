"""Load environment and shared path settings."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_CORE_DIR = Path(__file__).resolve().parent
_APP_DIR = _CORE_DIR.parent
AI_SERVICE_ROOT = _APP_DIR.parent
PROJECT_ROOT = AI_SERVICE_ROOT.parent


def load_app_env() -> None:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(AI_SERVICE_ROOT / ".env", override=True)


def get_openai_model() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
