import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { theme } from "../theme";

const TEAM = [
  {
    initials: "GL",
    name: "Gilang Laba",
    role: "AI Product Engineer & Architect",
    color: theme.violet,
    photo: "/gilang.jpg",
    desc: "Leads SafeCouncil's product vision, system architecture, and multi-agent evaluation research.",
  },
  {
    initials: "JM",
    name: "Jimmy Pengyun Ma",
    role: "AI Systems Engineer",
    color: theme.unBlueDark,
    photo: "/jimmy.jpg",
    desc: "Builds SafeCouncil's modular platform infrastructure, local LLM deployment, and governance operationalization.",
  },
  {
    initials: "IZ",
    name: "Iris Zhang",
    role: "UX Engineer",
    color: theme.green,
    photo: "/iris.jpg",
    desc: "Designs and builds SafeCouncil's user experience, from evaluation result transparency to user study validation.",
  },
];

const ADVISORS = [
  {
    initials: "AF",
    name: "Dr. Andrés Fortino",
    role: "Academic Advisor",
    color: theme.violet,
    desc: "Clinical Associate Professor at NYU SPS. Principal project sponsor bridging NYU and UNICC.",
  },
  {
    initials: "AD",
    name: "Ms. Anusha Dandapani",
    role: "UNICC Sponsor",
    color: theme.unBlueDark,
    desc: "Center Director, UNICC AI Hub. Leading responsible AI deployment across the United Nations system.",
  },
];

function PersonCard({ person, size = "lg" }) {
  const isLg = size === "lg";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        flex: 1,
        minWidth: isLg ? 200 : 180,
        maxWidth: isLg ? 280 : 240,
      }}
    >
      {/* Avatar */}
      {person.photo ? (
        <img
          src={person.photo}
          alt={person.name}
          style={{
            width: isLg ? 96 : 72,
            height: isLg ? 96 : 72,
            borderRadius: "50%",
            objectFit: "cover",
            border: `2px solid ${person.color}`,
            marginBottom: 16,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: isLg ? 96 : 72,
            height: isLg ? 96 : 72,
            borderRadius: "50%",
            background: theme.bgWarm,
            border: `2px dashed ${person.color}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 16,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: theme.fontSerif,
              fontSize: isLg ? 28 : 22,
              color: person.color,
              fontWeight: 400,
            }}
          >
            {person.initials}
          </span>
        </div>
      )}

      <div style={{ fontWeight: 700, fontSize: isLg ? 16 : 14, color: theme.text, marginBottom: 4 }}>
        {person.name}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: person.color,
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {person.role}
      </div>
      <div style={{ fontSize: 13, color: theme.textSec, lineHeight: 1.6 }}>{person.desc}</div>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: theme.bg }}>
      <Nav />

      <main style={{ flex: 1, padding: "64px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <h1
              style={{
                fontFamily: theme.fontSerif,
                fontSize: "clamp(32px, 5vw, 52px)",
                fontWeight: 400,
                color: theme.text,
                marginBottom: 16,
              }}
            >
              About the{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #57068C 0%, #5B92E5 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  fontStyle: "italic",
                }}
              >
                Team
              </span>
            </h1>
            <p style={{ fontSize: 17, color: theme.textSec, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>
              SafeCouncil is a capstone project from the NYU SPS × UNICC AI Governance program,
              built to address the growing need for structured AI safety evaluation in humanitarian contexts.
            </p>
          </div>

          {/* Core Team */}
          <section style={{ marginBottom: 64 }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Core Team
              </div>
              <h2 style={{ fontFamily: theme.fontSerif, fontSize: 28, fontWeight: 400, color: theme.text }}>
                Building SafeCouncil
              </h2>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 40,
                flexWrap: "wrap",
              }}
            >
              {TEAM.map((p) => <PersonCard key={p.name} person={p} size="lg" />)}
            </div>
          </section>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${theme.border}`, marginBottom: 64 }} />

          {/* Advisors */}
          <section style={{ marginBottom: 64 }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: theme.textTer, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                Advisors & Sponsors
              </div>
              <h2 style={{ fontFamily: theme.fontSerif, fontSize: 28, fontWeight: 400, color: theme.text }}>
                Guided by experts
              </h2>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 48,
                flexWrap: "wrap",
              }}
            >
              {ADVISORS.map((p) => <PersonCard key={p.name} person={p} size="sm" />)}
            </div>
          </section>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${theme.border}`, marginBottom: 64 }} />

          {/* Project context */}
          <section style={{ marginBottom: 64, maxWidth: 700, margin: "0 auto 64px" }}>
            <h2 style={{ fontFamily: theme.fontSerif, fontSize: 28, fontWeight: 400, color: theme.text, marginBottom: 20, textAlign: "center" }}>
              Why SafeCouncil?
            </h2>
            <div style={{ fontSize: 15, color: theme.textSec, lineHeight: 1.8 }}>
              <p style={{ marginBottom: 16 }}>
                As AI systems are deployed in humanitarian operations — from refugee assistance to food security
                to health services — the need for rigorous, independent safety evaluation has never been greater.
                Existing tools evaluate AI in isolation, using a single model that shares the same biases as the
                AI being evaluated.
              </p>
              <p style={{ marginBottom: 16 }}>
                SafeCouncil takes a different approach: three independent AI experts from different vendors
                evaluate the same agent, then critique each other's findings. This adversarial dynamic surfaces
                risks that single-model evaluation systematically misses.
              </p>
              <p>
                The platform is designed for UN agencies, NGOs, and governments deploying AI in high-stakes,
                data-sensitive contexts — where a missed vulnerability isn't a UX issue but a humanitarian one.
              </p>
            </div>
          </section>

          {/* CTA */}
          <div
            style={{
              padding: "40px",
              background: "linear-gradient(135deg, #57068C 0%, #3D72C4 100%)",
              borderRadius: theme.radiusLg,
              textAlign: "center",
              color: "#fff",
              boxShadow: "0 8px 32px rgba(87,6,140,0.2)",
            }}
          >
            <h3 style={{ fontFamily: theme.fontSerif, fontSize: 26, fontWeight: 400, marginBottom: 12 }}>
              Interested in SafeCouncil?
            </h3>
            <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 24 }}>
              We're actively developing this platform and welcome collaborators, feedback, and partnerships.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <a
                href="mailto:safecouncil@nyu.edu"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 24px",
                  background: "#fff",
                  color: theme.violet,
                  borderRadius: theme.radiusFull,
                  fontSize: 14,
                  fontWeight: 700,
                  transition: theme.transition,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; }}
              >
                Get in Touch
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 24px",
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderRadius: theme.radiusFull,
                  fontSize: 14,
                  fontWeight: 600,
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  transition: theme.transition,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.25)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
