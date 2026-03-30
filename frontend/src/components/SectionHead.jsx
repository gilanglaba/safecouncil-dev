import { theme } from "../theme";
import Badge from "./Badge";

export default function SectionHead({ num, title, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: theme.violetPale,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
          color: theme.violet,
        }}
      >
        {num}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: theme.text }}>{title}</h2>
      {badge}
    </div>
  );
}
