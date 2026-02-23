import { getScoreColor, theme } from "../theme";

export default function ScoreBar({ score, showLabel = true, height = 6, compact = false }) {
  const pct = Math.min(100, Math.max(0, score || 0));
  const color = getScoreColor(pct);

  if (compact) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            flex: 1,
            height,
            background: theme.border,
            borderRadius: height / 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: color,
              borderRadius: height / 2,
              transition: "width 0.6s ease",
            }}
          />
        </div>
        {showLabel && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color,
              fontFamily: "'DM Mono', monospace",
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {pct}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      {showLabel && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 13, color: theme.textSec }}></span>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color,
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {pct}/100
          </span>
        </div>
      )}
      <div
        style={{
          height,
          background: theme.border,
          borderRadius: height / 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            borderRadius: height / 2,
            transition: "width 0.8s ease",
          }}
        />
      </div>
    </div>
  );
}
