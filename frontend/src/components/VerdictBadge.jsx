import { verdictColors, theme } from "../theme";

export default function VerdictBadge({ verdict, size = "md" }) {
  const colors = verdictColors[verdict] || {
    bg: theme.bgWarm,
    text: theme.textSec,
    border: theme.border,
  };

  const sizes = {
    sm: { fontSize: "11px", padding: "2px 8px", fontWeight: 600 },
    md: { fontSize: "13px", padding: "4px 12px", fontWeight: 700 },
    lg: { fontSize: "15px", padding: "6px 16px", fontWeight: 700 },
    xl: { fontSize: "22px", padding: "10px 24px", fontWeight: 800, letterSpacing: "0.05em" },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: colors.bg,
        color: colors.text,
        border: `1.5px solid ${colors.border}`,
        borderRadius: 6,
        fontFamily: "'DM Sans', sans-serif",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        ...sizes[size],
      }}
    >
      {verdict === "APPROVE" && "✓ "}
      {verdict === "REVIEW" && "⚠ "}
      {verdict === "REJECT" && "✕ "}
      {verdict || "—"}
    </span>
  );
}
