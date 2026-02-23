import { Link } from "react-router-dom";
import { theme } from "../theme";

export default function Footer() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${theme.border}`,
        background: theme.surface,
        padding: "32px 24px",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "linear-gradient(135deg, #57068C 0%, #3D72C4 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 12 }}>S</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>SafeCouncil</span>
        </div>

        <div style={{ display: "flex", align: "center", gap: 24, flexWrap: "wrap" }}>
          <Link to="/evaluate" style={{ fontSize: 13, color: theme.textSec }}>Evaluate</Link>
          <Link to="/dashboard" style={{ fontSize: 13, color: theme.textSec }}>Dashboard</Link>
          <Link to="/about" style={{ fontSize: 13, color: theme.textSec }}>About</Link>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: theme.textSec }}>
            © 2026 SafeCouncil · NYU SPS × UNICC AI Hub
          </div>
          <div
            style={{
              fontSize: 11,
              color: theme.textTer,
              marginTop: 2,
              display: "flex",
              alignItems: "center",
              gap: 4,
              justifyContent: "flex-end",
            }}
          >
            <span style={{
              display: "inline-flex",
              padding: "1px 6px",
              borderRadius: 4,
              background: theme.unBluePale,
              color: theme.unBlueDark,
              fontSize: 10,
              fontWeight: 600,
              border: `1px solid ${theme.unBlueBorder}`,
            }}>
              AI Digital Public Good
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
