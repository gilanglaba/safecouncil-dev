/**
 * PDF Report Generator for SafeCouncil Evaluation Results
 *
 * Generates a professional HTML report and triggers browser print-to-PDF.
 * Edit the template below to customize the PDF layout and styling.
 */

function getScoreColor(score) {
  if (score >= 80) return "#0D9B5A";
  if (score >= 60) return "#C07B08";
  return "#C93B3B";
}

function getVerdictStyle(verdict) {
  const map = {
    APPROVE: { bg: "#E6F7EF", color: "#065F38", border: "#0D9B5A", icon: "✓" },
    REVIEW: { bg: "#FEF5E7", color: "#7A5200", border: "#C07B08", icon: "⚠" },
    REJECT: { bg: "#FDE8E8", color: "#7A1F1F", border: "#C93B3B", icon: "✕" },
  };
  return map[verdict] || map.REVIEW;
}

function getSeverityColor(severity) {
  const map = { CRITICAL: "#C93B3B", HIGH: "#C93B3B", MEDIUM: "#C07B08", LOW: "#8E7FA3" };
  return map[severity] || "#8E7FA3";
}

function getPriorityColor(priority) {
  const map = { P0: "#C93B3B", P1: "#C93B3B", P2: "#C07B08", P3: "#8E7FA3" };
  return map[priority] || "#8E7FA3";
}

function categoryAvg(dimensionScores, categoryName) {
  const dims = dimensionScores.filter((d) => d.category === categoryName);
  if (!dims.length) return null;
  return Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
      " at " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return timestamp;
  }
}

// ── Build the HTML report ──────────────────────────────────────────────────

function buildExpertSection(assessment) {
  const categories = {};
  for (const d of (assessment.dimension_scores || [])) {
    if (!categories[d.category]) categories[d.category] = [];
    categories[d.category].push(d);
  }

  const findings = (assessment.findings || [])
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    });

  return `
    <div class="expert-card">
      <div class="expert-header">
        <h3>${escapeHtml(assessment.expert_name)}</h3>
        <div class="expert-score" style="color: ${getScoreColor(assessment.overall_score)}">
          ${assessment.overall_score}/100
        </div>
      </div>

      <table class="score-table">
        ${Object.entries(categories).map(([cat, dims]) => `
          <tr class="cat-header"><td colspan="3">${escapeHtml(cat)}</td></tr>
          ${dims.map((d) => `
            <tr>
              <td class="dim-name">${escapeHtml(d.dimension)}</td>
              <td class="dim-bar">
                <div class="bar-bg"><div class="bar-fill" style="width:${d.score}%; background:${getScoreColor(d.score)}"></div></div>
              </td>
              <td class="dim-score" style="color:${getScoreColor(d.score)}">${d.score}</td>
            </tr>
          `).join("")}
        `).join("")}
      </table>

      ${findings.length > 0 ? `
        <div class="findings-section">
          <h4>Findings (${findings.length})</h4>
          ${findings.map((f) => `
            <div class="finding">
              <span class="severity-badge" style="color:${getSeverityColor(f.severity)}">${escapeHtml(f.severity)}</span>
              <strong>${escapeHtml(f.dimension)}</strong>
              <p>${escapeHtml(f.text)}</p>
              ${f.evidence ? `<p class="evidence">Evidence: ${escapeHtml(f.evidence)}${f.framework_ref ? ` <strong>[${escapeHtml(f.framework_ref)}]</strong>` : ""}</p>` : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function buildMitigationsSection(mitigations) {
  if (!mitigations || mitigations.length === 0) return "";
  return `
    <div class="section">
      <h2>Required Mitigations</h2>
      <table class="mitigations-table">
        <thead>
          <tr><th>Priority</th><th>Action</th><th>Owner</th><th>Expert Consensus</th></tr>
        </thead>
        <tbody>
          ${mitigations.map((m) => `
            <tr>
              <td><span class="priority-badge" style="color:${getPriorityColor(m.priority)}">${escapeHtml(m.priority)}</span></td>
              <td>${escapeHtml(m.text)}</td>
              <td>${escapeHtml(m.owner || "—")}</td>
              <td class="consensus">${escapeHtml(m.expert_consensus || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildDebateSection(transcript) {
  if (!transcript || transcript.length === 0) return "";
  return `
    <div class="section page-break">
      <h2>Expert Debate Transcript</h2>
      ${transcript.map((msg) => {
        if (msg.message_type === "resolution" || msg.speaker === "Council") {
          return `<div class="resolution"><strong>Council Resolution:</strong> ${escapeHtml(msg.message)}</div>`;
        }
        return `
          <div class="debate-msg">
            <strong class="speaker">${escapeHtml(msg.speaker)}</strong>
            ${msg.topic ? `<span class="topic">${escapeHtml(msg.topic)}</span>` : ""}
            <p>${escapeHtml(msg.message)}</p>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

export function buildReportHTML(result) {
  const verdict = result.verdict || {};
  const vs = getVerdictStyle(verdict.final_verdict);
  const assessments = result.expert_assessments || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>SafeCouncil Evaluation Report — ${escapeHtml(result.agent_name)}</title>
<style>
  /* ── PDF Template Styles ─────────────────────────────────────────────── */
  /* Edit these styles to customize the PDF appearance */

  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'DM Sans', -apple-system, sans-serif;
    color: #1A0A2E;
    font-size: 11px;
    line-height: 1.5;
    padding: 40px 48px;
    background: #fff;
  }

  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  h2 { font-size: 16px; font-weight: 700; margin: 28px 0 14px; padding-bottom: 6px; border-bottom: 2px solid #E8E4EF; color: #57068C; }
  h3 { font-size: 14px; font-weight: 700; }
  h4 { font-size: 12px; font-weight: 700; color: #5C4D6E; margin-bottom: 8px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
  .header-left { flex: 1; }
  .header-right { text-align: right; color: #5C4D6E; font-size: 10px; }
  .subtitle { color: #5C4D6E; font-size: 12px; margin-top: 2px; }

  .logo { font-size: 16px; font-weight: 700; color: #57068C; margin-bottom: 16px; letter-spacing: -0.02em; }
  .logo span { background: linear-gradient(135deg, #57068C, #5B92E5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

  /* Verdict Banner */
  .verdict-banner {
    padding: 20px 24px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .verdict-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 700;
  }
  .verdict-stats { display: flex; gap: 20px; margin-top: 10px; }
  .verdict-stat { text-align: center; }
  .verdict-stat .num { font-family: 'DM Mono', monospace; font-size: 20px; font-weight: 700; }
  .verdict-stat .label { font-size: 10px; opacity: 0.8; }

  /* Expert Cards */
  .experts-grid { display: flex; gap: 16px; margin-bottom: 8px; }
  .expert-card {
    flex: 1;
    border: 1px solid #E8E4EF;
    border-radius: 8px;
    padding: 16px;
    page-break-inside: avoid;
  }
  .expert-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .expert-score { font-family: 'DM Mono', monospace; font-size: 22px; font-weight: 700; }

  /* Score Table */
  .score-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  .score-table td { padding: 3px 0; }
  .cat-header td { font-size: 10px; font-weight: 700; color: #57068C; text-transform: uppercase; letter-spacing: 0.06em; padding-top: 8px; }
  .dim-name { font-size: 10px; color: #5C4D6E; width: 55%; }
  .dim-bar { width: 30%; }
  .bar-bg { height: 4px; background: #F0EDF5; border-radius: 2px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 2px; }
  .dim-score { font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 600; text-align: right; width: 15%; }

  /* Findings */
  .findings-section { border-top: 1px solid #F0EDF5; padding-top: 10px; }
  .finding { margin-bottom: 8px; padding-left: 8px; border-left: 2px solid #E8E4EF; }
  .finding p { font-size: 10px; color: #5C4D6E; margin-top: 2px; }
  .finding .evidence { font-style: italic; color: #8E7FA3; font-size: 9px; }
  .severity-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.04em; margin-right: 4px; }

  /* Mitigations */
  .mitigations-table { width: 100%; border-collapse: collapse; }
  .mitigations-table th { text-align: left; font-size: 10px; font-weight: 700; color: #5C4D6E; padding: 6px 8px; border-bottom: 2px solid #E8E4EF; }
  .mitigations-table td { padding: 8px; border-bottom: 1px solid #F0EDF5; font-size: 10px; vertical-align: top; }
  .priority-badge { font-family: 'DM Mono', monospace; font-weight: 700; font-size: 10px; }
  .consensus { color: #8E7FA3; font-size: 9px; }

  /* Debate */
  .debate-msg { margin-bottom: 10px; padding: 8px 12px; background: #FAFAFE; border-radius: 6px; }
  .debate-msg .speaker { color: #57068C; font-size: 11px; }
  .debate-msg .topic { font-size: 9px; color: #8E7FA3; margin-left: 8px; }
  .debate-msg p { font-size: 10px; color: #1A0A2E; margin-top: 4px; }
  .resolution { margin: 10px 0; padding: 10px 14px; background: #EEE6F3; border-radius: 6px; border-left: 3px solid #57068C; font-size: 10px; }

  /* Agreements */
  .agreements-grid { display: flex; gap: 16px; margin-bottom: 8px; }
  .agreement-box { flex: 1; padding: 14px; border-radius: 8px; }
  .agreement-box h4 { margin-bottom: 8px; }
  .agreement-box ul { padding-left: 16px; }
  .agreement-box li { font-size: 10px; margin-bottom: 4px; }

  .section { margin-bottom: 20px; }
  .page-break { page-break-before: always; }

  /* Footer */
  .report-footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #E8E4EF;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #8E7FA3;
  }

  @media print {
    body { padding: 24px 32px; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

  <!-- Header -->
  <div class="logo"><span>SafeCouncil</span> — AI Safety Evaluation Report</div>

  <div class="header">
    <div class="header-left">
      <h1>${escapeHtml(result.agent_name)}</h1>
      <div class="subtitle">Evaluation ID: ${escapeHtml(result.eval_id)} · ${formatDate(result.timestamp)}</div>
    </div>
    <div class="header-right">
      ${result.audit ? `
        ${result.audit.total_api_calls || "—"} API calls<br>
        ${result.audit.evaluation_time_seconds ? result.audit.evaluation_time_seconds.toFixed(0) + "s" : "—"} evaluation time<br>
        $${result.audit.total_cost_usd ? result.audit.total_cost_usd.toFixed(4) : "—"} cost
      ` : ""}
    </div>
  </div>

  ${result.executive_summary ? `
  <!-- Executive Summary — plain-English for non-technical readers -->
  <div style="background:#ffffff; border:1px solid #E5E0EC; border-left:4px solid #57068C; border-radius:8px; padding:18px 22px; margin-bottom:16px;">
    <div style="font-size:10px; font-weight:700; letter-spacing:0.08em; color:#57068C; text-transform:uppercase; margin-bottom:8px;">Executive Summary</div>
    <div style="font-size:14px; line-height:1.55; color:#1A0A2E; font-weight:400;">${escapeHtml(result.executive_summary)}</div>
  </div>
  ` : ""}

  <!-- Verdict Banner -->
  <div class="verdict-banner" style="background:${vs.bg}; border: 1px solid ${vs.border}">
    <div>
      <div style="font-size:10px; font-weight:600; color:${vs.color}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px">Council Final Verdict</div>
      <div class="verdict-badge" style="background:${vs.bg}; color:${vs.color}; border:1.5px solid ${vs.border}">
        ${vs.icon} ${escapeHtml(verdict.final_verdict || "UNKNOWN")}
      </div>
      <div class="verdict-stats">
        <div class="verdict-stat"><div class="num" style="color:${vs.color}">${verdict.confidence ?? "—"}%</div><div class="label" style="color:${vs.color}">Confidence</div></div>
        <div class="verdict-stat"><div class="num" style="color:${vs.color}">${verdict.agreement_rate ?? "—"}%</div><div class="label" style="color:${vs.color}">Agreement</div></div>
      </div>
    </div>
  </div>

  <!-- Expert Assessments -->
  <div class="section">
    <h2>Expert Assessments</h2>
    <div class="experts-grid">
      ${assessments.map((a) => buildExpertSection(a)).join("")}
    </div>
  </div>

  <!-- Agreements & Disagreements -->
  ${(result.agreements?.length > 0 || result.disagreements?.length > 0) ? `
    <div class="section">
      <h2>Council Consensus</h2>
      <div class="agreements-grid">
        ${result.agreements?.length > 0 ? `
          <div class="agreement-box" style="background:#E6F7EF; border:1px solid #0D9B5A30">
            <h4 style="color:#0D9B5A">✓ Agreements</h4>
            <ul>${result.agreements.map((a) => `<li>${escapeHtml(typeof a === "string" ? a : a.point || JSON.stringify(a))}</li>`).join("")}</ul>
          </div>
        ` : ""}
        ${result.disagreements?.length > 0 ? `
          <div class="agreement-box" style="background:#FEF5E7; border:1px solid #C07B0830">
            <h4 style="color:#C07B08">⚡ Points of Contention</h4>
            <ul>${result.disagreements.map((d) => `<li>${escapeHtml(typeof d === "string" ? d : d.topic ? d.topic + ": " + (d.resolution || "") : JSON.stringify(d))}</li>`).join("")}</ul>
          </div>
        ` : ""}
      </div>
    </div>
  ` : ""}

  <!-- Mitigations -->
  ${buildMitigationsSection(result.mitigations)}

  <!-- Debate Transcript -->
  ${buildDebateSection(result.debate_transcript)}

  <!-- Footer -->
  <div class="report-footer">
    <div>Generated by SafeCouncil — Council of Experts AI Safety Evaluation Platform</div>
    <div>${formatDate(new Date().toISOString())}</div>
  </div>

</body>
</html>`;
}

/**
 * Generate and download a PDF report for an evaluation result.
 * Renders the HTML report off-screen and saves directly as a .pdf file
 * (no browser print dialog) using html2pdf.js (html2canvas + jsPDF).
 */
export async function downloadPDF(result) {
  const html = buildReportHTML(result);

  // Off-screen container to render the report
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "794px"; // ~A4 width @ 96dpi
  container.style.background = "#fff";

  // Extract <body> contents from the built HTML so styles + markup render in-page
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  container.innerHTML =
    (styleMatch ? `<style>${styleMatch[1]}</style>` : "") +
    (bodyMatch ? bodyMatch[1] : html);
  document.body.appendChild(container);

  const safeName = (result.agent_name || "evaluation").replace(/[^a-z0-9-_]+/gi, "_");
  const filename = `SafeCouncil-Report-${safeName}.pdf`;

  try {
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
