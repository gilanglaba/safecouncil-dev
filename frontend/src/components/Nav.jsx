import { Link, useLocation } from "react-router-dom";
import { theme } from "../theme";
import { useState, useEffect } from "react";

function LogoIcon() {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "linear-gradient(135deg, #57068C 0%, #3D72C4 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span style={{ color: "#fff", fontWeight: 800, fontSize: 16, fontFamily: "'DM Sans', sans-serif" }}>S</span>
    </div>
  );
}

export default function Nav() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (path) => location.pathname === path;

  const linkStyle = (path) => ({
    fontSize: 14,
    fontWeight: 500,
    color: isActive(path) ? theme.violet : theme.textSec,
    padding: "6px 4px",
    borderBottom: isActive(path) ? `2px solid ${theme.violet}` : "2px solid transparent",
    transition: theme.transition,
  });

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: scrolled ? "rgba(250,250,254,0.95)" : "rgba(250,250,254,0.8)",
        backdropFilter: "blur(12px)",
        borderBottom: `1px solid ${scrolled ? theme.border : "transparent"}`,
        transition: "all 0.2s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 24,
        }}
      >
        {/* Logo */}
        <Link to="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoIcon />
          <span
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: theme.text,
              letterSpacing: "-0.01em",
            }}
          >
            SafeCouncil
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <Link to="/" style={linkStyle("/")}>Home</Link>
          <Link to="/evaluate" style={linkStyle("/evaluate")}>Evaluate</Link>
          <Link to="/dashboard" style={linkStyle("/dashboard")}>Dashboard</Link>
          <Link to="/about" style={linkStyle("/about")}>About</Link>
        </div>

        {/* CTA */}
        <Link
          to="/evaluate"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 18px",
            background: theme.violet,
            color: "#fff",
            borderRadius: theme.radiusFull,
            fontSize: 13,
            fontWeight: 600,
            transition: theme.transition,
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = theme.violetHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = theme.violet; }}
        >
          Start Evaluation
        </Link>
      </div>
    </nav>
  );
}
