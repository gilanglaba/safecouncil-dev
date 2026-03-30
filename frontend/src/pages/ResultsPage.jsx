import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import VerdictBadge from "../components/VerdictBadge";
import { downloadPDF } from "../utils/generatePDF";
import SeverityBadge from "../components/SeverityBadge";
import ScoreBar from "../components/ScoreBar";
import Badge from "../components/Badge";
import { theme, getSpeakerColor, getScoreColor } from "../theme";
import { api } from "../api";
import { DEMO_RESULT } from "../demoResult";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function categoryAvg(dimensionScores, categoryName) {
  const dims = dimensionScores.filter((d) => d.category === categoryName);
  if (!dims.length) return null;
  return Math.round(dims.reduce((s, d) => s + d.score, 0) / dims.length);
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

// ─────────────────────────────────────────────────────────────────────────────
// Tab: Overview
// ─────────────────────────────────────────────────────────────────────────────

function ExpertCard({ assessment }) {
  const topFindings = (assessment.findings || []).slice(0, 3);
  const scores = assessment.dimension_scores || [];

  // Dynamically detect categories from the data — no hardcoded names
  const categoryOrder = [];
  const seen = new Set();
  for (const d of scores) {
    if (!seen.has(d.category)) {
      seen.add(d.category);
      categoryOrder.push(d.category);
    }
  }
  const categoryBars = categoryOrder
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
          <div style={{ fontSize: 40, fontWeight: 800, fontFamily: theme.fontMono, color: scoreColor, lineHeight: 1 }}>
            {assessment.overall_score}
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 13, color: theme.textTer }}>/100</div>
            <VerdictBadge verdict={assessment.verdict} size="sm" />
          </div>
        </div>

        {/* Category bars — dynamically derived from dimension data */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {categoryBars.map(([label, val]) => (
            <div key={label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.textSec, marginBottom: 3 }}>
                <span>{label}</span>
                <span style={{ fontFamily: theme.fontMono, fontWeight: 600, color: getScoreColor(val) }}>{val}</span>
              </div>
              <ScoreBar score={val} showLabel={false} height={4} compact />
            </div>
          ))}
        </div>
      </div>

      {topFindings.length > 0 && (
        <div style={{ borderTop: `1px solid ${theme.borderSubtle}`, padding: "12px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Top Findings
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topFindings.map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <SeverityBadge severity={f.severity} />
                <span style={{ fontSize: 12, color: theme.textSec, lineHeight: 1.4 }}>{f.dimension}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ result }) {
  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
        {(result.expert_assessments || []).map((a) => (
          <ExpertCard key={a.expert_name} assessment={a} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {result.agreements?.length > 0 && (
          <div style={{ background: theme.greenPale, border: `1px solid ${theme.greenBorder}`, borderRadius: theme.radiusMd, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: theme.green, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              ✓ Council Agreements
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
// Tab: Score Comparison
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

  const expertColors = assessments.map((a) => getSpeakerColor(a.expert_name));

  return (
    <div>
      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        {assessments.map((a, i) => (
          <div key={a.expert_name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: expertColors[i] }} />
            <span style={{ fontSize: 13, color: theme.textSec }}>{a.expert_name}</span>
          </div>
        ))}
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: theme.radiusMd, overflow: "hidden" }}>
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
                {assessments.map((a, i) => {
                  const score = getDimScore(a, dim);
                  return (
                    <div key={a.expert_name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: theme.border, borderRadius: 3, overflow: "hidden" }}>
                        {score !== null && (
                          <div
                            style={{
                              width: `${score}%`,
                              height: "100%",
                              background: expertColors[i],
                              borderRadius: 3,
                              opacity: 0.8,
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: theme.fontMono,
                          color: score !== null ? getScoreColor(score) : theme.textTer,
                          minWidth: 28,
                          textAlign: "right",
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
// Tab: Expert Debate
// ─────────────────────────────────────────────────────────────────────────────

function DebateTab({ result }) {
  const [filter, setFilter] = useState("All");
  const messages = result.debate_transcript || [];

  const speakers = ["All", ...new Set(
    messages.filter((m) => m.message_type !== "resolution" && m.speaker !== "Council").map((m) => m.speaker)
  )];

  const filtered = filter === "All" ? messages : messages.filter(
    (m) => m.speaker === filter || m.message_type === "resolution" || m.speaker === "Council"
  );

  let lastTopic = null;

  return (
    <div>
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
          No debate transcript available for this evaluation.
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
                      <span
                        style={{
                          fontSize: 11,
                          padding: "1px 6px",
                          borderRadius: 3,
                          background: theme.bgWarm,
                          color: theme.textTer,
                          fontWeight: 500,
                        }}
                      >
                        {msg.message_type}
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
// Tab: All Findings
// ─────────────────────────────────────────────────────────────────────────────

function FindingsTab({ result }) {
  const assessments = result.expert_assessments || [];
  const hasFocus = { CRITICAL: "#8B1A1A", HIGH: theme.redBorder, MEDIUM: theme.amberBorder, LOW: theme.border };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {assessments.map((a) => {
        const findings = [...(a.findings || [])].sort(
          (x, y) => (SEVERITY_ORDER[x.severity] ?? 4) - (SEVERITY_ORDER[y.severity] ?? 4)
        );
        const color = getSpeakerColor(a.expert_name);

        return (
          <div key={a.expert_name}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{a.expert_name}</span>
              <span style={{ fontSize: 12, color: theme.textTer }}>{findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
            </div>

            {findings.length === 0 && (
              <div
                style={{
                  padding: "16px",
                  background: theme.greenPale,
                  border: `1px solid ${theme.greenBorder}`,
                  borderRadius: theme.radius,
                  fontSize: 13,
                  color: theme.green,
                }}
              >
                ✓ No findings raised by this expert
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {findings.map((f, i) => (
                <div
                  key={i}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderLeft: `4px solid ${hasFocus[f.severity] || theme.border}`,
                    borderRadius: theme.radius,
                    padding: "14px 16px",
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    <SeverityBadge severity={f.severity} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: theme.text, marginBottom: 4 }}>
                      {f.dimension}
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
                  </div>
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
// Tab: Action Items
// ─────────────────────────────────────────────────────────────────────────────

function ActionItemsTab({ result, onNewEvaluation, onDownloadPDF }) {
  const mitigations = result.mitigations || [];
  const priorityColors = {
    P0: { bg: "#2D0A0A", text: "#FF6B6B", border: "#8B2020" },
    P1: { bg: theme.redPale, text: theme.red, border: theme.redBorder },
    P2: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
    P3: { bg: "#F0F0F5", text: theme.textSec, border: theme.border },
  };

  return (
    <div>
      {mitigations.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: theme.textSec }}>
          No action items generated.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {mitigations.map((m, i) => {
          const pc = priorityColors[m.priority] || priorityColors.P3;
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
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily: theme.fontMono,
                  background: pc.bg,
                  color: pc.text,
                  border: `1px solid ${pc.border}`,
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                {m.priority}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5, marginBottom: 6 }}>{m.text}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Badge label={m.owner} preset="blue" style={{ fontSize: 11 }} />
                  {m.expert_consensus && (
                    <span style={{ fontSize: 12, color: theme.textTer, alignSelf: "center" }}>{m.expert_consensus}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", borderTop: `1px solid ${theme.border}`, paddingTop: 20 }}>
        <button
          onClick={onDownloadPDF}
          style={{
            padding: "10px 20px",
            background: theme.surface,
            border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            color: theme.textSec,
            cursor: "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; e.currentTarget.style.color = theme.violet; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSec; }}
        >
          Export Report (PDF)
        </button>
        <button
          onClick={() => alert("Share link copied! (Feature coming soon)")}
          style={{
            padding: "10px 20px",
            background: theme.surface,
            border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            color: theme.textSec,
            cursor: "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.unBlueDark; e.currentTarget.style.color = theme.unBlueDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSec; }}
        >
          Share with Team
        </button>
        <button
          onClick={onNewEvaluation}
          style={{
            padding: "10px 20px",
            background: theme.violet,
            color: "#fff",
            border: "none",
            borderRadius: theme.radiusFull,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: theme.transition,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; }}
        >
          + New Evaluation
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results View (shared between ResultsPage and inline usage)
// ─────────────────────────────────────────────────────────────────────────────

function ResultsView({ result, onNewEvaluation, onDownloadPDF }) {
  const [activeTab, setActiveTab] = useState("overview");
  const verdict = result.verdict || {};
  const verdictColors = {
    GO: { bg: theme.greenPale, text: theme.green, border: theme.greenBorder },
    CONDITIONAL: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
    "NO-GO": { bg: theme.redPale, text: theme.red, border: theme.redBorder },
  };
  const vc = verdictColors[verdict.final_verdict] || verdictColors.CONDITIONAL;

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "scores", label: "Score Comparison" },
    { id: "debate", label: "Expert Debate ✦" },
    { id: "findings", label: "All Findings" },
    { id: "actions", label: "Action Items" },
  ];

  return (
    <div>
      {/* Verdict banner */}
      <div
        style={{
          background: vc.bg,
          border: `1px solid ${vc.border}`,
          borderRadius: theme.radiusMd,
          padding: "24px 28px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: vc.text, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
            Council Final Verdict
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <VerdictBadge verdict={verdict.final_verdict} size="xl" />
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: theme.fontMono, color: vc.text, lineHeight: 1 }}>
                {verdict.confidence}%
              </div>
              <div style={{ fontSize: 12, color: vc.text, opacity: 0.8 }}>confidence</div>
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, fontFamily: theme.fontMono, color: vc.text, lineHeight: 1 }}>
                {verdict.agreement_rate}%
              </div>
              <div style={{ fontSize: 12, color: vc.text, opacity: 0.8 }}>agreement</div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: theme.textSec }}>{result.agent_name}</div>
          <div style={{ fontSize: 11, color: theme.textTer, fontFamily: theme.fontMono }}>
            ID: {result.eval_id}
          </div>
          {result.audit && (
            <div style={{ fontSize: 11, color: theme.textTer, marginTop: 4 }}>
              {result.audit.total_api_calls} calls · {result.audit.evaluation_time_seconds?.toFixed(0)}s · ${result.audit.total_cost_usd?.toFixed(4)}
            </div>
          )}
          <button
            onClick={onDownloadPDF}
            style={{
              marginTop: 10,
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${vc.border}`,
              background: "rgba(255,255,255,0.6)",
              color: vc.text,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
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
      {activeTab === "debate" && <DebateTab result={result} />}
      {activeTab === "findings" && <FindingsTab result={result} />}
      {activeTab === "actions" && <ActionItemsTab result={result} onNewEvaluation={onNewEvaluation} onDownloadPDF={onDownloadPDF} />}
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
    if (id === "demo") {
      setResult({ ...DEMO_RESULT, timestamp: new Date().toISOString() });
      setLoading(false);
      return;
    }

    api.getResult(id)
      .then(({ status, data }) => {
        if (status === 200) {
          setResult(data);
        } else {
          setError("Could not load evaluation results.");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to fetch results.");
        setLoading(false);
      });
  }, [id]);

  const handleNewEvaluation = () => {
    navigate("/evaluate");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
      <Nav />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "40px 24px" }}>
        {/* Back link */}
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
          <ResultsView result={result} onNewEvaluation={handleNewEvaluation} onDownloadPDF={() => downloadPDF(result)} />
        )}
      </main>

      <Footer />
    </div>
  );
}
