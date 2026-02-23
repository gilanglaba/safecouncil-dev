import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import VerdictBadge from "../components/VerdictBadge";
import { theme } from "../theme";
import { api } from "../api";

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

function EvalCard({ evaluation, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? theme.surfaceHover : theme.surface,
        border: `1px solid ${hovered ? theme.violetBorder : theme.border}`,
        borderRadius: theme.radiusMd,
        padding: "20px 24px",
        cursor: "pointer",
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
        <div style={{ fontWeight: 600, fontSize: 15, color: theme.text, marginBottom: 4 }}>
          {evaluation.agent_name || "Unknown Agent"}
        </div>
        <div style={{ fontSize: 12, color: theme.textTer, fontFamily: theme.fontMono }}>
          ID: {evaluation.eval_id} · {formatDate(evaluation.timestamp)}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <VerdictBadge verdict={evaluation.verdict} size="sm" />
        {evaluation.confidence !== undefined && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, fontFamily: theme.fontMono, lineHeight: 1 }}>
              {evaluation.confidence}%
            </div>
            <div style={{ fontSize: 11, color: theme.textTer }}>confidence</div>
          </div>
        )}
        <div style={{ color: theme.violetLight, fontSize: 18 }}>→</div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const handleCardClick = (evalId) => {
    navigate(`/evaluate?id=${evalId}`);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
      <Nav />

      <main style={{ flex: 1, padding: "48px 24px", maxWidth: 900, margin: "0 auto", width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
          <div>
            <h1 style={{ fontFamily: theme.fontSerif, fontSize: 36, fontWeight: 400, color: theme.text, marginBottom: 8 }}>
              Evaluation Dashboard
            </h1>
            <p style={{ fontSize: 15, color: theme.textSec }}>
              Past evaluation results — click any to view full details
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
              borderRadius: theme.radiusFull,
              fontSize: 14,
              fontWeight: 600,
              transition: theme.transition,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; }}
          >
            + New Evaluation
          </Link>
        </div>

        {/* Content */}
        {loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 24px",
              color: theme.textSec,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                border: `3px solid ${theme.border}`,
                borderTopColor: theme.violet,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                marginBottom: 16,
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading evaluations...
          </div>
        )}

        {error && (
          <div
            style={{
              background: theme.redPale,
              border: `1px solid ${theme.redBorder}`,
              borderRadius: theme.radiusMd,
              padding: "20px 24px",
              color: theme.red,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not load evaluations</div>
            <div style={{ fontSize: 14 }}>{error}</div>
            <div style={{ fontSize: 13, marginTop: 8, color: theme.textSec }}>
              Make sure the Flask server is running on port 5000.
            </div>
          </div>
        )}

        {!loading && !error && evaluations.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "80px 24px",
              background: theme.surface,
              borderRadius: theme.radiusLg,
              border: `2px dashed ${theme.border}`,
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>🏛️</div>
            <h3 style={{ fontFamily: theme.fontSerif, fontSize: 24, fontWeight: 400, color: theme.text, marginBottom: 12 }}>
              No evaluations yet
            </h3>
            <p style={{ fontSize: 15, color: theme.textSec, marginBottom: 28 }}>
              Run your first evaluation to see results here.
            </p>
            <Link
              to="/evaluate"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "12px 24px",
                background: theme.violet,
                color: "#fff",
                borderRadius: theme.radiusFull,
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Run your first evaluation →
            </Link>
          </div>
        )}

        {!loading && !error && evaluations.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Summary stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
                marginBottom: 8,
              }}
            >
              {[
                {
                  label: "Total Evaluations",
                  value: evaluations.length,
                  color: theme.violet,
                },
                {
                  label: "GO Results",
                  value: evaluations.filter((e) => e.verdict === "GO").length,
                  color: theme.green,
                },
                {
                  label: "NO-GO Results",
                  value: evaluations.filter((e) => e.verdict === "NO-GO").length,
                  color: theme.red,
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusMd,
                    padding: "16px 20px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: theme.fontMono, lineHeight: 1, marginBottom: 4 }}>
                    {value}
                  </div>
                  <div style={{ fontSize: 12, color: theme.textSec }}>{label}</div>
                </div>
              ))}
            </div>

            {evaluations.map((ev) => (
              <EvalCard
                key={ev.eval_id}
                evaluation={ev}
                onClick={() => handleCardClick(ev.eval_id)}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
