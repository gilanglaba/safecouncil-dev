import json
import logging
import os
import sys

from flask import Flask, request, jsonify
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
    """
    if not data.get("agent_name", "").strip():
        return False, "Please provide a name for the AI agent you want to evaluate."

    input_method = data.get("input_method", "manual")

    if input_method == "api_probe":
        api_config = data.get("api_config") or {}
        # Catalog tools, GitHub URLs, and live API endpoints all use api_probe mode
        if not isinstance(api_config, dict):
            return False, "Please provide a tool, GitHub URL, or API endpoint."
        has_tool = bool(api_config.get("tool_id"))
        has_github = bool(api_config.get("github_url", "").strip())
        has_endpoint = bool(api_config.get("endpoint", "").strip())
        if not (has_tool or has_github or has_endpoint):
            return False, "Please select a tool, paste a GitHub URL, or enter an API endpoint."
        if has_endpoint and not api_config.get("model", "").strip():
            return False, "Please enter the model name for the API you want to test (e.g., gpt-4o)."
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


@app.route("/api/evaluate/<eval_id>/pdf", methods=["GET"])
def get_evaluation_pdf(eval_id):
    """
    Download evaluation result as a PDF report.
    Uses the editable template at backend/templates/report_template.html
    """
    from services.pdf_service import generate_pdf
    from flask import send_file
    from io import BytesIO

    try:
        result = evaluation_service.get_result(eval_id)

        # Fall back to log file if not in memory
        if result is None:
            log_path = os.path.join(Config.LOG_DIR, f"{eval_id}.json")
            if os.path.exists(log_path):
                with open(log_path, "r", encoding="utf-8") as f:
                    result = json.load(f)
        if result is None:
            return jsonify({"error": "Evaluation not found or still running."}), 404

        pdf_bytes = generate_pdf(result)

        # Determine content type based on whether xhtml2pdf is available
        content_type = "application/pdf"
        filename = f"safecouncil-report-{eval_id}.pdf"

        # If pdf_bytes is actually HTML (xhtml2pdf not installed), adjust
        if pdf_bytes[:5] == b"<!DOC" or pdf_bytes[:5] == b"<html":
            content_type = "text/html"
            filename = f"safecouncil-report-{eval_id}.html"

        return send_file(
            BytesIO(pdf_bytes),
            mimetype=content_type,
            as_attachment=True,
            download_name=filename,
        )

    except Exception as e:
        logger.error(f"Error generating PDF for {eval_id}: {e}", exc_info=True)
        return jsonify({"error": "Failed to generate PDF report."}), 500


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

        return jsonify({
            "status": "healthy" if any_available else "degraded",
            "version": Config.VERSION,
            "experts": expert_status,
            "warnings": [] if any_available else [
                "No AI provider API keys configured. Set ANTHROPIC_API_KEY, "
                "OPENAI_API_KEY, or GOOGLE_API_KEY in .env file."
            ],
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
# Main entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Ensure log directory exists
    os.makedirs(Config.LOG_DIR, exist_ok=True)

    logger.info(f"Starting SafeCouncil API v{Config.VERSION}")
    logger.info(f"API keys configured: {Config.check_api_keys()}")
    logger.info(f"Log directory: {Config.LOG_DIR}")

    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG,
    )
