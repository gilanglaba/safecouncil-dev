import { theme } from "../theme";

const PRESETS = {
  violet: { bg: theme.violetPale, text: theme.violet, border: theme.violetBorder },
  blue: { bg: theme.unBluePale, text: theme.unBlueDark, border: theme.unBlueBorder },
  green: { bg: theme.greenPale, text: theme.green, border: theme.greenBorder },
  amber: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
  red: { bg: theme.redPale, text: theme.red, border: theme.redBorder },
  gray: { bg: "#F0F0F5", text: theme.textSec, border: theme.border },
  dark: { bg: "#2A1540", text: "#C8A8F0", border: "#4A2870" },
};

export default function Badge({ label, preset = "gray", style = {} }) {
  const colors = PRESETS[preset] || PRESETS.gray;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {label}
    </span>
  );
}
