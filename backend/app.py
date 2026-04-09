import json
import logging
import os
import sys

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Ensure backend/ is on the path so imports work correctly
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import Config
from governance.frameworks import list_frameworks
from models.schemas import EvaluationInput, EvalStatus
from services.evaluation_service import EvaluationService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Static directory for the built React frontend.
# In Docker: the Dockerfile sets STATIC_DIR=/app/frontend/dist after running
# `npm run build`, so Flask serves the compiled SPA directly.
# In local dev (make dev): STATIC_DIR is unset and frontend/dist typically
# doesn't exist. Vite serves the frontend on :3000 and proxies /api/* to
# Flask on :5000, so Flask never needs to serve static files. The SPA
# catch-all route below is only registered when the dist directory actually
# exists, so local dev behavior is byte-identical to before.
_STATIC_DIR = os.environ.get(
    "STATIC_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist"),
)
_SERVE_STATIC = os.path.isdir(_STATIC_DIR)

if _SERVE_STATIC:
    # static_folder=None disables Flask's built-in /<path:filename> static
    # handler — otherwise it would intercept SPA deep links like /evaluator
    # and return 404 before reaching our catch-all. We serve static files
    # ourselves from the catch-all route below.
    app = Flask(__name__, static_folder=None)
    logger.info(f"Flask will serve static SPA from {_STATIC_DIR}")
else:
    app = Flask(__name__)
CORS(app, origins="*")  # Allow all origins in development; restrict in production

# Single shared evaluation service instance
evaluation_service = EvaluationService()


# ---------------------------------------------------------------------------
# Input validation helpers
# ---------------------------------------------------------------------------

def _validate_evaluation_input(data: dict) -> tuple[bool, str]:
    """
    Validate request body for POST /api/evaluate.
    Returns (is_valid: bool, error_message: str).

    Accepts three equivalent ways to submit a GitHub-URL evaluation so
    callers don't have to know the internal `api_probe` naming:
      - {"input_method": "api_probe", "api_config": {"github_url": "..."}}
      - {"input_method": "github", "github_url": "..."}
      - {"input_method": "github", "api_config": {"github_url": "..."}}
    When a GitHub URL is provided, the `conversations` field is optional
    because the GitHubIngestionService generates conversations dynamically
    from the repo's README + code files.
    """
    if not data.get("agent_name", "").strip():
        return False, "Please provide a name for the AI agent you want to evaluate."

    input_method = (data.get("input_method") or "manual").lower()

    # Normalize the three GitHub-URL shapes into api_config.github_url
    api_config = data.get("api_config") or {}
    if not isinstance(api_config, dict):
        api_config = {}
    top_level_url = (data.get("github_url") or "").strip()
    if input_method == "github" or top_level_url or api_config.get("github_url"):
        if top_level_url and not api_config.get("github_url"):
            api_config["github_url"] = top_level_url
            data["api_config"] = api_config
        # Any form of GitHub input → route through api_probe path, which
        # lets the ingestion service generate conversations dynamically.
        input_method = "api_probe"
        data["input_method"] = "api_probe"

    if input_method == "api_probe":
        has_tool = bool(api_config.get("tool_id"))
        has_github = bool(api_config.get("github_url", "").strip())
        has_endpoint = bool(api_config.get("endpoint", "").strip())
        if not (has_tool or has_github or has_endpoint):
            return False, "Please select a tool, paste a GitHub URL, or enter an API endpoint."
        if has_endpoint and not api_config.get("model", "").strip():
            return False, "Please enter the model name for the API you want to test (e.g., gpt-4o)."
        # Conversations are optional for probe/catalog/github paths — the
        # ingestion service will generate them from the target.
    else:
        conversations = data.get("conversations", [])
        if not conversations or not isinstance(conversations, list):
            return False, "Please add at least one conversation example (a user prompt and the agent's response)."

        for i, conv in enumerate(conversations):
            if not isinstance(conv, dict):
                return False, f"Conversation #{i+1} has an invalid format. Each conversation needs a prompt and output field."
            if not conv.get("prompt", "").strip():
                return False, f"Conversation #{i+1} is missing the user prompt. Please add what the user said."
            if not conv.get("output", "").strip():
                return False, f"Conversation #{i+1} is missing the agent's response. Please add what the agent replied."

    experts = data.get("experts", [])
    if not experts or not isinstance(experts, list):
        return False, "Please select at least one AI expert to run the evaluation."

    enabled = [e for e in experts if isinstance(e, dict) and e.get("enabled", False)]
    if not enabled:
        return False, "Please enable at least one AI expert. Toggle on Claude, GPT-4o, or Gemini to proceed."

    synthesis_provider = data.get("synthesis_provider")
    if synthesis_provider is not None:
        allowed = {"claude", "gpt4o", "gemini", "local"}
        if synthesis_provider not in allowed:
            return False, f"Invalid synthesis_provider '{synthesis_provider}'. Must be one of: {', '.join(sorted(allowed))}."

    return True, ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/api/evaluate", methods=["POST"])
def submit_evaluation():
    """
    Submit a new evaluation.
    Returns immediately with eval_id; evaluation runs in background.
    """
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"error": "Something went wrong with your submission. Please try again."}), 400

        is_valid, error_msg = _validate_evaluation_input(data)
        if not is_valid:
            return jsonify({"error": error_msg}), 400

        eval_input = EvaluationInput.from_dict(data)
        eval_id = evaluation_service.submit_evaluation(eval_input)

        return jsonify({
            "eval_id": eval_id,
            "status": "queued",
            "message": f"Evaluation started. Poll /api/evaluate/{eval_id}/status for progress.",
        }), 202

    except Exception as e:
        logger.error(f"Error submitting evaluation: {e}", exc_info=True)
        return jsonify({"error": "Failed to submit evaluation. Please try again."}), 500


@app.route("/api/evaluate/demo", methods=["POST"])
def submit_demo_evaluation():
    """
    Run evaluation with pre-loaded demo data (WFP chatbot example).
    Accepts optional overrides in request body (e.g., to enable/disable experts).
    """
    try:
        from demo_data import DEMO_INPUT

        # Allow request body to override default demo settings (e.g., expert selection)
        override_data = request.get_json(silent=True) or {}
        demo_data = {**DEMO_INPUT, **override_data}

        eval_input = EvaluationInput.from_dict(demo_data)
        eval_id = evaluation_service.submit_evaluation(eval_input)

        return jsonify({
            "eval_id": eval_id,
            "status": "queued",
            "message": f"Demo evaluation started. Poll /api/evaluate/{eval_id}/status for progress.",
            "demo": True,
        }), 202

    except Exception as e:
        logger.error(f"Error submitting demo evaluation: {e}", exc_info=True)
        return jsonify({"error": "Failed to start demo evaluation."}), 500


@app.route("/api/evaluate/<eval_id>/status", methods=["GET"])
def get_evaluation_status(eval_id: str):
    """
    Poll evaluation progress. Frontend calls this every 2 seconds.
    """
    try:
        job = evaluation_service.get_status(eval_id)
        if not job:
            return jsonify({
                "error": f"Evaluation '{eval_id}' not found",
                "eval_id": eval_id,
            }), 404

        return jsonify(job.to_status_dict()), 200

    except Exception as e:
        logger.error(f"Error getting status for {eval_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to retrieve evaluation status."}), 500


@app.route("/api/evaluate/<eval_id>", methods=["GET"])
def get_evaluation_result(eval_id: str):
    """
    Get full evaluation results.
    Returns 202 if still running, 404 if not found, 200 with results if complete.
    """
    try:
        job = evaluation_service.get_status(eval_id)
        if not job:
            # Try loading from audit log (allows retrieving past evaluations after restart)
            log_path = os.path.join(Config.LOG_DIR, f"{eval_id}.json")
            if os.path.exists(log_path):
                with open(log_path, "r", encoding="utf-8") as f:
                    return jsonify(json.load(f)), 200
            return jsonify({"error": f"Evaluation '{eval_id}' not found"}), 404

        if job.status == EvalStatus.FAILED:
            return jsonify({
                "eval_id": eval_id,
                "status": "failed",
                "error": job.error or "Unknown error",
            }), 500

        if job.status in (EvalStatus.QUEUED, EvalStatus.RUNNING):
            return jsonify({
                "eval_id": eval_id,
                "status": job.status.value,
                "message": "Evaluation is still in progress",
                "progress": job.progress,
                "status_url": f"/api/evaluate/{eval_id}/status",
            }), 202

        result = evaluation_service.get_result(eval_id)
        if not result:
            return jsonify({"error": "Result not available"}), 500

        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Error getting result for {eval_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to retrieve evaluation result."}), 500


@app.route("/api/evaluations", methods=["GET"])
def list_evaluations():
    """
    List all evaluations — combines in-memory jobs and saved log files.
    """
    try:
        evaluations = []

        # Get from in-memory completed jobs
        in_memory = evaluation_service.list_completed()
        seen_ids = {e["eval_id"] for e in in_memory}
        evaluations.extend(in_memory)

        # Also scan the logs directory for evaluations from previous runs
        log_dir = Config.LOG_DIR
        if os.path.isdir(log_dir):
            for filename in os.listdir(log_dir):
                if not filename.endswith(".json"):
                    continue
                eval_id = filename[:-5]  # strip .json
                if eval_id in seen_ids:
                    continue  # Already included from in-memory
                log_path = os.path.join(log_dir, filename)
                try:
                    with open(log_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    verdict_data = data.get("verdict", {})
                    assessments = data.get("expert_assessments", [])
                    scores = [a.get("overall_score", 0) for a in assessments if isinstance(a, dict)]
                    avg_score = round(sum(scores) / len(scores)) if scores else 0
                    evaluations.append({
                        "eval_id": data.get("eval_id", eval_id),
                        "agent_name": data.get("agent_name", "Unknown"),
                        "verdict": verdict_data.get("final_verdict", "UNKNOWN"),
                        "confidence": verdict_data.get("confidence", 0),
                        "overall_score": avg_score,
                        "orchestrator_method": data.get("orchestrator_method", ""),
                        "timestamp": data.get("timestamp", ""),
                    })
                except (json.JSONDecodeError, KeyError) as e:
                    logger.warning(f"Could not parse log file {filename}: {e}")

        # Sort by timestamp descending
        evaluations.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        return jsonify({"evaluations": evaluations}), 200

    except Exception as e:
        logger.error(f"Error listing evaluations: {e}", exc_info=True)
        return jsonify({"error": "Failed to list evaluations."}), 500


@app.route("/api/governance/upload", methods=["POST"])
def upload_governance_doc():
    """
    Upload a governance document (PDF/DOCX/TXT).
    AI extracts evaluation dimensions and returns YAML for user verification.
    """
    from governance.doc_to_yaml_service import extract_text_from_file, extract_dimensions_from_text
    import tempfile

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "No file selected."}), 400

    try:
        # Save uploaded file temporarily
        ext = os.path.splitext(file.filename)[1]
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        # Extract text
        text = extract_text_from_file(tmp_path)
        os.unlink(tmp_path)

        if not text.strip():
            return jsonify({"error": "Could not extract text from the uploaded file."}), 400

        # Use LLM to extract dimensions
        yaml_text = extract_dimensions_from_text(text)

        return jsonify({
            "yaml": yaml_text,
            "filename": file.filename,
            "text_length": len(text),
        }), 200

    except Exception as e:
        logger.error(f"Governance doc upload failed: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/governance/confirm", methods=["POST"])
def confirm_governance_dimensions():
    """
    Save user-verified custom dimensions YAML.
    """
    from governance.doc_to_yaml_service import save_custom_dimensions

    data = request.get_json()
    if not data or "yaml" not in data or "filename" not in data:
        return jsonify({"error": "Missing 'yaml' and 'filename' in request body."}), 400

    try:
        path = save_custom_dimensions(data["yaml"], data["filename"])
        return jsonify({"saved": True, "path": path}), 200
    except Exception as e:
        logger.error(f"Failed to save custom dimensions: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/frameworks", methods=["GET"])
def get_frameworks():
    """List available governance frameworks."""
    try:
        return jsonify({"frameworks": list_frameworks()}), 200
    except Exception as e:
        logger.error(f"Error listing frameworks: {e}", exc_info=True)
        return jsonify({"error": "Failed to retrieve frameworks."}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """
    Health check endpoint.
    Returns server status and which AI providers have API keys configured.
    """
    try:
        expert_status = Config.get_expert_model_info()
        any_available = any(v.get("available") for v in expert_status.values())

        # Local LLM availability — required if user wants on-prem synthesis.
        local_endpoint = os.getenv("LOCAL_ENDPOINT", "").strip()
        local_model = os.getenv("LOCAL_MODEL", "").strip()
        local_status = {
            "available": bool(local_endpoint and local_model),
            "endpoint_set": bool(local_endpoint),
            "model_set": bool(local_model),
        }
        expert_status["local"] = local_status

        # SafeCouncil is able to run synthesis pipeline without requiring a live
        # API key. demo_mode reflects whether evaluation requests will bypass
        # LLM calls and return pre-built results.
        demo_mode = Config.DEMO_MODE

        warnings = []
        if not any_available and not demo_mode:
            warnings.append(
                "No AI provider API keys configured. Set ANTHROPIC_API_KEY, "
                "OPENAI_API_KEY, or GOOGLE_API_KEY in .env file, or set "
                "DEMO_MODE=true to run the synthesis pipeline without API keys."
            )
        if demo_mode:
            warnings.append(
                "DEMO_MODE is active. Evaluation requests will return pre-built "
                "results without calling real LLM APIs."
            )

        return jsonify({
            "status": "healthy" if (any_available or demo_mode) else "degraded",
            "version": Config.VERSION,
            "experts": expert_status,
            "demo_mode": demo_mode,
            "warnings": warnings,
        }), 200

    except Exception as e:
        logger.error(f"Health check error: {e}", exc_info=True)
        return jsonify({"status": "error", "error": str(e)}), 500


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Unhandled server error: {e}", exc_info=True)
    return jsonify({"error": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# SPA catch-all — only registered when a built frontend/dist exists
# ---------------------------------------------------------------------------
# In a Docker container (where STATIC_DIR points at the compiled React app)
# this route serves index.html for any non-/api path so that React Router
# client-side routes like /evaluator, /dashboard, /about keep working after
# a browser refresh. In local dev with `make dev`, dist/ typically does not
# exist, so this block is skipped entirely and Vite on :3000 owns the UI.

if _SERVE_STATIC:
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def _spa_catch_all(path):
        # Explicit JSON 404 for unknown /api/* so the client sees an error
        # rather than an unexpected HTML payload.
        if path.startswith("api/") or path.startswith("api"):
            return jsonify({"error": "Not found"}), 404
        full_path = os.path.join(_STATIC_DIR, path)
        if path and os.path.isfile(full_path):
            return send_from_directory(_STATIC_DIR, path)
        return send_from_directory(_STATIC_DIR, "index.html")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Ensure log directory exists
    os.makedirs(Config.LOG_DIR, exist_ok=True)

    logger.info(f"SafeCouncil starting | version={Config.VERSION} | DEMO_MODE={Config.DEMO_MODE}")
    logger.info(f"API keys configured: {Config.check_api_keys()}")
    logger.info(f"Log directory: {Config.LOG_DIR}")

    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
    )
