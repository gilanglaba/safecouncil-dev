import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # API Keys
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

    # Server
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"
    HOST = os.getenv("HOST", "0.0.0.0")

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
        """Return dict of which API keys are configured."""
        return {
            "claude": bool(cls.ANTHROPIC_API_KEY),
            "gpt4o": bool(cls.OPENAI_API_KEY),
            "gemini": bool(cls.GOOGLE_API_KEY),
        }

    @classmethod
    def get_expert_model_info(cls):
        """Return expert availability and model info for health check."""
        result = {}

        if cls.ANTHROPIC_API_KEY:
            result["claude"] = {"available": True, "model": cls.CLAUDE_MODEL}
        else:
            result["claude"] = {"available": False, "error": "API key not configured"}

        if cls.OPENAI_API_KEY:
            result["gpt4o"] = {"available": True, "model": cls.OPENAI_MODEL}
        else:
            result["gpt4o"] = {"available": False, "error": "API key not configured"}

        if cls.GOOGLE_API_KEY:
            result["gemini"] = {"available": True, "model": cls.GEMINI_MODEL}
        else:
            result["gemini"] = {"available": False, "error": "API key not configured"}

        return result
