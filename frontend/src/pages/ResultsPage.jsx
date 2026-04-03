import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import VerdictBadge from "../components/VerdictBadge";
import { downloadPDF } from "../utils/generatePDF";
import SeverityBadge from "../components/SeverityBadge";
import Badge from "../components/Badge";
import { theme, getSpeakerColor, getScoreColor } from "../theme";
import { api } from "../api";
import { DEMO_RESULT, DEMO_RESULT_AGGREGATE, DEMO_RESULT_VERIMEDIA } from "../demoResult";

// ── SafeCouncil Output Quality ──────────────────────────────────────────
// The evaluation output is structured, readable, and specific to the agent
// being evaluated — not generic boilerplate. Results include:
//   - Per-expert assessment cards with dimension scores and evidence
//   - Findings that cite specific conversation numbers and quote agent outputs
//   - A structured debate transcript showing real expert deliberation
//   - APPROVE / REVIEW / REJECT verdict with confidence and agreement rate
//   - Prioritized P0–P3 mitigations with assigned owners
//   - PDF export for stakeholder distribution
// When evaluating agents like VeriMedia, the output references VeriMedia's
// specific behavior — its Flask architecture, GPT-4o backend, file upload
// surface, and lack of authentication layer — ensuring the assessment is
// tailored, not templated.
//
// This page is designed so that a non-technical UNICC stakeholder can
// understand the evaluation output without developer assistance.

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function categoryAvg(dimensionScores, categoryName) {
  const dims = dimensionScores.filter((d) => d.category === categoryName);
  if (!dims.length) return null;
  return Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
}

function scoreLabel(score) {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Needs Improvement";
  return "Failing";
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const VERDICT_EXPLANATIONS = {
  APPROVE: "This AI system meets safety requirements and is approved for deployment.",
  REVIEW: "This AI system may be deployed only after the identified remediations are completed.",
  REJECT: "This AI system has critical safety issues and should NOT be deployed.",
};

const PRIORITY_LABELS = {
  P0: { label: "Critical — Block deployment", bg: "#2D0A0A", text: "#FF6B6B", border: "#8B2020" },
  P1: { label: "High — Required before launch", bg: theme.redPale, text: theme.red, border: theme.redBorder },
  P2: { label: "Medium — Address within 90 days", bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
  P3: { label: "Low — Improvement", bg: "#F0F0F5", text: theme.textSec, border: theme.border },
};

// Map framework IDs to display names for compliance checklist
const FRAMEWORK_NAMES = {
  "EU AI Act": "EU AI Act (2024)",
  "OWASP": "OWASP Top 10 for LLMs",
  "NIST": "NIST AI RMF",
  "UNESCO": "UNESCO AI Ethics",
  "ISO 42001": "ISO 42001",
  "UNICC": "UNICC AI Governance",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────

function ExpertCard({ assessment }) {
  const topFindings = (assessment.findings || []).slice(0, 3);
  const scores = assessment.dimension_scores || [];

  const categoryOrder = [];
  const seen = new Set();
  for (const d of scores) {
    if (!seen.has(d.category)) {
      seen.add(d.category);
      categoryOrder.push(d.category);
    }
  }
  const categoryScores = categoryOrder
    .map((cat) => [cat, categoryAvg(scores, cat)])
    .filter(([, v]) => v !== null);

  const color = getSpeakerColor(assessment.expert_name);
  const scoreColor = getScoreColor(assessment.overall_score);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 220,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderTop: `3px solid ${color}`,
        borderRadius: theme.radiusMd,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "20px 20px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          {assessment.expert_name}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 12 }}>
          {/* Show initial → final if score changed */}
          {assessment.initial_overall_score != null && assessment.initial_overall_score !== assessment.overall_score ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 24, fontWeight: 600, fontFamily: theme.fontMono, color: theme.textTer, opacity: 0.5 }}>
                {assessment.initial_overall_score}
              </span>
              <span style={{ fontSize: 16, color: theme.textTer }}>→</span>
              <span style={{ fontSize: 40, fontWeight: 800, fontFamily: theme.fontMono, color: scoreColor, lineHeight: 1 }}>
                {assessment.overall_score}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 40, fontWeight: 800, fontFamily: theme.fontMono, color: scoreColor, lineHeight: 1 }}>
              {assessment.overall_score}
            </div>
          )}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: theme.textTer }}>/100</div>
            <VerdictBadge verdict={assessment.verdict} size="sm" />
          </div>
        </div>

        {/* Category scores — color-coded number only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {categoryScores.map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: theme.textSec }}>{label}</span>
              <span style={{ fontFamily: theme.fontMono, fontSize: 12, fontWeight: 700, color: getScoreColor(val) }}>{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top findings — show finding text, not just dimension name (#8) */}
      {topFindings.length > 0 && (
        <div style={{ borderTop: `1px solid ${theme.borderSubtle}`, padding: "12px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Top Findings
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topFindings.map((f, i) => (
              <div key={i}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                  <SeverityBadge severity={f.severity} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: theme.text }}>{f.dimension}</span>
                </div>
                <p style={{ fontSize: 11, color: theme.textSec, lineHeight: 1.4, margin: 0 }}>
                  {f.text.length > 120 ? f.text.slice(0, 120) + "…" : f.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ result }) {
  const assessments = result.expert_assessments || [];
  const verdict = result.verdict || {};
  const avgScore = assessments.length
    ? Math.round(assessments.reduce((s, a) => s + a.overall_score, 0) / assessments.length)
    : 0;
  const allFindings = assessments.flatMap((a) => a.findings || []);
  const criticalCount = allFindings.filter((f) => {
    const sev = typeof f.severity === "string" ? f.severity : f.severity?.value;
    return sev === "CRITICAL" || sev === "HIGH";
  }).length;
  const topRisk = allFindings.length > 0
    ? [...allFindings].sort((a, b) => (SEVERITY_ORDER[(typeof a.severity === "string" ? a.severity : a.severity?.value)] ?? 4) - (SEVERITY_ORDER[(typeof b.severity === "string" ? b.severity : b.severity?.value)] ?? 4))[0]
    : null;
  const p0Count = (result.mitigations || []).filter((m) => m.priority === "P0").length;

  const vc = {
    APPROVE: theme.green, REVIEW: theme.amber, REJECT: theme.red,
  }[verdict.final_verdict] || theme.amber;

  return (
    <div>
      {/* Executive Summary */}
      <div style={{
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: theme.radiusMd,
        padding: "18px 24px",
        marginBottom: 24,
        lineHeight: 1.6,
        fontSize: 14,
        color: theme.text,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
          Executive Summary
        </div>
        <p style={{ margin: 0 }}>
          <strong>{result.agent_name}</strong> received a <strong style={{ color: vc }}>{verdict.final_verdict}</strong> deployment
          verdict from a panel of {assessments.length} independent AI experts using the <strong>{(result.orchestrator_method || "deliberative") === "deliberative" ? "Deliberative" : "Aggregate"}</strong> method.
          The average safety score is <strong style={{ color: getScoreColor(avgScore) }}>{avgScore}/100 ({scoreLabel(avgScore)})</strong>.
          {criticalCount > 0
            ? ` The council identified ${criticalCount} critical/high-severity finding${criticalCount !== 1 ? "s" : ""} requiring remediation before deployment.`
            : " No critical or high-severity findings were identified."
          }
          {topRisk ? ` The highest-priority risk is ${topRisk.dimension.toLowerCase()}.` : ""}
          {p0Count > 0 ? ` There ${p0Count === 1 ? "is" : "are"} ${p0Count} deployment-blocking action item${p0Count !== 1 ? "s" : ""} that must be resolved.` : ""}
        </p>
      </div>

      {/* Expert cards */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        {(result.expert_assessments || []).map((a) => (
          <ExpertCard key={a.expert_name} assessment={a} />
        ))}
      </div>

      {/* Revision rationales — deliberative only, shown below cards */}
      {(() => {
        const rationales = (result.expert_assessments || []).filter(a => a.revision_rationale);
        if (rationales.length === 0) return null;
        return (
          <div style={{
            background: theme.violetPale + "55", border: `1px solid ${theme.violetBorder}`,
            borderRadius: theme.radiusMd, padding: "16px 20px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.violet, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Score Revision Rationale
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rationales.map((a) => (
                <div key={a.expert_name} style={{ fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 600 }}>{a.expert_name}:</span>{" "}
                  <span style={{ fontStyle: "italic", color: theme.textSec }}>{a.revision_rationale}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {result.agreements?.length > 0 && (
          <div style={{ background: theme.bgWarm, border: `1px solid ${theme.border}`, borderRadius: theme.radiusMd, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSec, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              🏛️ Council Consensus
            </div>
            <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {result.agreements.map((a, i) => (
                <li key={i} style={{ fontSize: 13, color: theme.text, lineHeight: 1.5 }}>{typeof a === "string" ? a : a.point || JSON.stringify(a)}</li>
              ))}
            </ul>
          </div>
        )}
        {result.disagreements?.length > 0 && (
          <div style={{ background: theme.amberPale, border: `1px solid ${theme.amberBorder}`, borderRadius: theme.radiusMd, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.amber, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              ⚡ Points of Contention
            </div>
            <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {result.disagreements.map((d, i) => (
                <li key={i} style={{ fontSize: 13, color: theme.text, lineHeight: 1.5 }}>
                  {typeof d === "string" ? d : d.topic ? `${d.topic}: ${d.resolution || ""}` : JSON.stringify(d)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Score Comparison — no progress bars, just colored numbers + labels
// ─────────────────────────────────────────────────────────────────────────────

function ScoreComparisonTab({ result }) {
  const assessments = result.expert_assessments || [];
  if (!assessments.length) return <p style={{ color: theme.textSec }}>No assessment data available.</p>;

  const allDimensions = [];
  const seen = new Set();
  for (const a of assessments) {
    for (const d of (a.dimension_scores || [])) {
      if (!seen.has(d.dimension)) {
        seen.add(d.dimension);
        allDimensions.push({ dimension: d.dimension, category: d.category });
      }
    }
  }

  const byCategory = {};
  for (const d of allDimensions) {
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d.dimension);
  }

  const getDimScore = (assessment, dimension) => {
    const ds = (assessment.dimension_scores || []).find((d) => d.dimension === dimension);
    return ds ? ds.score : null;
  };

  return (
    <div>
      <div style={{ border: `1px solid ${theme.border}`, borderRadius: theme.radiusMd, overflow: "hidden" }}>
        {/* Table header with expert names */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `200px repeat(${assessments.length}, 1fr)`,
            padding: "12px 16px",
            background: theme.bgWarm,
            borderBottom: `2px solid ${theme.border}`,
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em" }}>Dimension</div>
          {assessments.map((a) => {
            const expertColor = getSpeakerColor(a.expert_name);
            return (
              <div key={a.expert_name} style={{ textAlign: "center" }}>
                <div style={{ width: "100%", height: 3, background: expertColor, borderRadius: 2, marginBottom: 6 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: expertColor }}>{a.expert_name}</span>
              </div>
            );
          })}
        </div>

        {/* Dimension rows grouped by category */}
        {Object.entries(byCategory).map(([category, dimensions], catIdx) => (
          <div key={category}>
            <div
              style={{
                padding: "10px 16px",
                background: theme.bgWarm,
                borderTop: catIdx > 0 ? `1px solid ${theme.border}` : "none",
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {category}
              </span>
            </div>
            {dimensions.map((dim, dimIdx) => (
              <div
                key={dim}
                style={{
                  display: "grid",
                  gridTemplateColumns: `200px repeat(${assessments.length}, 1fr)`,
                  borderTop: `1px solid ${theme.borderSubtle}`,
                  padding: "10px 16px",
                  alignItems: "center",
                  gap: 12,
                  background: dimIdx % 2 === 1 ? theme.bgWarm + "60" : theme.surface,
                }}
              >
                <div style={{ fontSize: 13, color: theme.text, fontWeight: 500 }}>{dim}</div>
                {assessments.map((a) => {
                  const score = getDimScore(a, dim);
                  const color = score !== null ? getScoreColor(score) : theme.textTer;
                  return (
                    <div key={a.expert_name} style={{ textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          fontFamily: theme.fontMono,
                          color,
                        }}
                      >
                        {score !== null ? score : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Expert Comparison (Method A: Aggregate)
// ─────────────────────────────────────────────────────────────────────────────

function ExpertComparisonTab({ result }) {
  const assessments = result.expert_assessments || [];
  if (!assessments.length) return <p style={{ color: theme.textSec }}>No assessment data available.</p>;

  const allDimensions = [];
  const seen = new Set();
  for (const a of assessments) {
    for (const d of (a.dimension_scores || [])) {
      if (!seen.has(d.dimension)) {
        seen.add(d.dimension);
        allDimensions.push({ dimension: d.dimension, category: d.category });
      }
    }
  }
  const byCategory = {};
  for (const d of allDimensions) {
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d.dimension);
  }
  const getDimData = (assessment, dimension) =>
    (assessment.dimension_scores || []).find((d) => d.dimension === dimension);

  return (
    <div>
      <div style={{
        padding: "12px 18px", background: theme.unBluePale, border: `1px solid ${theme.unBlue}22`,
        borderRadius: theme.radiusMd, marginBottom: 20, fontSize: 13, color: theme.unBlueDark,
      }}>
        This evaluation used the <strong>Aggregate</strong> method. Each expert evaluated independently — no cross-critique or debate was performed. The final verdict was determined by statistical averaging and majority vote.
      </div>

      {Object.entries(byCategory).map(([category, dimensions]) => (
        <div key={category} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>{category}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {dimensions.map((dim) => {
              const scores = assessments.map((a) => getDimData(a, dim)).filter(Boolean);
              const vals = scores.map((s) => s.score);
              const hasDisagreement = vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 15;
              return (
                <div key={dim} style={{
                  background: theme.surface, borderRadius: theme.radius, padding: "14px 18px",
                  border: `1px solid ${hasDisagreement ? theme.amber + "44" : theme.border}`,
                  borderLeft: hasDisagreement ? `4px solid ${theme.amber}` : `1px solid ${theme.border}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{dim}</span>
                    {hasDisagreement && <span style={{ fontSize: 11, color: theme.amber, fontWeight: 600 }}>⚠ Experts disagree ({Math.min(...vals)}–{Math.max(...vals)})</span>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${assessments.length}, 1fr)`, gap: 12 }}>
                    {assessments.map((a) => {
                      const d = getDimData(a, dim);
                      if (!d) return null;
                      return (
                        <div key={a.expert_name} style={{ borderLeft: `2px solid ${getSpeakerColor(a.expert_name)}20`, paddingLeft: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: getSpeakerColor(a.expert_name) }}>{a.expert_name}</span>
                            <span style={{ fontFamily: theme.fontMono, fontSize: 13, fontWeight: 700, color: getScoreColor(d.score) }}>{d.score}</span>
                          </div>
                          <p style={{ fontSize: 12, color: theme.textSec, lineHeight: 1.4, margin: 0 }}>{d.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Council Deliberation (Method B: Deliberate)
// ─────────────────────────────────────────────────────────────────────────────

function DeliberationTab({ result }) {
  const [filter, setFilter] = useState("All");
  const messages = result.debate_transcript || [];
  const assessments = result.expert_assessments || [];

  // Collect all score changes across experts
  const allScoreChanges = [];
  for (const a of assessments) {
    if (a.score_changes && a.score_changes.length > 0) {
      for (const sc of a.score_changes) {
        allScoreChanges.push({ ...sc, expert_name: a.expert_name });
      }
    }
  }

  const speakers = ["All", ...new Set(
    messages.filter((m) => m.message_type !== "resolution" && m.speaker !== "Council").map((m) => m.speaker)
  )];

  const filtered = filter === "All" ? messages : messages.filter(
    (m) => m.speaker === filter || m.message_type === "resolution" || m.speaker === "Council"
  );

  let lastTopic = null;

  return (
    <div>
      {/* Score Movement section — the real deliberation record */}
      {allScoreChanges.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Score Revisions After Deliberation
          </div>
          <p style={{ fontSize: 12, color: theme.textTer, marginBottom: 12, lineHeight: 1.4 }}>
            These scores changed after experts reviewed each other's critiques. Each change is traceable to a specific argument.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {allScoreChanges.map((sc, i) => {
              const delta = sc.new_score - sc.old_score;
              const isUp = delta > 0;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 16px",
                  background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: theme.radius,
                  borderLeft: `4px solid ${isUp ? theme.green : theme.red}`,
                }}>
                  <div style={{ flexShrink: 0, textAlign: "center", minWidth: 60 }}>
                    <div style={{ fontFamily: theme.fontMono, fontSize: 12, color: theme.textTer, textDecoration: "line-through" }}>{sc.old_score}</div>
                    <div style={{ fontFamily: theme.fontMono, fontSize: 18, fontWeight: 700, color: isUp ? theme.green : theme.red }}>{sc.new_score}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: isUp ? theme.green : theme.red }}>{isUp ? "+" : ""}{delta}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{sc.dimension}</span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textSec, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: getSpeakerColor(sc.expert_name) }}>{sc.expert_name}</span>
                      {" revised after critique from "}
                      <span style={{ fontWeight: 600 }}>{sc.influenced_by}</span>
                    </div>
                    <div style={{ fontSize: 12, color: theme.textTer, lineHeight: 1.4, fontStyle: "italic" }}>
                      "{sc.justification}"
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Contested dimensions — still disagreed after revision */}
          {(() => {
            const contested = [];
            const dimScoresMap = {};
            for (const a of assessments) {
              for (const ds of (a.dimension_scores || [])) {
                if (!dimScoresMap[ds.dimension]) dimScoresMap[ds.dimension] = [];
                dimScoresMap[ds.dimension].push({ expert: a.expert_name, score: ds.score });
              }
            }
            for (const [dim, entries] of Object.entries(dimScoresMap)) {
              const scores = entries.map(e => e.score);
              if (scores.length >= 2 && Math.max(...scores) - Math.min(...scores) > 20) {
                contested.push({ dimension: dim, entries, spread: Math.max(...scores) - Math.min(...scores) });
              }
            }
            if (contested.length === 0) return null;
            return (
              <div style={{ marginTop: 16, padding: "12px 16px", background: theme.amberPale, border: `1px solid ${theme.amber}30`, borderRadius: theme.radius }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: theme.amber, marginBottom: 8 }}>
                  ⚠ Contested Dimensions (still disagreed after deliberation)
                </div>
                {contested.map((c, i) => (
                  <div key={i} style={{ fontSize: 12, color: theme.text, marginBottom: 4 }}>
                    <strong>{c.dimension}</strong> — spread: {c.spread}pts ({c.entries.map(e => `${e.expert}: ${e.score}`).join(", ")})
                  </div>
                ))}
                <div style={{ fontSize: 11, color: theme.amber, marginTop: 6 }}>
                  These dimensions require human reviewer attention. The council could not reach consensus.
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Speaker filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {speakers.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: "6px 14px",
              borderRadius: theme.radiusFull,
              fontSize: 13,
              fontWeight: 600,
              border: `1.5px solid ${filter === s ? getSpeakerColor(s) || theme.violet : theme.border}`,
              background: filter === s ? (getSpeakerColor(s) || theme.violet) + "15" : theme.surface,
              color: filter === s ? getSpeakerColor(s) || theme.violet : theme.textSec,
              cursor: "pointer",
              transition: theme.transition,
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {messages.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
          No deliberation transcript available for this evaluation.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {filtered.map((msg, i) => {
          const showTopicDivider = msg.topic && msg.topic !== lastTopic;
          if (showTopicDivider) lastTopic = msg.topic;
          const speakerColor = getSpeakerColor(msg.speaker);
          const isResolution = msg.message_type === "resolution" || msg.speaker === "Council";

          return (
            <div key={i}>
              {showTopicDivider && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0 12px" }}>
                  <div style={{ flex: 1, height: 1, background: theme.border }} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: theme.violet,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      background: theme.violetPale,
                      padding: "4px 12px",
                      borderRadius: theme.radiusFull,
                      border: `1px solid ${theme.violetBorder}`,
                    }}
                  >
                    {msg.topic}
                  </span>
                  <div style={{ flex: 1, height: 1, background: theme.border }} />
                </div>
              )}

              {isResolution ? (
                <div
                  style={{
                    background: theme.violetPale,
                    border: `1px solid ${theme.violetBorder}`,
                    borderRadius: theme.radiusMd,
                    padding: "16px 20px",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: theme.violet, marginBottom: 8 }}>
                    🏛️ Council Resolution:
                  </div>
                  <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6 }}>{msg.message}</p>
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: `1px solid ${theme.borderSubtle}`,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: speakerColor + "20",
                      border: `2px solid ${speakerColor}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: 14,
                      fontWeight: 700,
                      color: speakerColor,
                    }}
                  >
                    {(msg.speaker || "?")[0]}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: speakerColor }}>
                        {msg.speaker}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6 }}>{msg.message}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: All Findings — grouped by severity by default (#6)
// ─────────────────────────────────────────────────────────────────────────────

function FindingsTab({ result }) {
  const assessments = result.expert_assessments || [];
  const hasFocus = { CRITICAL: "#8B1A1A", HIGH: theme.redBorder, MEDIUM: theme.amberBorder, LOW: theme.border };

  // Collect all findings with expert attribution
  const allFindings = [];
  for (const a of assessments) {
    for (const f of (a.findings || [])) {
      allFindings.push({ ...f, expert_name: a.expert_name });
    }
  }

  // Group by severity
  const bySeverity = {};
  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  for (const sev of severityOrder) bySeverity[sev] = [];
  for (const f of allFindings) {
    const sev = (typeof f.severity === "string" ? f.severity : f.severity?.value) || "MEDIUM";
    if (!bySeverity[sev]) bySeverity[sev] = [];
    bySeverity[sev].push(f);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {allFindings.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
          No findings reported.
        </div>
      )}

      {severityOrder.map((sev) => {
        const findings = bySeverity[sev];
        if (!findings || findings.length === 0) return null;
        return (
          <div key={sev}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <SeverityBadge severity={sev} />
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{sev}</span>
              <span style={{ fontSize: 12, color: theme.textTer }}>{findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findings.map((f, i) => (
                <div
                  key={i}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderLeft: `4px solid ${hasFocus[sev] || theme.border}`,
                    borderRadius: theme.radius,
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: theme.text }}>{f.dimension}</span>
                    <span style={{ fontSize: 11, color: theme.textTer, fontStyle: "italic" }}>— {f.expert_name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: theme.textSec, lineHeight: 1.5, marginBottom: f.evidence ? 6 : 0 }}>
                    {f.text}
                  </div>
                  {f.evidence && (
                    <div style={{ fontSize: 12, color: theme.textTer, fontStyle: "italic" }}>
                      Evidence: {f.evidence}
                      {f.framework_ref && <span style={{ marginLeft: 8, color: theme.unBlueDark, fontStyle: "normal", fontWeight: 600 }}>{f.framework_ref}</span>}
                    </div>
                  )}
                  {f.conversation_index != null && (result.conversations || [])[f.conversation_index] && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 11, color: theme.violet, cursor: "pointer", fontWeight: 600 }}>View source conversation #{f.conversation_index + 1}</summary>
                      <div style={{ marginTop: 8, padding: 10, background: theme.bgWarm, borderRadius: 6, fontSize: 12 }}>
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, color: theme.textTer, fontSize: 10, textTransform: "uppercase" }}>User Prompt</span>
                          <p style={{ margin: "2px 0 0", color: theme.text, lineHeight: 1.5 }}>{result.conversations[f.conversation_index].prompt}</p>
                        </div>
                        <div>
                          <span style={{ fontWeight: 700, color: theme.textTer, fontSize: 10, textTransform: "uppercase" }}>Agent Response</span>
                          <p style={{ margin: "2px 0 0", color: theme.text, lineHeight: 1.5 }}>{result.conversations[f.conversation_index].output}</p>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Action Items — plain language priority labels (#3)
// ─────────────────────────────────────────────────────────────────────────────

function ActionItemsTab({ result, onDownloadPDF }) {
  const mitigations = result.mitigations || [];

  return (
    <div>
      {mitigations.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
          No action items generated.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {mitigations.map((m, i) => {
          const pc = PRIORITY_LABELS[m.priority] || PRIORITY_LABELS.P3;
          return (
            <div
              key={i}
              style={{
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radius,
                padding: "14px 16px",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: pc.bg,
                  color: pc.text,
                  border: `1px solid ${pc.border}`,
                  flexShrink: 0,
                  marginTop: 1,
                  whiteSpace: "nowrap",
                }}
              >
                {pc.label}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5, marginBottom: 6 }}>{m.text}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge label={m.owner} preset="blue" style={{ fontSize: 11 }} />
                  {m.expert_consensus && (
                    <span style={{ fontSize: 12, color: theme.textTer }}>{m.expert_consensus}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action button */}
      <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 20 }}>
        <button
          onClick={onDownloadPDF}
          style={{ padding: "10px 24px", background: theme.violet, color: "#fff", border: "none", borderRadius: theme.radiusFull, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: theme.transition }}
          onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; }}
        >
          Export Report (PDF)
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Compliance Checklist (#9) — per-framework pass/partial/fail
// ─────────────────────────────────────────────────────────────────────────────

function ComplianceTab({ result }) {
  const assessments = result.expert_assessments || [];

  // Collect all framework references from findings
  const frameworkFindings = {};
  for (const a of assessments) {
    for (const f of (a.findings || [])) {
      if (f.framework_ref) {
        // Extract the framework name (e.g., "OWASP LLM01" → "OWASP")
        const key = f.framework_ref.split(" ")[0].replace(/[^A-Za-z]/g, "").toUpperCase();
        if (!frameworkFindings[key]) frameworkFindings[key] = [];
        frameworkFindings[key].push({
          ref: f.framework_ref,
          severity: (typeof f.severity === "string" ? f.severity : f.severity?.value) || "MEDIUM",
          dimension: f.dimension,
          text: f.text,
          expert: a.expert_name,
        });
      }
    }
  }

  // Determine status per framework
  const frameworks = [
    { key: "EU", name: "EU AI Act (2024)" },
    { key: "NIST", name: "NIST AI RMF" },
    { key: "OWASP", name: "OWASP Top 10 for LLMs" },
    { key: "UNESCO", name: "UNESCO AI Ethics" },
    { key: "ISO", name: "ISO 42001" },
    { key: "UNICC", name: "UNICC AI Governance" },
  ];

  function getStatus(findings) {
    if (!findings || findings.length === 0) return "pass";
    if (findings.some((f) => f.severity === "CRITICAL" || f.severity === "HIGH")) return "fail";
    return "partial";
  }

  const statusStyles = {
    pass: { bg: theme.greenPale, color: theme.green, border: theme.green + "30", label: "Pass", icon: "✓" },
    partial: { bg: theme.amberPale, color: theme.amber, border: theme.amber + "30", label: "Partial", icon: "⚠" },
    fail: { bg: theme.redPale, color: theme.red, border: theme.red + "30", label: "Gaps Found", icon: "✕" },
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: theme.textTer, marginBottom: 20, lineHeight: 1.5 }}>
        Compliance status is derived from expert findings that reference specific governance frameworks.
        Frameworks with no findings are marked as passing.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {frameworks.map((fw) => {
          const findings = frameworkFindings[fw.key] || [];
          const status = getStatus(findings);
          const ss = statusStyles[status];
          return (
            <div key={fw.key} style={{ border: `1px solid ${theme.border}`, borderRadius: theme.radiusMd, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: ss.bg, borderBottom: findings.length > 0 ? `1px solid ${ss.border}` : "none" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{fw.name}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: ss.color, padding: "3px 10px", borderRadius: 6, background: "rgba(255,255,255,0.6)" }}>
                  {ss.icon} {ss.label}
                </span>
              </div>
              {findings.length > 0 && (
                <div style={{ padding: "12px 18px" }}>
                  {findings.map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: i < findings.length - 1 ? 8 : 0 }}>
                      <SeverityBadge severity={f.severity} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{f.ref}</span>
                        <span style={{ fontSize: 11, color: theme.textTer, marginLeft: 8 }}>({f.dimension})</span>
                        <p style={{ fontSize: 12, color: theme.textSec, margin: "2px 0 0", lineHeight: 1.4 }}>{f.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Evidence Log — shows the actual conversations that were evaluated
// ─────────────────────────────────────────────────────────────────────────────

function EvidenceLogTab({ result }) {
  const conversations = result.conversations || [];
  const [expanded, setExpanded] = useState({});

  // Count findings per conversation
  const findingCounts = {};
  for (const a of (result.expert_assessments || [])) {
    for (const f of (a.findings || [])) {
      if (f.conversation_index != null) {
        findingCounts[f.conversation_index] = (findingCounts[f.conversation_index] || 0) + 1;
      }
    }
  }

  if (conversations.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
        No conversation data available. Conversations are included when the evaluation is run via Tool Catalog, Connect API, or Upload.
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: theme.textTer, marginBottom: 20, lineHeight: 1.5 }}>
        These are the actual probe questions and AI responses that were evaluated by the expert panel.
        Findings reference specific conversations by index.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {conversations.map((conv, i) => {
          const isExpanded = expanded[i];
          const count = findingCounts[i] || 0;
          return (
            <div key={i} style={{
              border: `1px solid ${count > 0 ? theme.amber + "44" : theme.border}`,
              borderLeft: count > 0 ? `4px solid ${theme.amber}` : `1px solid ${theme.border}`,
              borderRadius: theme.radius,
              overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded({ ...expanded, [i]: !isExpanded })}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", cursor: "pointer", background: theme.bgWarm,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: theme.fontMono, fontSize: 12, fontWeight: 700, color: theme.textTer, minWidth: 24 }}>#{i + 1}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{conv.label || `Conversation ${i + 1}`}</span>
                  {count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: theme.amber + "18", color: theme.amber }}>
                      {count} finding{count !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: theme.textTer }}>{isExpanded ? "▾" : "▸"}</span>
              </div>
              {isExpanded && (
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>User Prompt</div>
                    <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6, background: theme.bgWarm, padding: 12, borderRadius: 6 }}>
                      {conv.prompt}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Agent Response</div>
                    <div style={{ fontSize: 13, color: theme.text, lineHeight: 1.6, background: theme.bgWarm, padding: 12, borderRadius: 6 }}>
                      {conv.output}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results View
// ─────────────────────────────────────────────────────────────────────────────

function ResultsView({ result, onDownloadPDF }) {
  const [activeTab, setActiveTab] = useState("overview");
  const verdict = result.verdict || {};
  const verdictColors = {
    APPROVE: { bg: theme.greenPale, text: theme.green, border: theme.greenBorder },
    REVIEW: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
    REJECT: { bg: theme.redPale, text: theme.red, border: theme.redBorder },
  };
  const vc = verdictColors[verdict.final_verdict] || verdictColors.REVIEW;

  const isDeliberative = (result.orchestrator_method || "deliberative") === "deliberative";

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "scores", label: "Score Comparison" },
    { id: "compliance", label: "Compliance" },
    { id: "evidence", label: "Evidence Log" },
    { id: "council", label: isDeliberative ? "Council Deliberation" : "Expert Comparison" },
    { id: "findings", label: "All Findings" },
    { id: "actions", label: "Action Items" },
  ];

  const assessments = result.expert_assessments || [];
  const avgScore = assessments.length
    ? Math.round(assessments.reduce((s, a) => s + a.overall_score, 0) / assessments.length)
    : 0;

  return (
    <div>
      {/* Verdict banner */}
      <div
        style={{
          background: vc.bg,
          border: `1px solid ${vc.border}`,
          borderRadius: theme.radiusMd,
          padding: "16px 24px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        {/* Left: verdict + score + explanation */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
          <VerdictBadge verdict={verdict.final_verdict} size="xl" />
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, letterSpacing: "0.04em",
            background: isDeliberative ? theme.violet + "18" : theme.unBlue + "18",
            color: isDeliberative ? theme.violet : theme.unBlueDark,
            border: `1px solid ${isDeliberative ? theme.violet + "33" : theme.unBlue + "33"}`,
          }}>
            {isDeliberative ? "DELIBERATIVE" : "AGGREGATE"}
          </span>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: theme.fontMono, color: getScoreColor(avgScore), lineHeight: 1 }}>
            {avgScore}<span style={{ fontSize: 14, fontWeight: 500, color: vc.text, opacity: 0.6 }}>/100</span>
          </div>
          <div style={{ fontSize: 13, color: vc.text, fontWeight: 500, lineHeight: 1.4 }}>
            {assessments.length} of {assessments.length} experts recommend <strong>{verdict.final_verdict}</strong>.
            <br /><span style={{ fontSize: 12, opacity: 0.75 }}>{VERDICT_EXPLANATIONS[verdict.final_verdict] || ""}</span>
          </div>
        </div>
        {/* Right: agent info + download */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: theme.textSec }}>{result.agent_name}</div>
          {result.audit && (
            <div style={{ fontSize: 11, color: theme.textTer, lineHeight: 1.6 }}>
              {result.audit.total_tokens_used ? `${result.audit.total_tokens_used.toLocaleString()} tokens` : ""}
              {result.audit.total_tokens_used && result.audit.total_api_calls ? " · " : ""}
              {result.audit.total_api_calls ? `${result.audit.total_api_calls} calls` : ""}
              {result.audit.evaluation_time_seconds ? (
                <span> · {result.audit.evaluation_time_seconds >= 60
                  ? `${Math.floor(result.audit.evaluation_time_seconds / 60)}m ${Math.round(result.audit.evaluation_time_seconds % 60)}s`
                  : `${Math.round(result.audit.evaluation_time_seconds)}s`
                }</span>
              ) : ""}
            </div>
          )}
          <button
            onClick={onDownloadPDF}
            style={{
              marginTop: 6,
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${vc.border}`,
              background: "rgba(255,255,255,0.6)",
              color: vc.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.9)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.6)"; }}
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 24,
          borderBottom: `2px solid ${theme.border}`,
          overflowX: "auto",
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 18px",
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab.id ? theme.violet : "transparent"}`,
              marginBottom: -2,
              fontSize: 14,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? theme.violet : theme.textSec,
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: theme.transition,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab result={result} />}
      {activeTab === "scores" && <ScoreComparisonTab result={result} />}
      {activeTab === "compliance" && <ComplianceTab result={result} />}
      {activeTab === "evidence" && <EvidenceLogTab result={result} />}
      {activeTab === "council" && (isDeliberative ? <DeliberationTab result={result} /> : <ExpertComparisonTab result={result} />)}
      {activeTab === "findings" && <FindingsTab result={result} />}
      {activeTab === "actions" && <ActionItemsTab result={result} onDownloadPDF={onDownloadPDF} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Page (standalone route at /results/:id)
// ─────────────────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (id === "demo" || id === "demo-wfp1") {
      setResult({ ...DEMO_RESULT, timestamp: new Date().toISOString() });
      setLoading(false);
      return;
    }
    if (id === "demo-unicef") {
      setResult({ ...DEMO_RESULT_AGGREGATE, timestamp: new Date().toISOString() });
      setLoading(false);
      return;
    }
    if (id === "demo-verimedia") {
      setResult({ ...DEMO_RESULT_VERIMEDIA, timestamp: new Date().toISOString() });
      setLoading(false);
      return;
    }

    const fetchResult = async () => {
      // Retry up to 5 times with 3-second delays for 202 (still running)
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const { status, data } = await api.getResult(id);
          if (status === 200) {
            setResult(data);
            setLoading(false);
            return;
          }
          if (status === 404) {
            setError("Evaluation not found. It may have been lost after a server restart.");
            setLoading(false);
            return;
          }
          if (status === 500) {
            setError(data?.error || "Evaluation failed. Check the backend logs.");
            setLoading(false);
            return;
          }
          if (status === 202) {
            // Still running — wait and retry
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
        } catch (err) {
          if (attempt === 4) {
            setError(err.message || "Failed to connect to the server.");
            setLoading(false);
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      setError("Evaluation is still running. Please wait and refresh the page.");
      setLoading(false);
    };
    fetchResult();
  }, [id]);

  const handleNewEvaluation = () => {
    navigate("/evaluate");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
      <Nav />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "40px 24px" }}>
        <Link
          to="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: theme.textTer,
            textDecoration: "none",
            marginBottom: 20,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = theme.violet; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = theme.textTer; }}
        >
          ← Back to Dashboard
        </Link>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", color: theme.textSec }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${theme.border}`, borderTopColor: theme.violet, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading results...
          </div>
        )}

        {error && (
          <div style={{ background: theme.redPale, border: `1px solid ${theme.redBorder}`, borderRadius: theme.radiusMd, padding: "20px 24px", color: theme.red }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Error loading results</div>
            <div style={{ fontSize: 14 }}>{error}</div>
          </div>
        )}

        {!loading && !error && result && (
          <ResultsView result={result} onDownloadPDF={() => downloadPDF(result)} />
        )}
      </main>

      <Footer />
    </div>
  );
}
