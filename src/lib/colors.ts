export const PAPER = "#f4ecd8";
export const PAPER_DK = "#e8dcc0";
export const INK = "#1a1614";
export const STAMP_RED = "#b91c1c";
export const GAIN = "#1f6b3a";
export const LOSS = "#b91c1c";
export const CARD_BG = "#fffaf0";

// Earth-tone palette assigned to top-6 winners (excluding the top earner who is GAIN).
export const FIELD_TOP_PALETTE: Record<number, string> = {
  // index 0 (top earner) is rendered in GAIN; others fall back to this map.
  1: "#d4a017", // gold
  2: "#5a7a3a", // olive
  3: "#8b6914", // umber
  4: "#3b5998", // navy
  5: "#7a4e2d", // sienna
};

// Deepest losses palette (5 entries, deepest → shallowest).
export const FIELD_LOSER_PALETTE = [
  "#5a5a5a",
  "#787878",
  "#909090",
  "#a8a8a8",
  "#c0c0c0",
];
