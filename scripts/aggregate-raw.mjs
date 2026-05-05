// Read the raw league ledger (data/raw.csv) and produce the three intermediate
// CSVs that build-data.mjs consumes:
//   - data/games.csv             one row per (game_num, player) settlement
//   - data/player_totals.csv     per-player aggregates (overall + PLO + NL)
//   - data/cumulative_by_date.csv  wide table of running net by date × player
//
// Re-run after editing data/raw.csv:  node scripts/aggregate-raw.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");

// ── Parse a CSV that may contain quoted fields with embedded commas. ─────────
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (cell !== "" || row.length) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (c === "\r" && text[i + 1] === "\n") i++;
    } else {
      cell += c;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ── Parse a money cell like " $ 3,020.75 ", " $ (250.00)", " $ - " ──────────
function parseMoney(s) {
  const t = String(s).replace(/\s+/g, "").replace(/\$/g, "").replace(/,/g, "");
  if (!t || t === "-") return 0;
  const neg = t.startsWith("(") && t.endsWith(")");
  const inner = neg ? t.slice(1, -1) : t;
  const n = Number(inner);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
}

// ── Date "4/13/2026" → "2026-04-13" ─────────────────────────────────────────
function isoDate(s) {
  const [m, d, y] = s.split("/").map((x) => x.trim());
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const raw = readFileSync(join(dataDir, "raw.csv"), "utf8");
const rows = parseCSV(raw);
const header = rows[0].map((h) => h.trim());
const idx = (name) => header.findIndex((h) => h === name);
const iDate = idx("Date");
const iGame = idx("Game #");
const iType = idx("Game Type");
const iPlayer = idx("Player");
const iNet = header.findIndex((h) => h.trim() === "Net");

const games = rows
  .slice(1)
  .filter((r) => r[iDate] && r[iPlayer])
  .map((r) => ({
    date: isoDate(r[iDate]),
    game_num: Number(r[iGame]),
    game_type: r[iType].trim(),
    player: r[iPlayer].trim(),
    net: parseMoney(r[iNet]),
  }));

// ── games.csv ───────────────────────────────────────────────────────────────
{
  const lines = ["date,game_num,game_type,player,net"];
  for (const g of games) {
    lines.push(`${g.date},${g.game_num},${g.game_type},${g.player},${g.net}`);
  }
  writeFileSync(join(dataDir, "games.csv"), lines.join("\n") + "\n");
}

// ── player_totals.csv ───────────────────────────────────────────────────────
const byPlayer = new Map();
for (const g of games) {
  if (!byPlayer.has(g.player)) {
    byPlayer.set(g.player, {
      Player: g.player,
      total: { net: 0, games: 0, wins: 0 },
      PLO: { net: 0, games: 0, wins: 0 },
      NL: { net: 0, games: 0, wins: 0 },
    });
  }
  const rec = byPlayer.get(g.player);
  const fmt = g.game_type;
  rec.total.net += g.net;
  rec.total.games += 1;
  if (g.net > 0) rec.total.wins += 1;
  if (rec[fmt]) {
    rec[fmt].net += g.net;
    rec[fmt].games += 1;
    if (g.net > 0) rec[fmt].wins += 1;
  }
}

const round = (n) => Math.round(n * 100) / 100;
const totals = [...byPlayer.values()]
  .map((p) => ({
    Player: p.Player,
    TotalNet: round(p.total.net),
    Games: p.total.games,
    Avg: p.total.games ? p.total.net / p.total.games : 0,
    WinPct: p.total.games ? p.total.wins / p.total.games : 0,
    PLONet: round(p.PLO.net),
    PLOGames: p.PLO.games,
    PLOAvg: p.PLO.games ? p.PLO.net / p.PLO.games : "",
    PLOWinPct: p.PLO.games ? p.PLO.wins / p.PLO.games : "",
    NLNet: round(p.NL.net),
    NLGames: p.NL.games,
    NLAvg: p.NL.games ? p.NL.net / p.NL.games : "",
    NLWinPct: p.NL.games ? p.NL.wins / p.NL.games : "",
  }))
  .sort((a, b) => b.TotalNet - a.TotalNet);

{
  const cols = [
    "Player",
    "TotalNet",
    "Games",
    "Avg",
    "WinPct",
    "PLONet",
    "PLOGames",
    "PLOAvg",
    "PLOWinPct",
    "NLNet",
    "NLGames",
    "NLAvg",
    "NLWinPct",
  ];
  const lines = [cols.join(",")];
  for (const r of totals) {
    lines.push(cols.map((c) => r[c]).join(","));
  }
  writeFileSync(join(dataDir, "player_totals.csv"), lines.join("\n") + "\n");
}

// ── cumulative_by_date.csv ──────────────────────────────────────────────────
// Player order matches the original: order by first appearance in the ledger.
const playerOrder = [];
const seen = new Set();
for (const g of games) {
  if (!seen.has(g.player)) {
    seen.add(g.player);
    playerOrder.push(g.player);
  }
}

const dates = [...new Set(games.map((g) => g.date))].sort();
const running = Object.fromEntries(playerOrder.map((p) => [p, 0]));
const rowsOut = [];
for (const d of dates) {
  for (const g of games) {
    if (g.date === d) running[g.player] += g.net;
  }
  rowsOut.push({ date: d, ...Object.fromEntries(playerOrder.map((p) => [p, round(running[p])])) });
}

{
  const cols = ["date", ...playerOrder];
  const lines = [cols.join(",")];
  for (const r of rowsOut) {
    lines.push(cols.map((c) => r[c]).join(","));
  }
  writeFileSync(join(dataDir, "cumulative_by_date.csv"), lines.join("\n") + "\n");
}

console.log(
  `Aggregated ${games.length} settlements · ${playerOrder.length} players · ${dates.length} dates.`,
);
