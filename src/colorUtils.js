// Une couleur de bureau est stockée sous forme "#rrggbb" (opaque) ou
// "rgba(r, g, b, a)" (avec transparence) — cf. README, section "Couleurs".

export function toHex6(color) {
  if (!color) return "#eef1f4";
  if (color.startsWith("#"))
    return color.length >= 7 ? color.slice(0, 7) : color;
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return "#eef1f4";
  const [, r, g, b] = m;
  return `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}

export function toAlphaPercent(color) {
  if (!color) return 100;
  const m = color.match(/rgba\([^)]+,\s*([\d.]+)\s*\)/i);
  if (!m) return 100;
  return Math.round(Number(m[1]) * 100);
}

export function composeColor(hex, alphaPercent) {
  const alpha = Number(alphaPercent);
  if (alpha >= 100) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${(alpha / 100).toFixed(2)})`;
}
