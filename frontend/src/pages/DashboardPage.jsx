import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import VerdictBadge from "../components/VerdictBadge";
import PrintableReport from "../components/PrintableReport";
import { triggerPrint } from "../utils/generatePDF";
import { theme, getScoreColor } from "../theme";
import { api } from "../api";
import { DEMO_RESULT, DEMO_RESULT_AGGREGATE, DEMO_RESULT_VERIMEDIA } from "../demoResult";

// ── SafeCouncil Dashboard — Evaluation History & Accessibility ──────────
// The dashboard allows non-technical UNICC stakeholders to browse past
// evaluations, filter by verdict (APPROVE / REVIEW / REJECT), and access
// full results for any previously evaluated agent including VeriMedia.
// This provides an accessible, audit-friendly interface for governance
// oversight without requiring technical expertise or API knowledge.
//
// Demo evaluations (including VeriMedia) are available without API keys,
// allowing the full synthesis/arbitration pipeline to be reviewed by
// evaluators in any environment.

function formatDate(timestamp) {
  if (!timestamp) return "—";
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return timestamp;
  }
}

// Demo/dummy evaluation card data
const DUMMY_EVALUATIONS = [
  {
    eval_id: "demo-wfp1",
    agent_name: "WFP Support Bot",
    verdict: "REVIEW",
    confidence: 78,
    overall_score: 62,
    timestamp: "2026-03-15T14:30:00Z",
    is_demo: true,
    orchestrator_method: "deliberative",
  },
  {
    eval_id: "demo-unicef",
    agent_name: "UNICEF-GPT",
    verdict: "APPROVE",
    confidence: 91,
    overall_score: 84,
    timestamp: "2026-03-15T15:00:00Z",
    is_demo: true,
    orchestrator_method: "aggregate",
  },
  {
    eval_id: "demo-verimedia",
    agent_name: "VeriMedia — AI Media Ethics Analyzer",
    verdict: "APPROVE",
    confidence: 91,
    overall_score: 91,
    timestamp: "2026-03-20T10:00:00Z",
    is_demo: true,
    orchestrator_method: "deliberative",
  },
];

function EvalCard({ evaluation, onSeeDetail, onDownloadPDF }) {
  const [hovered, setHovered] = useState(false);
  const isDemo = evaluation.is_demo;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? theme.surfaceHover : theme.surface,
        border: `1px solid ${hovered ? theme.violetBorder : theme.border}`,
        borderRadius: 12,
        padding: "20px 24px",
        transition: theme.transition,
        boxShadow: hovered ? theme.shadowMd : "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: theme.text }}>
            {evaluation.agent_name || "Unknown Agent"}
          </span>
          {isDemo && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: theme.unBluePale, color: theme.unBlueDark }}>
              DEMO
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: theme.textTer, fontFamily: theme.fontMono, marginTop: 4 }}>
          ID: {evaluation.eval_id} · {formatDate(evaluation.timestamp)}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <VerdictBadge verdict={evaluation.verdict} size="sm" />
        {evaluation.orchestrator_method && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, letterSpacing: "0.04em",
            background: theme.unBlue + "18", color: theme.unBlueDark, border: `1px solid ${theme.unBlue}33`,
            textTransform: "uppercase",
          }}>
            {evaluation.orchestrator_method === "deliberative" ? "Deliberative" : "Aggregate"}
          </span>
        )}
        {evaluation.overall_score != null && (
          <div style={{ fontFamily: theme.fontMono, lineHeight: 1 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: getScoreColor(evaluation.overall_score) }}>{evaluation.overall_score}</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: theme.textTer }}>/100</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => onSeeDetail(evaluation.eval_id)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${theme.violet}44`,
              background: theme.violetPale,
              color: theme.violet,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: theme.transition,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.violet; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = theme.violetPale; e.currentTarget.style.color = theme.violet; }}
          >
            See Detail
          </button>
          <button
            onClick={() => onDownloadPDF(evaluation.eval_id, isDemo)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: theme.surface,
              color: theme.textSec,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: theme.transition,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; e.currentTarget.style.color = theme.violet; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSec; }}
          >
            Download PDF
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Result being printed right now. When non-null, a hidden
  // <PrintableReport> is mounted for it and the browser print dialog fires.
  const [printingResult, setPrintingResult] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.listEvaluations()
      .then((data) => {
        setEvaluations(data.evaluations || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Once a printingResult is mounted, wait for layout then open the dialog.
  // Clear state on afterprint so the DOM is clean for the next click.
  useEffect(() => {
    if (!printingResult) return;
    const onAfterPrint = () => setPrintingResult(null);
    window.addEventListener("afterprint", onAfterPrint);
    triggerPrint();
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, [printingResult]);

  const handleSeeDetail = (evalId) => {
    navigate(`/results/${evalId}`);
  };

  const handleDownloadPDF = async (evalId, isDemo) => {
    try {
      if (isDemo) {
        const demoData = evalId === "demo-unicef" ? DEMO_RESULT_AGGREGATE : evalId === "demo-verimedia" ? DEMO_RESULT_VERIMEDIA : DEMO_RESULT;
        setPrintingResult({ ...demoData, timestamp: new Date().toISOString() });
        return;
      }
      const { status, data } = await api.getResult(evalId);
      if (status === 200) {
        setPrintingResult(data);
      } else {
        alert("Could not load evaluation data for PDF export.");
      }
    } catch {
      alert("Failed to load evaluation data.");
    }
  };

  // Combine real evaluations with dummy
  const allEvaluations = [...evaluations];
  // Add dummy demo cards if not already present
  for (const dummy of DUMMY_EVALUATIONS) {
    if (!evaluations.some(e => e.eval_id === dummy.eval_id)) {
      allEvaluations.push(dummy);
    }
  }


  return (
    <>
      <div className="sc-screen" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
        <Nav />

      <main style={{ flex: 1, padding: "48px 24px", maxWidth: 960, margin: "0 auto", width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: theme.fontSerif, fontSize: 30, fontWeight: 400, color: theme.text, marginBottom: 6, letterSpacing: "-0.02em" }}>
              Evaluation Dashboard
            </h1>
            <p style={{ fontSize: 14, color: theme.textTer }}>
              View past evaluation results, download reports, and monitor system health
            </p>
          </div>
          <Link
            to="/evaluate"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 20px",
              background: theme.violet,
              color: "#fff",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              transition: theme.transition,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; }}
          >
            + New Evaluation
          </Link>
        </div>

        {/* Content */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", color: theme.textSec }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${theme.border}`, borderTopColor: theme.violet, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 16 }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading evaluations...
          </div>
        )}

        {error && (
          <div style={{ background: theme.redPale, border: `1px solid ${theme.redBorder}`, borderRadius: 12, padding: "20px 24px", color: theme.red }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not load evaluations</div>
            <div style={{ fontSize: 14 }}>{error}</div>
            <div style={{ fontSize: 13, marginTop: 8, color: theme.textSec }}>
              Make sure the Flask server is running on port 5000.
            </div>
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {allEvaluations.map((ev) => (
              <EvalCard
                key={ev.eval_id}
                evaluation={ev}
                onSeeDetail={handleSeeDetail}
                onDownloadPDF={handleDownloadPDF}
              />
            ))}
          </div>
        )}
      </main>

        <Footer />
      </div>

      {/* Hidden on screen, shown by @media print CSS when a row's
          Download PDF button is clicked. Rendering is state-driven so only
          the selected row's report is in the DOM at print time. */}
      {printingResult && (
        <div className="sc-printable">
          <PrintableReport result={printingResult} />
        </div>
      )}
    </>
  );
}
