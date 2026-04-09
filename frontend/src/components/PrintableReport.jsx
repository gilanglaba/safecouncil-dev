/**
 * PrintableReport — a print-optimized React rendering of an evaluation
 * result. Meant to be embedded inside any page that needs to offer a
 * "Download PDF" action. The host page renders this in a hidden container
 * and the print CSS (see ensurePrintStyles below) swaps it to visible
 * during browser print, hiding the normal page chrome.
 *
 * Flow:
 *   1. Host page mounts <PrintableReport result={...} /> inside a
 *      <div className="sc-printable">.
 *   2. Host page wraps its normal on-screen content in <div className="sc-screen">.
 *   3. Host calls window.print() on a user action.
 *   4. @media print CSS hides .sc-screen and shows .sc-printable, so the
 *      print preview displays this component and nothing else.
 *   5. User picks "Save as PDF" in the browser's print dialog.
 *
 * This module also exports ensurePrintStyles(), which injects the global
 * print stylesheet once into document.head (idempotent).
 */

import React, { useEffect } from "react";
import { theme } from "../theme";
import VerdictBadge from "./VerdictBadge";
import SeverityBadge from "./SeverityBadge";

// ── Global print stylesheet — injected once per page load ────────────────
const PRINT_STYLE_ID = "sc-print-style";
const PRINT_CSS = `
  /* On-screen: the printable container is invisible. The normal page
     content (inside .sc-screen) is visible. */
  .sc-printable { display: none; }

  @media print {
    /* Strip browser default margins and background so the PDF is edge-to-edge. */
    @page { size: A4 portrait; margin: 15mm 14mm; }
    html, body { background: #ffffff !important; }

    /* Hide the entire normal page chrome (nav, tabs, ResultsView, footer). */
    .sc-screen { display: none !important; }

    /* Show the printable report. */
    .sc-printable { display: block !important; }

    /* Keep color accents (verdict banners, score tiles, etc.) visible in
       the print preview — Chromium strips backgrounds by default otherwise. */
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Avoid awkward mid-card splits where possible. */
    .sc-avoid-break { page-break-inside: avoid; }
    .sc-page-break { page-break-before: always; }
  }
`;

export function ensurePrintStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = PRINT_STYLE_ID;
  el.textContent = PRINT_CSS;
  document.head.appendChild(el);
}

// ── Small helpers ─────────────────────────────────────────────────────────
function getScoreColor(score) {
  if (score >= 80) return theme.green;
  if (score >= 60) return theme.amber;
  return theme.red;
}

function getPriorityColor(priority) {
  if (priority === "P0" || priority === "P1") return theme.red;
  if (priority === "P2") return theme.amber;
  return theme.textTer;
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

function SectionTitle({ children }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: theme.violet,
        borderBottom: `2px solid ${theme.violet}`,
        paddingBottom: 3,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

const thStyle = {
  fontSize: 9,
  fontWeight: 700,
  color: theme.violet,
  padding: "6px 8px",
  borderBottom: `1px solid ${theme.violet}`,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  textAlign: "center",
};

const tdStyle = { padding: "5px 8px", verticalAlign: "top" };

// ── Main component ────────────────────────────────────────────────────────
export default function PrintableReport({ result }) {
  // Ensure the print stylesheet is installed on mount (idempotent).
  useEffect(() => {
    ensurePrintStyles();
  }, []);

  if (!result) return null;

  const verdict = result.verdict || {};
  const verdictColors = {
    APPROVE: { bg: theme.greenPale, text: theme.green, border: theme.greenBorder },
    REVIEW: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
    REJECT: { bg: theme.redPale, text: theme.red, border: theme.redBorder },
  };
  const vc = verdictColors[verdict.final_verdict] || verdictColors.REVIEW;
  const assessments = result.expert_assessments || [];
  const avgScore = assessments.length
    ? Math.round(assessments.reduce((s, a) => s + (a.overall_score || 0), 0) / assessments.length)
    : 0;

  // Group dimensions by category and build a per-dimension score map.
  const firstExpert = assessments[0];
  const categories = [];
  if (firstExpert) {
    const seen = new Set();
    for (const d of firstExpert.dimension_scores || []) {
      if (!seen.has(d.category)) {
        seen.add(d.category);
        categories.push(d.category);
      }
    }
  }
  const allDimensions = [];
  const scoreByDim = {};
  if (firstExpert) {
    for (const d of firstExpert.dimension_scores || []) {
      allDimensions.push({ dimension: d.dimension, category: d.category });
      scoreByDim[d.dimension] = assessments.map((a) => {
        const found = (a.dimension_scores || []).find((x) => x.dimension === d.dimension);
        return found ? found.score : null;
      });
    }
  }

  const mitigations = result.mitigations || [];
  const agreements = result.agreements || [];
  const disagreements = result.disagreements || [];

  return (
    <div
      style={{
        fontFamily: theme.fontSans,
        color: theme.text,
        background: "#ffffff",
        maxWidth: 820,
        margin: "0 auto",
        padding: "24px 28px",
        fontSize: 11,
        lineHeight: 1.5,
      }}
    >
      {/* ─── Brand header ─── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: theme.violet, letterSpacing: "-0.01em" }}>
          SafeCouncil{" "}
          <span style={{ color: theme.textTer, fontWeight: 400 }}>— AI Safety Evaluation Report</span>
        </div>
      </div>

      {/* ─── Agent header ─── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: `1px solid ${theme.borderSubtle}`,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>
            {result.agent_name || "Unknown Agent"}
          </div>
          <div style={{ fontSize: 11, color: theme.textSec, marginTop: 2 }}>
            Evaluation ID: <code style={{ fontFamily: theme.fontMono, fontSize: 10 }}>{result.eval_id || "—"}</code>
            {" · "}{formatTimestamp(result.timestamp)}{" · "}
            <span style={{ textTransform: "capitalize" }}>{result.orchestrator_method || "deliberative"}</span> method
          </div>
        </div>
        {result.audit && (
          <div style={{ textAlign: "right", fontSize: 10, color: theme.textTer, lineHeight: 1.5 }}>
            {result.audit.total_api_calls ? `${result.audit.total_api_calls} API calls` : ""}<br />
            {result.audit.total_tokens_used ? `${result.audit.total_tokens_used.toLocaleString()} tokens` : ""}<br />
            {result.audit.evaluation_time_seconds
              ? `${Math.round(result.audit.evaluation_time_seconds)}s · $${(result.audit.total_cost_usd || 0).toFixed(4)}`
              : ""}
          </div>
        )}
      </div>

      {/* ─── Verdict banner ─── */}
      <div
        className="sc-avoid-break"
        style={{
          background: vc.bg,
          border: `1.5px solid ${vc.border}`,
          borderRadius: 10,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <VerdictBadge verdict={verdict.final_verdict} size="xl" />
          <div>
            <div
              style={{
                fontSize: 9, fontWeight: 700, color: vc.text,
                textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2,
              }}
            >
              Council Final Verdict
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: getScoreColor(avgScore), fontFamily: theme.fontMono, lineHeight: 1 }}>
              {avgScore}
              <span style={{ fontSize: 14, color: vc.text, opacity: 0.7, fontWeight: 500 }}>/100</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: vc.text, fontFamily: theme.fontMono }}>
            {verdict.confidence != null ? `${verdict.confidence}%` : "—"}
          </div>
          <div style={{ fontSize: 9, color: vc.text, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Confidence
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: vc.text, fontFamily: theme.fontMono, marginTop: 4 }}>
            {verdict.agreement_rate != null ? `${verdict.agreement_rate}%` : "—"}
          </div>
          <div style={{ fontSize: 9, color: vc.text, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Agreement
          </div>
        </div>
      </div>

      {/* ─── Executive summary ─── */}
      {result.executive_summary && (
        <div
          className="sc-avoid-break"
          style={{
            background: theme.violetPale,
            borderLeft: `4px solid ${theme.violet}`,
            borderRadius: 8,
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 10, fontWeight: 700, color: theme.violet,
              textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6,
            }}
          >
            Executive Summary
          </div>
          <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.55 }}>{result.executive_summary}</div>
        </div>
      )}

      {/* ─── Mitigations ─── */}
      {mitigations.length > 0 && (
        <div className="sc-avoid-break" style={{ marginBottom: 16 }}>
          <SectionTitle>Required Mitigations</SectionTitle>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 10,
              border: `1px solid ${theme.border}`,
            }}
          >
            <thead>
              <tr style={{ background: theme.violetPale }}>
                <th style={thStyle}>Priority</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Action</th>
                <th style={thStyle}>Owner</th>
                <th style={thStyle}>Consensus</th>
              </tr>
            </thead>
            <tbody>
              {mitigations.map((m, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700, color: getPriorityColor(m.priority), width: 50 }}>
                    {m.priority || "P3"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ fontWeight: 500 }}>{m.text}</div>
                    {m.plain_summary && (
                      <div style={{ fontSize: 9, color: theme.textSec, fontStyle: "italic", marginTop: 2 }}>
                        {m.plain_summary}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", fontSize: 10, width: 80 }}>{m.owner || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center", fontSize: 9, color: theme.textTer, width: 110 }}>
                    {m.expert_consensus || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Score comparison ─── */}
      {assessments.length > 0 && (
        <div className="sc-page-break" style={{ marginBottom: 16 }}>
          <SectionTitle>Expert Score Comparison</SectionTitle>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 9,
              border: `1px solid ${theme.border}`,
            }}
          >
            <thead>
              <tr style={{ background: theme.violetPale }}>
                <th style={{ ...thStyle, textAlign: "left", width: "40%" }}>Dimension</th>
                {assessments.map((a, i) => (
                  <th key={i} style={{ ...thStyle, fontSize: 9 }}>
                    {a.expert_name}
                    <div style={{ fontSize: 11, fontWeight: 800, color: getScoreColor(a.overall_score), marginTop: 2, fontFamily: theme.fontMono }}>
                      {a.overall_score}/100
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <React.Fragment key={cat}>
                  <tr>
                    <td
                      colSpan={assessments.length + 1}
                      style={{
                        padding: "6px 8px 3px", fontSize: 9, fontWeight: 700,
                        color: theme.violet, textTransform: "uppercase", letterSpacing: "0.06em",
                      }}
                    >
                      {cat}
                    </td>
                  </tr>
                  {allDimensions
                    .filter((d) => d.category === cat)
                    .map((d) => {
                      const scores = scoreByDim[d.dimension] || [];
                      return (
                        <tr key={d.dimension} style={{ borderBottom: `1px solid ${theme.borderSubtle}` }}>
                          <td style={{ ...tdStyle, textAlign: "left", fontSize: 10, color: theme.textSec }}>
                            {d.dimension}
                          </td>
                          {scores.map((s, i) => (
                            <td
                              key={i}
                              style={{
                                ...tdStyle, textAlign: "center", fontFamily: theme.fontMono,
                                fontWeight: 700,
                                color: s != null ? getScoreColor(s) : theme.textTer,
                              }}
                            >
                              {s != null ? s : "—"}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Council consensus ─── */}
      {(agreements.length > 0 || disagreements.length > 0) && (
        <div className="sc-avoid-break" style={{ marginBottom: 16 }}>
          <SectionTitle>Council Consensus</SectionTitle>
          <div style={{ display: "flex", gap: 12 }}>
            {agreements.length > 0 && (
              <div
                style={{
                  flex: 1, background: theme.greenPale, border: `1px solid ${theme.greenBorder}`,
                  borderRadius: 8, padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.green, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  ✓ Agreements
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, lineHeight: 1.5 }}>
                  {agreements.map((a, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {typeof a === "string" ? a : a.point || JSON.stringify(a)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {disagreements.length > 0 && (
              <div
                style={{
                  flex: 1, background: theme.amberPale, border: `1px solid ${theme.amberBorder}`,
                  borderRadius: 8, padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: theme.amber, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  ⚡ Points of Contention
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10, lineHeight: 1.5 }}>
                  {disagreements.map((d, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {typeof d === "string"
                        ? d
                        : d.topic
                        ? `${d.topic}: ${d.resolution || ""}`
                        : JSON.stringify(d)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Per-expert findings ─── */}
      {assessments.some((a) => a.findings && a.findings.length > 0) && (
        <div className="sc-page-break" style={{ marginBottom: 16 }}>
          <SectionTitle>Key Findings by Expert</SectionTitle>
          {assessments.map((a, i) => (
            <div key={i} className="sc-avoid-break" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.text, marginBottom: 4 }}>
                {a.expert_name}
              </div>
              {(a.findings || []).slice(0, 6).map((f, j) => (
                <div
                  key={j}
                  style={{
                    borderLeft: `3px solid ${theme.border}`,
                    paddingLeft: 10, marginBottom: 6, fontSize: 10,
                  }}
                >
                  <div style={{ marginBottom: 2 }}>
                    <SeverityBadge severity={f.severity} /> <strong>{f.dimension}</strong>
                  </div>
                  <div style={{ color: theme.textSec, fontSize: 10, lineHeight: 1.4 }}>{f.text}</div>
                  {f.evidence && (
                    <div style={{ color: theme.textTer, fontSize: 9, fontStyle: "italic", marginTop: 2 }}>
                      Evidence: {f.evidence}
                      {f.framework_ref && <strong> [{f.framework_ref}]</strong>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ─── Footer ─── */}
      <div
        style={{
          marginTop: 24, paddingTop: 10,
          borderTop: `1px solid ${theme.borderSubtle}`,
          display: "flex", justifyContent: "space-between",
          fontSize: 9, color: theme.textTer,
        }}
      >
        <div>SafeCouncil — Council of Experts AI Safety Evaluation Platform</div>
        <div>Generated {new Date().toLocaleString()}</div>
      </div>
    </div>
  );
}
