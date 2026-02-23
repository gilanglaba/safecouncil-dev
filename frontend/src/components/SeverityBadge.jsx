import { severityColors, theme } from "../theme";

export default function SeverityBadge({ severity }) {
  const colors = severityColors[severity?.toUpperCase()] || severityColors.LOW;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: "11px",
        fontWeight: 700,
        fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.06em",
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {colors.label || severity}
    </span>
  );
}
