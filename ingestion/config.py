"""Paths, settings and secrets for the ingestion CLI. Secrets come from the repo-root .env."""

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("PAU_DATA_DIR", ROOT / "data")).resolve()
CACHE = ROOT / "data" / ".cache"  # always the real data/ (git-ignored), even with PAU_DATA_DIR

load_dotenv(ROOT / ".env")

# Bump when chunk building or rendering changes in a way that should re-process every material.
PIPELINE_VERSION = "1"

VISION_MODEL = os.environ.get("VISION_MODEL", "claude-haiku-5-5")
# Claude Haiku 5.5, prompts <= 100K tokens. Used only for the cost estimate printed after a run.
VISION_USD_PER_MTOK = (0.10, 0.50)

# Past papers (PRD §9.4): extraction, analysis and model answers, through the Batches API.
# claude-haiku-5-5 is supported for a tight budget.
PAST_Q_MODEL = os.environ.get("PAST_Q_MODEL", "claude-sonnet-5-5")

EMBED_MODEL = "voyage-4"
EMBED_DIMS = 1024  # must match vector(1024) in supabase/migrations

RENDER_WIDTH = 1280
BUCKET = "slides"


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is not set. Add it to {ROOT / '.env'} (see .env.example).")
    return value
