"""
PDF Service — generates evaluation report PDFs from an editable HTML template.
Template is at: backend/templates/report_template.html (Jinja2)
"""
import logging
import os
from datetime import datetime

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates")


def _get_template():
    """Load the Jinja2 template."""
    env = Environment(loader=FileSystemLoader(TEMPLATES_DIR))
    return env.get_template("report_template.html")


def render_report_html(result: dict) -> str:
    """
    Render the evaluation result into an HTML report string.
    The result dict should match the CouncilResult.to_dict() format.
    """
    template = _get_template()

    # Normalize the result data for the template
    verdict = result.get("verdict", {})
    if isinstance(verdict, str):
        verdict = {"final_verdict": verdict, "confidence": None, "agreement_rate": None}

    # Normalize expert assessments
    expert_assessments = result.get("expert_assessments", [])
    for ea in expert_assessments:
        # Ensure dimension_scores is a list of dicts
        if "dimension_scores" in ea:
            for ds in ea["dimension_scores"]:
                if isinstance(ds.get("score"), str):
                    ds["score"] = int(ds["score"])
        # Ensure findings severity is a string
        for f in ea.get("findings", []):
            if hasattr(f.get("severity"), "value"):
                f["severity"] = f["severity"].value

    context = {
        "agent_name": result.get("agent_name", "Unknown Agent"),
        "eval_id": result.get("eval_id", "—"),
        "timestamp": _format_timestamp(result.get("timestamp")),
        "verdict": verdict,
        "expert_assessments": expert_assessments,
        "agreements": result.get("agreements", []),
        "disagreements": result.get("disagreements", []),
        "mitigations": result.get("mitigations", []),
        "debate_transcript": result.get("debate_transcript", []),
        "audit": result.get("audit", {}),
        "generated_at": datetime.now().strftime("%B %d, %Y at %H:%M"),
    }

    return template.render(**context)


def generate_pdf(result: dict) -> bytes:
    """
    Generate a PDF from the evaluation result.
    Tries xhtml2pdf first, falls back to returning HTML bytes if not available.
    """
    html = render_report_html(result)

    try:
        from xhtml2pdf import pisa
        from io import BytesIO

        output = BytesIO()
        pisa_status = pisa.CreatePDF(html, dest=output)

        if pisa_status.err:
            logger.warning(f"xhtml2pdf had errors: {pisa_status.err}")

        return output.getvalue()

    except ImportError:
        logger.warning("xhtml2pdf not installed. Install with: pip install xhtml2pdf")
        logger.info("Returning HTML content instead. Save as .html and open in browser to print as PDF.")
        return html.encode("utf-8")


def _format_timestamp(ts):
    """Format a timestamp for display."""
    if not ts:
        return "—"
    try:
        if isinstance(ts, str):
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            dt = ts
        return dt.strftime("%B %d, %Y at %H:%M")
    except Exception:
        return str(ts)
