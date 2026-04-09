/**
 * PDF download for SafeCouncil evaluation results.
 *
 * The backend owns PDF rendering end-to-end:
 *   GET /api/evaluate/{eval_id}/pdf
 * returns a real application/pdf stream built from
 * backend/templates/report_template.html via xhtml2pdf.
 *
 * This module was previously a client-side html2canvas + jsPDF pipeline
 * (html2pdf.js) that silently produced blank PDFs because html2canvas
 * can't reliably rasterize complex flexbox + Google Fonts + gradient
 * layouts. Moving generation to the server is both more reliable and
 * simpler — no DOM hacks, no off-screen containers, no font-load races.
 */

/**
 * Trigger a PDF download for the given evaluation result.
 *
 * POSTs the full result object to /api/pdf so the backend never has to
 * look up anything by eval_id. This matters for Dashboard demo cards
 * (demo-verimedia, demo-unicef, demo-wfp1) which live only in the
 * frontend and have no corresponding audit log on disk.
 *
 * @param {object} result — evaluation result object. May contain
 *                          `agent_name` (used for the filename).
 */
export async function downloadPDF(result) {
  if (!result || typeof result !== "object") {
    // eslint-disable-next-line no-console
    console.error("[generatePDF] Cannot download PDF: result is missing or not an object", result);
    alert("Cannot download PDF: no evaluation data available.");
    return;
  }

  const safeName = (result.agent_name || "evaluation").replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `SafeCouncil-Report-${safeName}.pdf`;

  try {
    const response = await fetch("/api/pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
      },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Server returned ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const blob = await response.blob();

    // If the backend fell back to returning HTML (xhtml2pdf not installed),
    // warn the user and still save what we got with a .html extension so the
    // content isn't lost.
    const isHtmlFallback = contentType.includes("text/html");
    const finalFilename = isHtmlFallback
      ? filename.replace(/\.pdf$/, ".html")
      : filename;
    if (isHtmlFallback) {
      // eslint-disable-next-line no-console
      console.warn(
        "[generatePDF] Backend returned HTML instead of PDF — xhtml2pdf may not be installed. Saving as .html.",
      );
    }

    // Programmatic save via a temporary <a> + blob URL.
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Give the browser a moment to consume the URL before revoking it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[generatePDF] Download failed:", err);
    alert(`PDF download failed: ${err.message || err}`);
  }
}
