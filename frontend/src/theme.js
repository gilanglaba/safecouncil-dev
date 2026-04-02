export const theme = {
  // Backgrounds
  bg: "#FAFAFE",
  bgWarm: "#F5F3F9",
  surface: "#FFFFFF",
  surfaceHover: "#F8F5FC",

  // Borders
  border: "#E8E4EF",
  borderSubtle: "#F0EDF5",

  // Text
  text: "#1A0A2E",
  textSec: "#5C4D6E",
  textTer: "#8E7FA3",

  // Brand - NYU Violet
  violet: "#57068C",
  violetLight: "#7B2BAF",
  violetHover: "#6A0DAF",
  violetPale: "#EEE6F3",
  violetBorder: "#D5B8E8",

  // UN Blue
  unBlue: "#5B92E5",
  unBlueDark: "#3D72C4",
  unBluePale: "#EBF2FD",
  unBlueBorder: "#B8D4F5",

  // Semantic colors
  green: "#0D9B5A",
  greenDark: "#0A7A47",
  greenPale: "#E6F7EF",
  greenBorder: "#9ADBBF",

  amber: "#C07B08",
  amberDark: "#9A6306",
  amberPale: "#FEF5E7",
  amberBorder: "#F5D28A",

  red: "#C93B3B",
  redDark: "#A82E2E",
  redPale: "#FDE8E8",
  redBorder: "#F5B8B8",

  // Typography
  fontSans: "'DM Sans', sans-serif",
  fontSerif: "serif",
  fontMono: "'DM Mono', monospace",

  // Shadows
  shadow: "0 1px 3px rgba(26,10,46,0.08), 0 1px 2px rgba(26,10,46,0.04)",
  shadowMd: "0 4px 12px rgba(26,10,46,0.10), 0 2px 4px rgba(26,10,46,0.06)",
  shadowLg: "0 8px 24px rgba(26,10,46,0.12), 0 4px 8px rgba(26,10,46,0.08)",

  // Radius
  radius: "8px",
  radiusMd: "12px",
  radiusLg: "16px",
  radiusFull: "9999px",

  // Transitions
  transition: "all 0.15s ease",
};

// Verdict color mapping
export const verdictColors = {
  APPROVE: { bg: theme.greenPale, text: theme.green, border: theme.greenBorder },
  REVIEW: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder },
  REJECT: { bg: theme.redPale, text: theme.red, border: theme.redBorder },
};

// Severity color mapping
export const severityColors = {
  CRITICAL: { bg: "#2D0A0A", text: "#FF6B6B", border: "#8B2020", label: "CRITICAL" },
  HIGH: { bg: theme.redPale, text: theme.red, border: theme.redBorder, label: "HIGH" },
  MEDIUM: { bg: theme.amberPale, text: theme.amber, border: theme.amberBorder, label: "MED" },
  LOW: { bg: "#F0F0F5", text: theme.textSec, border: theme.border, label: "LOW" },
};

// Speaker color mapping for debate
export const speakerColors = {
  "Expert A (Claude)": theme.violetLight,
  Claude: theme.violetLight,
  "Expert B (GPT-4o)": theme.green,
  "GPT-4o": theme.green,
  "Expert C (Gemini)": theme.unBlueDark,
  Gemini: theme.unBlueDark,
  Council: "#4A4060",
};

export function getSpeakerColor(speaker) {
  for (const [key, color] of Object.entries(speakerColors)) {
    if (speaker && speaker.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return theme.textSec;
}

export function getScoreColor(score) {
  if (score >= 80) return theme.green;
  if (score >= 60) return theme.amber;
  return theme.red;
}
