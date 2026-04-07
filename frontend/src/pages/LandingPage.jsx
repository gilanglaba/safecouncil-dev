import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { theme } from "../theme";

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

function FadeIn({ children, delay = 0 }) {
  const [ref, visible] = useInView();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

const FEATURES = [
  { icon: "🛡️", title: "Adversarial Safety Testing", desc: "Each AI agent is tested against adversarial prompts, injection attacks, and social engineering — with evidence-based scoring on 10 dimensions." },
  { icon: "📋", title: "Governance & Compliance", desc: "Evaluate against EU AI Act, NIST AI RMF, OWASP Top 10 for LLMs, UNESCO Ethics, ISO 42001, and UNICC UN-specific standards." },
  { icon: "🔍", title: "Trust & Transparency", desc: "Automated scoring on privacy protection, human oversight adequacy, accuracy, and disclosure practices — with specific evidence from your conversations." },
  { icon: "⚖️", title: "Cross-Critique & Debate", desc: "Three AI experts independently evaluate your agent, then critique each other — surfacing disagreements that single-model evaluation misses." },
  { icon: "📊", title: "Auditable Verdicts", desc: "APPROVE / REVIEW / REJECT verdicts with confidence scores, agreement rates, and complete JSON audit logs suitable for UN governance requirements." },
  { icon: "🌐", title: "UN-Ready Governance", desc: "Built for humanitarian deployments. Includes UNICC AI sandbox requirements, beneficiary data sovereignty, and multi-language context." },
];

const STEPS = [
  { num: "01", title: "Submit", desc: "Provide your agent's system prompt, use case, deployment context, and sample conversations. Or click 'Load Demo' for an instant example." },
  { num: "02", title: "Evaluate", desc: "Three independent AI experts (Claude, GPT-4o, Gemini) each evaluate your agent across 10 safety dimensions using a rigorous rubric." },
  { num: "03", title: "Critique", desc: "Each expert reviews the others' assessments — challenging score differences, surfacing missed risks, and identifying genuine consensus." },
  { num: "04", title: "Verdict", desc: "A structured debate transcript is generated, leading to a APPROVE / REVIEW / REJECT verdict with prioritized P0–P3 mitigations." },
];

const TERMINAL_LINES = [
  { text: "$ safecouncil evaluate --agent 'WFP Support Bot v2.1'", color: "#C8A8F0" },
  { text: "✓ Governance context loaded (EU AI Act, NIST, OWASP, UNESCO)", color: "#9ADBBF" },
  { text: "⠋ Expert A (Claude) evaluating... [10 dimensions]", color: "#F5D28A" },
  { text: "✓ Expert A complete — Score: 76/100 — REVIEW", color: "#9ADBBF" },
  { text: "⠋ Expert B (GPT-4o) evaluating... [10 dimensions]", color: "#F5D28A" },
  { text: "✓ Expert B complete — Score: 79/100 — REVIEW", color: "#9ADBBF" },
  { text: "⠋ Expert C (Gemini) evaluating... [10 dimensions]", color: "#F5D28A" },
  { text: "✓ Expert C complete — Score: 72/100 — REVIEW", color: "#9ADBBF" },
  { text: "⠋ Cross-critique round in progress...", color: "#F5D28A" },
  { text: "✓ Council debate & synthesis complete", color: "#9ADBBF" },
  { text: "", color: "" },
  { text: "━━━ COUNCIL VERDICT ━━━━━━━━━━━━━━━━━━━━━━━━━━━", color: "#7B5BAF" },
  { text: "⚠  REVIEW  (confidence: 87% | agreement: 84%)", color: "#F5D28A" },
  { text: "P0  Fix prompt injection — Engineering", color: "#FF6B6B" },
  { text: "P1  Strengthen data minimization — Product", color: "#F5D28A" },
  { text: "P2  Add Arabic language accuracy testing — QA", color: "#C8A8F0" },
];

export default function LandingPage() {
  const [typedLines, setTypedLines] = useState(0);

  useEffect(() => {
    if (typedLines >= TERMINAL_LINES.length) return;
    const delay = typedLines === 0 ? 600 : 180;
    const t = setTimeout(() => setTypedLines((n) => n + 1), delay);
    return () => clearTimeout(t);
  }, [typedLines]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
      <Nav />

      {/* Hero */}
      <section style={{ padding: "80px 24px 60px", textAlign: "center" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: theme.radiusFull,
              background: theme.violetPale,
              border: `1px solid ${theme.violetBorder}`,
              marginBottom: 28,
            }}
          >
            <span style={{ fontSize: 12, color: theme.violet, fontWeight: 600 }}>
              NYU SPS × UNICC AI Hub · Spring 2026
            </span>
          </div>

          <h1
            style={{
              fontFamily: theme.fontSerif,
              fontSize: "clamp(44px, 7vw, 80px)",
              fontWeight: 500,
              lineHeight: 0.95,
              letterSpacing: "-0.03em",
              color: theme.text,
              marginBottom: 20,
            }}
          >
            <span
              style={{
                background: "linear-gradient(135deg, #57068C 0%, #5B92E5 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              SafeCouncil
            </span>
          </h1>
          <div
            style={{
              fontFamily: theme.fontSerif,
              fontSize: "clamp(22px, 3vw, 32px)",
              fontWeight: 400,
              lineHeight: 1.25,
              letterSpacing: "-0.01em",
              color: theme.text,
              marginBottom: 12,
            }}
          >
            Multi-agent AI Safety Evaluation Tool and Framework
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "center",
              marginBottom: 28,
            }}
          >
            {[
              "Research-grounded",
              "Future-proof",
              "Built on-premises for the UN",
            ].map((label) => (
              <span
                key={label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "6px 14px",
                  borderRadius: theme.radiusFull,
                  background: theme.violetPale,
                  border: `1px solid ${theme.violetBorder}`,
                  fontSize: 13,
                  fontWeight: 600,
                  color: theme.violet,
                  letterSpacing: "0.01em",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          <p
            style={{
              fontSize: 18,
              color: theme.textSec,
              lineHeight: 1.6,
              maxWidth: 600,
              margin: "0 auto 36px",
            }}
          >
            Three independent AI experts evaluate your AI agents across 10 safety dimensions,
            debate their findings, and deliver a verdict aligned with UN governance standards.
          </p>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/evaluate"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                background: theme.violet,
                color: "#fff",
                borderRadius: theme.radiusFull,
                fontSize: 15,
                fontWeight: 600,
                transition: theme.transition,
                boxShadow: "0 4px 14px rgba(87,6,140,0.3)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; e.currentTarget.style.transform = "none"; }}
            >
              Try It Now →
            </Link>
            <a
              href="#how-it-works"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 28px",
                background: theme.surface,
                color: theme.text,
                borderRadius: theme.radiusFull,
                fontSize: 15,
                fontWeight: 600,
                border: `1.5px solid ${theme.border}`,
                transition: theme.transition,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violet; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; }}
            >
              How It Works
            </a>
          </div>

          {/* Terminal preview */}
          <div
            style={{
              marginTop: 52,
              background: "#0F0820",
              borderRadius: theme.radiusMd,
              padding: "24px 28px",
              textAlign: "left",
              boxShadow: "0 20px 60px rgba(26,10,46,0.25)",
              border: "1px solid #2A1540",
              overflow: "hidden",
            }}
          >
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {["#FF5F56", "#FFBD2E", "#27C93F"].map((c) => (
                <div key={c} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
              ))}
              <span style={{ marginLeft: 8, fontSize: 11, color: "#5A4A70", fontFamily: theme.fontMono }}>
                safecouncil — bash
              </span>
            </div>
            <div style={{ fontFamily: theme.fontMono, fontSize: 13, lineHeight: 1.7 }}>
              {TERMINAL_LINES.slice(0, typedLines).map((line, i) => (
                <div key={i} style={{ color: line.color || "#8070A0" }}>
                  {line.text}
                </div>
              ))}
              {typedLines < TERMINAL_LINES.length && (
                <span style={{ color: "#C8A8F0", animation: "none" }}>▊</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: "40px 24px", background: theme.surface, borderTop: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
        <div
          style={{
            maxWidth: 800,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 24,
            textAlign: "center",
          }}
        >
          {[
            { num: "3", label: "Expert Agents" },
            { num: "6+", label: "Global Standards" },
            { num: "10", label: "Safety Dimensions" },
            { num: "<5m", label: "Per Evaluation" },
          ].map(({ num, label }) => (
            <div key={label}>
              <div
                style={{
                  fontFamily: theme.fontSerif,
                  fontSize: 36,
                  fontWeight: 400,
                  color: theme.violet,
                  lineHeight: 1,
                  marginBottom: 4,
                }}
              >
                {num}
              </div>
              <div style={{ fontSize: 13, color: theme.textSec, fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 52 }}>
              <h2 style={{ fontFamily: theme.fontSerif, fontSize: 36, fontWeight: 400, color: theme.text, marginBottom: 12 }}>
                Built for high-stakes AI
              </h2>
              <p style={{ fontSize: 16, color: theme.textSec, maxWidth: 500, margin: "0 auto" }}>
                SafeCouncil is designed for humanitarian, government, and enterprise AI deployments where safety is not optional.
              </p>
            </div>
          </FadeIn>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 20,
            }}
          >
            {FEATURES.map((f, i) => (
              <FadeIn key={f.title} delay={i * 0.06}>
                <div
                  style={{
                    background: theme.surface,
                    border: `1px solid ${theme.border}`,
                    borderRadius: theme.radiusMd,
                    padding: "24px",
                    transition: theme.transition,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.violetBorder; e.currentTarget.style.boxShadow = theme.shadowMd; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: theme.text, marginBottom: 8 }}>{f.title}</div>
                  <div style={{ fontSize: 14, color: theme.textSec, lineHeight: 1.6 }}>{f.desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" style={{ padding: "80px 24px", background: theme.bgWarm }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <FadeIn>
            <div style={{ textAlign: "center", marginBottom: 52 }}>
              <h2 style={{ fontFamily: theme.fontSerif, fontSize: 36, fontWeight: 400, color: theme.text, marginBottom: 12 }}>
                How it works
              </h2>
              <p style={{ fontSize: 16, color: theme.textSec }}>
                Four steps from submission to actionable verdict.
              </p>
            </div>
          </FadeIn>

          <div style={{ position: "relative" }}>
            {/* Connecting line */}
            <div
              style={{
                position: "absolute",
                left: 27,
                top: 40,
                bottom: 40,
                width: 2,
                background: `linear-gradient(to bottom, ${theme.violetPale}, ${theme.unBluePale})`,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
              {STEPS.map((step, i) => (
                <FadeIn key={step.num} delay={i * 0.1}>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: theme.surface,
                        border: `2px solid ${theme.violetBorder}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        position: "relative",
                        zIndex: 1,
                      }}
                    >
                      <span style={{ fontFamily: theme.fontMono, fontSize: 13, fontWeight: 500, color: theme.violet }}>
                        {step.num}
                      </span>
                    </div>
                    <div style={{ paddingTop: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 17, color: theme.text, marginBottom: 6 }}>{step.title}</div>
                      <div style={{ fontSize: 14, color: theme.textSec, lineHeight: 1.6 }}>{step.desc}</div>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "80px 24px", textAlign: "center" }}>
        <FadeIn>
          <div
            style={{
              maxWidth: 560,
              margin: "0 auto",
              padding: "48px",
              background: "linear-gradient(135deg, #57068C 0%, #3D72C4 100%)",
              borderRadius: theme.radiusLg,
              color: "#fff",
              boxShadow: "0 12px 40px rgba(87,6,140,0.25)",
            }}
          >
            <h2 style={{ fontFamily: theme.fontSerif, fontSize: 32, fontWeight: 400, marginBottom: 12 }}>
              Ready to evaluate your AI?
            </h2>
            <p style={{ fontSize: 15, opacity: 0.85, marginBottom: 28, lineHeight: 1.6 }}>
              Run your first evaluation in under 5 minutes. No setup required — just paste your agent's system prompt and conversations.
            </p>
            <Link
              to="/evaluate"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 32px",
                background: "#fff",
                color: theme.violet,
                borderRadius: theme.radiusFull,
                fontSize: 15,
                fontWeight: 700,
                transition: theme.transition,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}
            >
              Start Evaluation →
            </Link>
          </div>
        </FadeIn>
      </section>

      <Footer />
    </div>
  );
}
