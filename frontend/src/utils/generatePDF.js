/**
 * PDF download for SafeCouncil evaluation results.
 *
 * Strategy: open a print-optimized React view of the result in a new tab
 * and let the browser's native print-to-PDF dialog handle the rendering.
 *
 * Why this approach?
 *   - Perfect visual fidelity with the on-screen results (the browser is
 *     rendering real React components with real CSS — no rasterization,
 *     no layout approximation).
 *   - Zero runtime dependencies (no html2canvas, no jsPDF, no xhtml2pdf).
 *   - Works identically across macOS, Windows, and Linux, and inside
 *     Docker containers and managed PaaS environments.
 *
 * The cost is a single extra click: the user picks "Save as PDF" as the
 * print destination in the browser dialog. This is how Notion, Google
 * Docs, Stripe, and Linear all generate PDFs for the same reason.
 *
 * Flow:
 *   1. caller: downloadPDF(result)
 *   2. we stash the full result in sessionStorage under a per-eval_id key
 *   3. we open /results/<eval_id>/print in a new tab
 *   4. PrintResultsPage reads sessionStorage (or falls back to demo
 *      fixtures / the /api/evaluate endpoint) and renders a print view
 *   5. PrintResultsPage calls window.print() once after layout settles
 *   6. the browser's print dialog opens; the user chooses "Save as PDF"
 */

export function downloadPDF(result) {
  if (!result || typeof result !== "object") {
    // eslint-disable-next-line no-console
    console.error("[generatePDF] Cannot print: result is missing or not an object", result);
    alert("Cannot print: no evaluation data available.");
    return;
  }

  // Fall back to a placeholder id for demo results that didn't come from
  // the dashboard list (keeps the route path valid).
  const evalId = result.eval_id || "ephemeral";
  const cacheKey = `print-result-${evalId}`;

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(result));
  } catch (err) {
    // sessionStorage may be full or blocked by private-mode in rare cases.
    // eslint-disable-next-line no-console
    console.warn("[generatePDF] Could not cache result in sessionStorage:", err);
  }

  const url = `/results/${encodeURIComponent(evalId)}/print`;
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    alert(
      "The print view was blocked by your browser's popup blocker. Please allow popups for this site and try again.",
    );
  }
}
