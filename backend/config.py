import logging
import os
from dotenv import load_dotenv

load_dotenv()

_config_logger = logging.getLogger(__name__)


def _is_real_key(value: str) -> bool:
    """
    Return True only if `value` looks like a real API key — not empty, and
    not a placeholder like `your_anthropic_api_key_here` that ships in
    .env.example. Used by DEMO_MODE auto-detection so first-timers who run
    `make setup` land in demo mode instead of degraded mode.
    """
    v = (value or "").strip()
    if not v:
        return False
    # Common placeholder patterns: `your_*_here`, `changeme`, `xxx...`
    if v.lower().startswith("your_") and v.lower().endswith("_here"):
        return False
    if v.lower() in ("changeme", "placeholder", "none", "null"):
        return False
    return True


class Config:
    # API Keys
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

    # Server
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    HOST = os.getenv("HOST", "0.0.0.0")

    # ── SafeCouncil DEMO_MODE ────────────────────────────────────────────────
    # SafeCouncil is able to run synthesis pipeline without requiring a live
    # API key. When DEMO_MODE is enabled, evaluation requests bypass LLM calls
    # and return a pre-built deliberative result through the real backend code
    # path (job tracking, status polling, audit logging all execute normally).
    #
    # Three-state DEMO_MODE environment variable:
    #   "true"  → force demo mode regardless of API keys
    #   "false" → force real mode (will fail if no keys are set)
    #   "auto"  → demo mode ONLY when ALL three API keys are missing (default)
    #
    # Cached at module import — restart the backend after editing .env to apply.
    @staticmethod
    def _compute_demo_mode():
        mode = os.getenv("DEMO_MODE", "auto").lower().strip()
        if mode == "true":
            return True
        if mode == "false":
            return False
        # auto: enable demo only when ALL three LLM keys are missing OR
        # still set to the .env.example placeholders. Using _is_real_key
        # prevents the "your_anthropic_api_key_here" footgun that left
        # first-timers in degraded mode after `make setup`.
        no_real_keys = not (
            _is_real_key(os.getenv("ANTHROPIC_API_KEY", ""))
            or _is_real_key(os.getenv("OPENAI_API_KEY", ""))
            or _is_real_key(os.getenv("GOOGLE_API_KEY", ""))
        )
        return no_real_keys

    DEMO_MODE = _compute_demo_mode.__func__()

    # Models
    CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")

    # Paths
    LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    GOVERNANCE_DOCS_DIR = os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "governance", "documents"
    )

    # Expert names
    EXPERT_A_NAME = "Expert A (Claude)"
    EXPERT_B_NAME = "Expert B (GPT-4o)"
    EXPERT_C_NAME = "Expert C (Gemini)"

    # Version
    VERSION = "0.1.0"

    @classmethod
    def check_api_keys(cls):
        """Return dict of which API keys are configured (ignoring placeholders)."""
        return {
            "claude": _is_real_key(cls.ANTHROPIC_API_KEY),
            "gpt4o": _is_real_key(cls.OPENAI_API_KEY),
            "gemini": _is_real_key(cls.GOOGLE_API_KEY),
        }

    @classmethod
    def get_expert_model_info(cls):
        """Return expert availability and model info for health check."""
        result = {}

        if _is_real_key(cls.ANTHROPIC_API_KEY):
            result["claude"] = {"available": True, "model": cls.CLAUDE_MODEL}
        else:
            result["claude"] = {"available": False, "error": "API key not configured"}

        if _is_real_key(cls.OPENAI_API_KEY):
            result["gpt4o"] = {"available": True, "model": cls.OPENAI_MODEL}
        else:
            result["gpt4o"] = {"available": False, "error": "API key not configured"}

        if _is_real_key(cls.GOOGLE_API_KEY):
            result["gemini"] = {"available": True, "model": cls.GEMINI_MODEL}
        else:
            result["gemini"] = {"available": False, "error": "API key not configured"}

        return result
