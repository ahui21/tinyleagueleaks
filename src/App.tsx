import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Analytics } from "@vercel/analytics/react";
import { players, games, cumulative } from "./data";
import type { Player } from "./data";
import {
  CARD_BG,
  FIELD_LOSER_PALETTE,
  FIELD_TOP_PALETTE,
  GAIN,
  INK,
  LOSS,
  PAPER,
  PAPER_DK,
  STAMP_RED,
} from "./lib/colors";
import {
  fmtDate,
  fmtDateLong,
  fmtMoney,
  fmtMoneyShort,
  fmtPct,
  fmtPct1,
} from "./lib/format";
import { useMediaQuery } from "./lib/useMediaQuery";
import {
  buildFingerprint,
  getVisitorId,
  postLog,
} from "./lib/fingerprint";
import { ColumnRule, Eyebrow, Section, Stamp, Stat } from "./components/primitives";

// ─────────────────────────────────────────────────────────────────────────────
// Replace with the league's actual Google Sheet URL before deploy.
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/12EnTwgG6owH2ltR8e19vAlzPvmaWtC3N7KZvHdpH0cw/edit?usp=sharing";
// ─────────────────────────────────────────────────────────────────────────────

const sortedByNet = [...players].sort((a, b) => b.TotalNet - a.TotalNet);
const winners = sortedByNet.filter((p) => p.TotalNet > 0);
const losers = [...players]
  .filter((p) => p.TotalNet < 0)
  .sort((a, b) => a.TotalNet - b.TotalNet); // most negative first

const topGain = sortedByNet[0];
const totalWinnings = winners.reduce((s, p) => s + p.TotalNet, 0);
const topGainShareOfPot = topGain.TotalNet / totalWinnings;
const runnerUp = sortedByNet[1];
const topVsRunner = topGain.TotalNet / runnerUp.TotalNet;

const topGainGames = games
  .filter((g) => g.player === topGain.Player)
  .sort((a, b) => a.game_num - b.game_num);
const topGainBest = topGainGames.reduce(
  (best, g) => (g.net > best.net ? g : best),
  topGainGames[0],
);
const topGainBigWins = topGainGames
  .filter((g) => g.net > 1500)
  .sort((a, b) => b.net - a.net)
  .slice(0, 4);
const topGainSpecialty: "PLO" | "NL" =
  topGain.PLONet >= topGain.NLNet ? "PLO" : "NL";
const topGainSpecialtyNet =
  topGainSpecialty === "PLO" ? topGain.PLONet : topGain.NLNet;
const topGainSpecialtyGames =
  topGainSpecialty === "PLO" ? topGain.PLOGames : topGain.NLGames;

const topGainCumulative = cumulative.map((row) => ({
  date: row.date as string,
  net: Number(row[topGain.Player] ?? 0),
}));

const topGainBarData = topGainGames.map((g) => ({
  label: `G${g.game_num}`,
  net: g.net,
  date: g.date,
  type: g.game_type,
}));

const fieldTrack = [...sortedByNet.slice(0, 5), ...losers.slice(0, 5)];
const fieldTrackMobile = [...sortedByNet.slice(0, 5), ...losers.slice(0, 3)];

function colorForFieldPlayer(name: string): string {
  if (name === topGain.Player) return GAIN;
  const winnerIdx = sortedByNet.findIndex((p) => p.Player === name);
  if (winnerIdx >= 1 && winnerIdx <= 4) {
    return FIELD_TOP_PALETTE[winnerIdx];
  }
  const loserIdx = losers.findIndex((p) => p.Player === name);
  if (loserIdx >= 0 && loserIdx < FIELD_LOSER_PALETTE.length) {
    return FIELD_LOSER_PALETTE[loserIdx];
  }
  return INK;
}

const topSingleGames = [...games].sort((a, b) => b.net - a.net).slice(0, 10);
const bottomSingleGames = [...games].sort((a, b) => a.net - b.net).slice(0, 10);

// ─────────────────────────────────────────────────────────────────────────────

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 text-sm"
      style={{
        background: PAPER,
        border: `2px solid ${INK}`,
        fontFamily: "'EB Garamond', serif",
        borderRadius: 0,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest opacity-70"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label)
          ? fmtDate(label)
          : label}
      </div>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block"
            style={{
              width: 10,
              height: 3,
              background: entry.color || entry.fill,
            }}
          />
          <span className="font-bold">
            {entry.name === "net" ? topGain.Player : entry.name}
          </span>
          <span style={{ color: entry.value < 0 ? LOSS : GAIN }}>
            {fmtMoney(Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

function BarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      className="px-3 py-2 text-sm"
      style={{
        background: PAPER,
        border: `2px solid ${INK}`,
        fontFamily: "'EB Garamond', serif",
        borderRadius: 0,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest opacity-70"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {fmtDate(p.date)} · {p.type}
      </div>
      <div className="font-bold" style={{ color: p.net < 0 ? LOSS : GAIN }}>
        {fmtMoney(p.net)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTHEAD
function Masthead() {
  return (
    <Section className="pt-6 sm:pt-10 pb-2">
      <div
        className="flex items-center justify-between text-[10px] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.3em] pb-3 border-b"
        style={{ fontFamily: "'DM Mono', monospace", borderColor: INK }}
      >
        <span>Vol. I · No. 1</span>
        <span className="hidden md:inline italic opacity-80 normal-case tracking-normal">
          — A Periodical of Felt Affairs —
        </span>
        <span>Apr. 26, 2026</span>
      </div>

      <h1
        className="font-black italic text-center leading-[0.9] tracking-tight pt-6 pb-5"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(40px, 12vw, 132px)",
          letterSpacing: "-0.02em",
        }}
      >
        Tiny League Leaks
      </h1>

      <div
        className="border-y py-2 text-center text-[10px] sm:text-sm uppercase tracking-[0.25em] sm:tracking-[0.35em]"
        style={{ borderColor: INK, fontFamily: "'DM Mono', monospace" }}
      >
        <span className="block sm:inline">The Felt Doesn't Lie</span>
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Receipts Inside</span>
        <span className="hidden sm:inline"> · </span>
        <span className="block sm:inline">Names Will Not Be Redacted</span>
      </div>

      <div
        className="flex items-center justify-between pt-3 pb-4 text-[10px] sm:text-xs"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        <span className="italic opacity-70 normal-case tracking-normal text-[12px] sm:text-sm">
          “The cards saw everything.”
        </span>
        <span className="uppercase tracking-[0.2em] text-right">
          {games.length > 0 ? "36 games · 13 nights · " : ""}
          {players.length} players
        </span>
      </div>
      <div
        className="border-b-8 border-double"
        style={{ borderColor: INK }}
      />
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEAD STORY
function LeadStory() {
  return (
    <Section className="py-8 sm:py-12">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10">
        <div className="md:col-span-8">
          <Eyebrow red>▸ Lead Story · Investigative</Eyebrow>
          <h2
            className="font-black italic mt-3 leading-[1.05]"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(30px, 6.5vw, 72px)",
              letterSpacing: "-0.01em",
            }}
          >
            One Player Has Won{" "}
            <span style={{ color: GAIN, fontStyle: "italic" }}>
              {fmtMoney(topGain.TotalNet)}
            </span>{" "}
            Across 13 Nights of Cards.
          </h2>
          <p
            className="mt-6 text-[17px] sm:text-lg md:text-xl leading-[1.55]"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            <span
              className="uppercase tracking-[0.2em] text-xs mr-2"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              Tiny League —
            </span>
            Between {fmtDateLong("2026-04-13")} and {fmtDateLong("2026-04-25")},{" "}
            {players.length} players sat down at the Tiny League's tables. When
            the chips were counted on the final night, a single name had taken
            home <em>{fmtPct1(topGainShareOfPot)}</em> of all money won
            league-wide. The figure is{" "}
            <strong>{topVsRunner.toFixed(1)}×</strong> the next-highest winner.
            The data, sourced from the league's own ledger, is presented below
            in full.
          </p>
        </div>

        <aside
          className="md:col-span-4 border-2 p-5 sm:p-6 relative"
          style={{ borderColor: INK, background: PAPER_DK }}
        >
          <div className="absolute -top-4 right-4">
            <Stamp text="THE LEAK" rotate={6} />
          </div>
          <div
            className="text-[10px] uppercase tracking-[0.3em] opacity-70 pb-3"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            Headline Figures
          </div>
          <DottedRow label="Top Earner" value={topGain.Player} />
          <DottedRow
            label="Net Winnings"
            value={fmtMoney(topGain.TotalNet)}
            color={GAIN}
          />
          <DottedRow label="Games Played" value={topGain.Games} />
          <DottedRow label="Win Rate" value={fmtPct1(topGain.WinPct)} />
          <DottedRow
            label="Avg per Game"
            value={fmtMoney(topGain.Avg)}
            color={topGain.Avg >= 0 ? GAIN : LOSS}
          />
          <DottedRow
            label="Best Game"
            value={fmtMoney(topGainBest.net)}
            color={GAIN}
            last
          />
        </aside>
      </div>
    </Section>
  );
}

function DottedRow({
  label,
  value,
  color,
  last,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  last?: boolean;
}) {
  return (
    <div
      className={
        "flex items-baseline justify-between gap-3 py-2 " +
        (last ? "" : "border-b border-dotted")
      }
      style={{ borderColor: INK + "40" }}
    >
      <span
        className="text-[10px] uppercase tracking-widest opacity-70"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {label}
      </span>
      <span
        className="font-bold text-right text-base sm:text-lg"
        style={{ color: color ?? INK }}
      >
        {value}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THE DOSSIER
type BarFilter = "ALL" | "PLO" | "NL";

function Dossier() {
  const [barFilter, setBarFilter] = useState<BarFilter>("ALL");
  return (
    <Section className="py-8 sm:py-12">
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <Eyebrow red>Exhibit A</Eyebrow>
          <h3
            className="font-black italic mt-2"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(28px, 5vw, 48px)",
              letterSpacing: "-0.01em",
            }}
          >
            The Dossier
          </h3>
        </div>
        <Stamp text="EVIDENCE" rotate={-4} />
      </div>
      <p
        className="italic max-w-3xl text-base sm:text-lg leading-[1.5] mb-6"
        style={{ fontFamily: "'EB Garamond', serif" }}
      >
        Cumulative net winnings of <strong>{topGain.Player}</strong> over the
        13-night observation window. Each marker is one game-night. Trend line
        ascends almost without interruption.
      </p>

      <div
        className="border-2 p-3 sm:p-5"
        style={{ borderColor: INK, background: CARD_BG }}
      >
        <DossierLineChart />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div
          className="md:col-span-2 border-2 p-3 sm:p-5"
          style={{ borderColor: INK, background: CARD_BG }}
        >
          <div className="flex items-center justify-between flex-wrap gap-2 pb-3">
            <div
              className="text-[10px] uppercase tracking-[0.3em] opacity-70"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              Per-Game Result · {topGain.Player}
            </div>
            <FormatToggle value={barFilter} onChange={setBarFilter} />
          </div>
          <DossierBarChart filter={barFilter} />
        </div>

        <aside
          className="border-2 p-5"
          style={{ borderColor: INK, background: PAPER_DK }}
        >
          <Eyebrow red className="mb-2">
            The Hot Hand
          </Eyebrow>
          <p
            className="mb-3 leading-[1.5]"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Of {topGain.Games} games played,{" "}
            <strong>{Math.round(topGain.WinPct * topGain.Games)}</strong> ended
            in profit.
          </p>
          <p
            className="mb-2 leading-[1.5]"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            The four largest single-game wins of the entire league belong to{" "}
            <strong>{topGain.Player}</strong>:
          </p>
          <ul className="space-y-2 mb-4">
            {topGainBigWins.map((g) => (
              <li
                key={g.game_num}
                className="flex items-baseline justify-between gap-3 border-b border-dotted pb-1"
                style={{ borderColor: INK + "40" }}
              >
                <span
                  className="text-xs uppercase tracking-widest opacity-70"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {fmtDate(g.date)} · G{g.game_num} · {g.game_type}
                </span>
                <span className="font-bold" style={{ color: GAIN }}>
                  {fmtMoney(g.net)}
                </span>
              </li>
            ))}
          </ul>
          <p
            className="italic text-sm opacity-80"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            Specialty: {topGainSpecialty}, where the subject won{" "}
            {fmtMoney(topGainSpecialtyNet)} over {topGainSpecialtyGames} games.
          </p>
        </aside>
      </div>
    </Section>
  );
}

function DossierLineChart() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  return (
    <div style={{ width: "100%", height: isMobile ? 260 : 340 }}>
      <ResponsiveContainer>
        <LineChart
          data={topGainCumulative}
          margin={{ top: 12, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid stroke={INK + "20"} strokeDasharray="2 4" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{
              fill: INK,
              fontSize: isMobile ? 9 : 11,
              fontFamily: "'DM Mono', monospace",
            }}
            interval={isMobile ? 1 : 0}
            axisLine={{ stroke: INK }}
            tickLine={{ stroke: INK }}
          />
          <YAxis
            tickFormatter={(v) => fmtMoneyShort(Number(v))}
            tick={{
              fill: INK,
              fontSize: isMobile ? 9 : 11,
              fontFamily: "'DM Mono', monospace",
            }}
            axisLine={{ stroke: INK }}
            tickLine={{ stroke: INK }}
            width={isMobile ? 44 : 60}
          />
          <ReferenceLine y={0} stroke={INK} strokeWidth={1} />
          <Tooltip content={<MoneyTooltip />} cursor={{ stroke: INK, strokeDasharray: "2 4" }} />
          <Line
            type="monotone"
            dataKey="net"
            name={topGain.Player}
            stroke={GAIN}
            strokeWidth={3}
            dot={{ fill: GAIN, r: 4, strokeWidth: 0 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function FormatToggle({
  value,
  onChange,
}: {
  value: BarFilter;
  onChange: (v: BarFilter) => void;
}) {
  const opts: BarFilter[] = ["ALL", "PLO", "NL"];
  return (
    <div
      className="inline-flex border"
      style={{
        borderColor: INK,
        fontFamily: "'DM Mono', monospace",
      }}
    >
      {opts.map((o) => {
        const selected = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            aria-pressed={selected}
            className="px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition-colors"
            style={{
              background: selected ? INK : "transparent",
              color: selected ? PAPER : INK,
              minHeight: 32,
              borderLeft: o === "ALL" ? "none" : `1px solid ${INK}`,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function DossierBarChart({ filter }: { filter: BarFilter }) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const data = useMemo(
    () =>
      topGainBarData.filter((d) =>
        filter === "ALL" ? true : d.type === filter,
      ),
    [filter],
  );
  return (
    <div style={{ width: "100%", height: isMobile ? 240 : 280 }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
        >
          <CartesianGrid stroke={INK + "15"} strokeDasharray="2 4" />
          <XAxis
            dataKey="label"
            tick={{
              fill: INK,
              fontSize: isMobile ? 9 : 10,
              fontFamily: "'DM Mono', monospace",
            }}
            interval={isMobile ? 1 : 0}
            axisLine={{ stroke: INK }}
            tickLine={{ stroke: INK }}
          />
          <YAxis
            tickFormatter={(v) => fmtMoneyShort(Number(v))}
            tick={{
              fill: INK,
              fontSize: isMobile ? 9 : 10,
              fontFamily: "'DM Mono', monospace",
            }}
            width={isMobile ? 44 : 60}
            axisLine={{ stroke: INK }}
            tickLine={{ stroke: INK }}
          />
          <ReferenceLine y={0} stroke={INK} />
          <Tooltip content={<BarTooltip />} cursor={{ fill: INK + "08" }} />
          <Bar dataKey="net" radius={0}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.net >= 0 ? GAIN : LOSS} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FIELD
function TheField() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const tracked = isMobile ? fieldTrackMobile : fieldTrack;

  return (
    <Section className="py-8 sm:py-12">
      <Eyebrow red>The Field</Eyebrow>
      <h3
        className="font-black italic mt-2 mb-3"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(28px, 5vw, 48px)",
          letterSpacing: "-0.01em",
        }}
      >
        The Money in Motion
      </h3>
      <p
        className="italic max-w-3xl text-base sm:text-lg leading-[1.5] mb-6"
        style={{ fontFamily: "'EB Garamond', serif" }}
      >
        Cumulative net for the league's top five earners and{" "}
        {isMobile ? "three" : "five"} deepest losses, drawn night by night.
      </p>

      <div
        className="border-2 p-3 sm:p-5"
        style={{ borderColor: INK, background: CARD_BG }}
      >
        <div style={{ width: "100%", height: isMobile ? 280 : 420 }}>
          <ResponsiveContainer>
            <LineChart
              data={cumulative}
              margin={{ top: 12, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke={INK + "20"} strokeDasharray="2 4" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{
                  fill: INK,
                  fontSize: isMobile ? 9 : 11,
                  fontFamily: "'DM Mono', monospace",
                }}
                interval={isMobile ? 1 : 0}
                axisLine={{ stroke: INK }}
                tickLine={{ stroke: INK }}
              />
              <YAxis
                tickFormatter={(v) => fmtMoneyShort(Number(v))}
                tick={{
                  fill: INK,
                  fontSize: isMobile ? 9 : 11,
                  fontFamily: "'DM Mono', monospace",
                }}
                width={isMobile ? 44 : 60}
                axisLine={{ stroke: INK }}
                tickLine={{ stroke: INK }}
              />
              <ReferenceLine y={0} stroke={INK} strokeWidth={1.5} />
              <Tooltip
                content={<MoneyTooltip />}
                cursor={{ stroke: INK, strokeDasharray: "2 4" }}
              />
              {tracked.map((p) => {
                const isTop = p.Player === topGain.Player;
                return (
                  <Line
                    key={p.Player}
                    type="monotone"
                    dataKey={p.Player}
                    stroke={colorForFieldPlayer(p.Player)}
                    strokeWidth={isTop ? 3.5 : 1.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2 pt-5">
        {tracked.map((p) => {
          const isTop = p.Player === topGain.Player;
          return (
            <li
              key={p.Player}
              className="flex items-center gap-2 text-xs"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 16,
                  height: 3,
                  background: colorForFieldPlayer(p.Player),
                }}
              />
              <span
                className={isTop ? "font-bold" : "opacity-80"}
                style={isTop ? { color: GAIN } : undefined}
              >
                {p.Player}
              </span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// THE STANDINGS
function Standings({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (p: string) => void;
}) {
  return (
    <Section id="standings" className="py-8 sm:py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
        <StandingsList
          eyebrow="The Standings"
          eyebrowRed
          title="Friends in the Black"
          rows={winners}
          selected={selected}
          onSelect={onSelect}
          tone="gain"
          showTopBadge
        />
        <StandingsList
          eyebrow="The Settlements"
          title="Friends in the Red"
          rows={losers}
          selected={selected}
          onSelect={onSelect}
          tone="loss"
        />
      </div>
    </Section>
  );
}

function StandingsList({
  eyebrow,
  eyebrowRed,
  title,
  rows,
  selected,
  onSelect,
  tone,
  showTopBadge,
}: {
  eyebrow: string;
  eyebrowRed?: boolean;
  title: string;
  rows: Player[];
  selected: string;
  onSelect: (p: string) => void;
  tone: "gain" | "loss";
  showTopBadge?: boolean;
}) {
  const accent = tone === "gain" ? GAIN : LOSS;
  return (
    <div>
      <Eyebrow red={!!eyebrowRed}>{eyebrow}</Eyebrow>
      <h3
        className="font-black italic mt-2 mb-4"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(26px, 4vw, 40px)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>

      {/* Desktop table */}
      <div
        className="hidden md:block border-2"
        style={{ borderColor: INK, background: CARD_BG }}
      >
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr
              className="uppercase tracking-widest"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              <th
                className="text-left p-2 border-b-2 w-10"
                style={{ borderColor: INK }}
              >
                #
              </th>
              <th
                className="text-left p-2 border-b-2"
                style={{ borderColor: INK }}
              >
                Player
              </th>
              <th
                className="text-right p-2 border-b-2"
                style={{ borderColor: INK }}
              >
                Net
              </th>
              <th
                className="text-right p-2 border-b-2 w-16"
                style={{ borderColor: INK }}
              >
                Games
              </th>
              <th
                className="text-right p-2 border-b-2 w-16"
                style={{ borderColor: INK }}
              >
                Win %
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => {
              const isSelected = p.Player === selected;
              return (
                <tr
                  key={p.Player}
                  onClick={() => onSelect(p.Player)}
                  className="cursor-pointer transition-colors"
                  style={{
                    background: isSelected ? accent + "18" : undefined,
                  }}
                >
                  <td
                    className="p-2 border-b border-dotted opacity-70"
                    style={{
                      borderColor: INK + "30",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td
                    className="p-2 border-b border-dotted font-bold"
                    style={{ borderColor: INK + "30" }}
                  >
                    {p.Player}
                    {showTopBadge && i === 0 ? (
                      <span
                        className="ml-2 text-[10px] tracking-widest px-1.5 py-0.5"
                        style={{
                          background: INK,
                          color: PAPER,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        TOP
                      </span>
                    ) : null}
                  </td>
                  <td
                    className="p-2 border-b border-dotted text-right font-bold"
                    style={{ borderColor: INK + "30", color: accent }}
                  >
                    {fmtMoney(p.TotalNet)}
                  </td>
                  <td
                    className="p-2 border-b border-dotted text-right tabular-nums"
                    style={{
                      borderColor: INK + "30",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {p.Games}
                  </td>
                  <td
                    className="p-2 border-b border-dotted text-right tabular-nums"
                    style={{
                      borderColor: INK + "30",
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {fmtPct(p.WinPct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden space-y-2">
        {rows.map((p, i) => {
          const isSelected = p.Player === selected;
          return (
            <li key={p.Player}>
              <button
                onClick={() => onSelect(p.Player)}
                className="w-full text-left border-2 p-3"
                style={{
                  borderColor: INK,
                  background: isSelected ? accent + "18" : CARD_BG,
                  minHeight: 64,
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs opacity-70 w-5 text-right"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-bold text-base flex-1">
                    {p.Player}
                  </span>
                  {showTopBadge && i === 0 ? (
                    <span
                      className="text-[10px] tracking-widest px-1.5 py-0.5"
                      style={{
                        background: INK,
                        color: PAPER,
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      TOP
                    </span>
                  ) : null}
                </div>
                <div
                  className="flex items-baseline justify-between mt-2 gap-3"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  <span
                    className="text-lg font-bold tracking-tight"
                    style={{
                      color: accent,
                      fontFamily: "'EB Garamond', serif",
                    }}
                  >
                    {fmtMoney(p.TotalNet)}
                  </span>
                  <span className="text-xs opacity-80">
                    {p.Games} games · {fmtPct(p.WinPct)} win
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONNEL FILE
function PersonnelFile({
  selected,
  onSelect,
  cardRef,
}: {
  selected: string;
  onSelect: (p: string) => void;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const player = useMemo(
    () => players.find((p) => p.Player === selected) ?? topGain,
    [selected],
  );
  const rank = useMemo(
    () => sortedByNet.findIndex((p) => p.Player === player.Player) + 1,
    [player.Player],
  );

  const cum = useMemo(
    () =>
      cumulative.map((row) => ({
        date: row.date as string,
        net: Number(row[player.Player] ?? 0),
      })),
    [player.Player],
  );

  const playerBest = useMemo(() => {
    const list = games.filter((g) => g.player === player.Player);
    if (!list.length) return null;
    return list.reduce((best, g) => (g.net > best.net ? g : best), list[0]);
  }, [player.Player]);

  const winnerColor = player.TotalNet >= 0 ? GAIN : LOSS;

  return (
    <Section className="py-8 sm:py-12">
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <Eyebrow red>Personnel File</Eyebrow>
          <h3
            className="font-black italic mt-2"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(28px, 5vw, 48px)",
              letterSpacing: "-0.01em",
            }}
          >
            Pull Anyone's Card
          </h3>
        </div>
        <Stamp text="CLASSIFIED" rotate={5} color={INK} />
      </div>
      <p
        className="italic max-w-3xl text-base sm:text-lg leading-[1.5] mb-6"
        style={{ fontFamily: "'EB Garamond', serif" }}
      >
        Select a player below — or click any name in the standings.
      </p>

      <div
        className="border-2 p-4 mb-6"
        style={{ borderColor: INK, background: PAPER_DK }}
      >
        <div
          className="text-[10px] uppercase tracking-[0.3em] opacity-70 pb-3"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          Roster · {players.length} players
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sortedByNet.map((p) => {
            const isSelected = p.Player === selected;
            const tone = p.TotalNet >= 0 ? GAIN : LOSS;
            return (
              <button
                key={p.Player}
                onClick={() => onSelect(p.Player)}
                className="px-2.5 py-1 text-xs border whitespace-nowrap"
                style={{
                  fontFamily: "'DM Mono', monospace",
                  borderColor: isSelected ? INK : INK + "40",
                  background: isSelected ? INK : "transparent",
                  color: isSelected ? PAPER : INK,
                  minHeight: 32,
                }}
              >
                <span className="mr-1">{p.Player}</span>
                <span
                  style={{
                    color: isSelected ? PAPER : tone,
                    opacity: isSelected ? 0.85 : 1,
                  }}
                >
                  {fmtMoneyShort(p.TotalNet)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={cardRef}
        className="border-2"
        style={{ borderColor: INK, background: CARD_BG }}
      >
        <div
          className="p-4 sm:p-6 border-b-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"
          style={{ borderColor: INK, background: PAPER_DK }}
        >
          <div>
            <h4
              className="font-black italic leading-none"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(28px, 6.5vw, 44px)",
                letterSpacing: "-0.01em",
              }}
            >
              {player.Player}
            </h4>
            <div
              className="text-[10px] uppercase tracking-[0.3em] opacity-70 mt-2"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              Rank {rank} of {players.length}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <div
              className="text-[10px] uppercase tracking-[0.3em] opacity-70"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              Net
            </div>
            <div
              className="font-bold leading-none mt-1"
              style={{
                color: winnerColor,
                fontSize: "clamp(28px, 7vw, 48px)",
              }}
            >
              {fmtMoney(player.TotalNet)}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-3">
          <Stat label="Games" value={player.Games} />
          <Stat label="Win Rate" value={fmtPct1(player.WinPct)} />
          <Stat
            label="Avg / Game"
            value={fmtMoney(player.Avg)}
            highlight={player.Avg >= 0}
          />
          <Stat
            label="Best Hand"
            value={playerBest ? fmtMoney(playerBest.net) : "—"}
            highlight={playerBest ? playerBest.net >= 0 : "neutral"}
          />
          <Stat
            label="PLO Net"
            value={player.PLOGames ? fmtMoney(player.PLONet) : "—"}
            highlight={
              !player.PLOGames ? "neutral" : player.PLONet >= 0
            }
          />
          <Stat label="PLO Games" value={player.PLOGames || "—"} />
          <Stat
            label="NL Net"
            value={player.NLGames ? fmtMoney(player.NLNet) : "—"}
            highlight={!player.NLGames ? "neutral" : player.NLNet >= 0}
          />
          <Stat label="NL Games" value={player.NLGames || "—"} />
        </div>

        <div className="p-3 sm:p-5 border-t-2" style={{ borderColor: INK }}>
          <div
            className="text-[10px] uppercase tracking-[0.3em] opacity-70 pb-3"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            Cumulative Net · Apr 13 → Apr 25
          </div>
          <PersonnelChart data={cum} color={winnerColor} name={player.Player} />
        </div>
      </div>
    </Section>
  );
}

function PersonnelChart({
  data,
  color,
  name,
}: {
  data: { date: string; net: number }[];
  color: string;
  name: string;
}) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  return (
    <div style={{ width: "100%", height: isMobile ? 240 : 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={INK + "20"} strokeDasharray="2 4" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{
              fill: INK,
              fontSize: isMobile ? 9 : 10,
              fontFamily: "'DM Mono', monospace",
            }}
            interval={isMobile ? 1 : 0}
            axisLine={{ stroke: INK }}
            tickLine={{ stroke: INK }}
          />
          <YAxis
            tickFormatter={(v) => fmtMoneyShort(Number(v))}
            tick={{
              fill: INK,
              fontSize: isMobile ? 9 : 10,
              fontFamily: "'DM Mono', monospace",
            }}
            width={isMobile ? 44 : 60}
            axisLine={{ stroke: INK }}
            tickLine={{ stroke: INK }}
          />
          <ReferenceLine y={0} stroke={INK} />
          <Tooltip content={<PlayerTooltip name={name} active={false} payload={[]} label="" />} cursor={{ stroke: INK, strokeDasharray: "2 4" }} />
          <Line
            type="monotone"
            dataKey="net"
            stroke={color}
            strokeWidth={2.5}
            dot={{ fill: color, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlayerTooltip({
  active,
  payload,
  label,
  name,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  name: string;
}) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value);
  return (
    <div
      className="px-3 py-2 text-sm"
      style={{
        background: PAPER,
        border: `2px solid ${INK}`,
        fontFamily: "'EB Garamond', serif",
        borderRadius: 0,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest opacity-70"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {fmtDate(String(label))}
      </div>
      <div className="font-bold" style={{ color: v < 0 ? LOSS : GAIN }}>
        {name} · {fmtMoney(v)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGHLIGHTS / LOWLIGHTS
function Highlights() {
  return (
    <Section className="py-8 sm:py-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
        <RankedList
          eyebrow="The Highlights"
          eyebrowRed
          title="Biggest Single-Game Wins"
          rows={topSingleGames}
          tone={GAIN}
        />
        <RankedList
          eyebrow="The Lowlights"
          title="Biggest Single-Game Losses"
          rows={bottomSingleGames}
          tone={LOSS}
        />
      </div>
    </Section>
  );
}

function RankedList({
  eyebrow,
  eyebrowRed,
  title,
  rows,
  tone,
}: {
  eyebrow: string;
  eyebrowRed?: boolean;
  title: string;
  rows: typeof topSingleGames;
  tone: string;
}) {
  return (
    <div>
      <Eyebrow red={!!eyebrowRed}>{eyebrow}</Eyebrow>
      <h3
        className="font-black italic mt-2 mb-4"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(26px, 4vw, 40px)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <ol className="space-y-2">
        {rows.map((g, i) => (
          <li
            key={`${g.player}-${g.date}-${g.game_num}`}
            className="flex items-center gap-3 border-b border-dotted py-2"
            style={{ borderColor: INK + "30" }}
          >
            <span
              className="font-black italic w-7 text-right"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(22px, 3.5vw, 30px)",
                opacity: 0.3,
              }}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{g.player}</div>
              <div
                className="text-[10px] uppercase tracking-widest opacity-70"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                {fmtDate(g.date)} · G{g.game_num} · {g.game_type}
              </div>
            </div>
            <div
              className="font-bold text-base sm:text-lg whitespace-nowrap"
              style={{ color: tone }}
            >
              {fmtMoney(g.net)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// METHODOLOGY FOOTER
function Methodology() {
  const sheetIsPlaceholder = SHEET_URL.includes("REPLACE_WITH_YOUR_SHEET_ID");
  return (
    <Section className="pt-8 sm:pt-12 pb-12">
      <div
        className="border-t-8 border-double mb-8 sm:mb-12"
        style={{ borderColor: INK }}
      />
      <Eyebrow red>The Fine Print</Eyebrow>
      <h3
        className="font-black italic mt-2 mb-6"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(32px, 5vw, 56px)",
          lineHeight: 1,
          letterSpacing: "-0.01em",
        }}
      >
        Methodology
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-10">
        <div
          className="md:col-span-7 space-y-5 text-base sm:text-lg leading-[1.55]"
          style={{ fontFamily: "'EB Garamond', serif" }}
        >
          <p>
            Every figure on this page traces back to the league's shared
            ledger. <strong>13 consecutive nights</strong> of play between{" "}
            <strong>April 13 and April 25, 2026</strong>,{" "}
            <strong>36 games</strong> in total — a mix of Pot-Limit Omaha and
            No-Limit Hold'em — across <strong>{players.length} participants</strong>.
            Every dollar shown is net of buy-ins; rake, if any, is absorbed
            within the per-game settlements.
          </p>
          <p>
            “Net” means cash in minus cash out. “Win Rate” means the share of
            games in which a player finished in the black, regardless of margin.
            “PLO” and “NL” segregate the two formats so you can see who
            specializes where.
          </p>
          <p className="italic opacity-80">
            A 13-night window is a small sample. Variance over a stretch this
            short can produce extraordinary results in either direction. The
            ledger is reproduced here in full, without commentary, so readers
            may draw their own conclusions.
          </p>
        </div>

        <aside
          className="md:col-span-5 border-2 p-5 sm:p-6 relative"
          style={{ borderColor: INK, background: PAPER_DK }}
        >
          <div className="absolute -top-4 right-4">
            <Stamp text="OPEN BOOK" rotate={-4} />
          </div>
          <h4
            className="font-black italic mb-3"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "clamp(22px, 3.5vw, 32px)",
              letterSpacing: "-0.01em",
            }}
          >
            Verify the Ledger
          </h4>
          <p
            className="mb-5 leading-[1.5]"
            style={{ fontFamily: "'EB Garamond', serif" }}
          >
            The complete, raw spreadsheet — every game, every settlement,
            every player — is published here for inspection. Don't take our
            word for it; do the math yourself.
          </p>
          <a
            href={SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (sheetIsPlaceholder) {
                e.preventDefault();
                alert(
                  "Set SHEET_URL in src/App.tsx to the Tiny League ledger before deploying.",
                );
              }
            }}
            className="inline-block px-5 py-3 text-sm uppercase tracking-[0.2em] font-bold transition-transform"
            style={{
              fontFamily: "'DM Mono', monospace",
              background: INK,
              color: PAPER,
              boxShadow: `4px 4px 0 ${STAMP_RED}`,
              minHeight: 48,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform =
                "translate(-2px, -2px)";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                `6px 6px 0 ${STAMP_RED}`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                `4px 4px 0 ${STAMP_RED}`;
            }}
          >
            View Source Data ↗
          </a>
          <div
            className="text-[10px] uppercase tracking-widest opacity-70 mt-3"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            Hosted on Google Sheets · Read-only
          </div>
        </aside>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-5 mt-10">
        <StatTile big="13" label="Nights" />
        <StatTile big="36" label="Games" />
        <StatTile big={players.length} label="Players" />
      </div>

      <div
        className="text-center pt-12 pb-2 text-xs uppercase tracking-[0.4em] opacity-60"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        ✦ End of Issue ✦
      </div>
    </Section>
  );
}

function StatTile({ big, label }: { big: string | number; label: string }) {
  return (
    <div
      className="border-2 px-3 py-4 sm:p-5 text-center"
      style={{ borderColor: INK, background: CARD_BG }}
    >
      <div
        className="font-black italic leading-none"
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "clamp(28px, 5vw, 56px)",
        }}
      >
        {big}
      </div>
      <div
        className="text-[10px] uppercase tracking-[0.3em] opacity-70 mt-2"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {label}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [selected, setSelected] = useState<string>(topGain.Player);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const userInteracted = useRef(false);

  useEffect(() => {
    if (!userInteracted.current) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  useEffect(() => {
    let unmounted = false;
    const start = performance.now();
    (async () => {
      const fp = await buildFingerprint();
      if (unmounted) return;
      postLog({ kind: "visit", ...fp });
    })();

    let maxScroll = 0;
    const onScroll = () => {
      const total =
        (document.documentElement.scrollHeight || 1) - window.innerHeight;
      const pct = total > 0 ? Math.round((window.scrollY / total) * 100) : 0;
      if (pct > maxScroll) maxScroll = pct;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    const sendExit = () => {
      const { vid } = getVisitorId();
      postLog({
        kind: "event",
        vid,
        event: "exit",
        payload: {
          dwellMs: Math.round(performance.now() - start),
          maxScrollPct: maxScroll,
          url: window.location.href,
        },
      });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") sendExit();
    };
    window.addEventListener("pagehide", sendExit);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      unmounted = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", sendExit);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const handleSelect = (name: string) => {
    userInteracted.current = true;
    setSelected(name);
    const { vid } = getVisitorId();
    postLog({
      kind: "event",
      vid,
      event: "select_player",
      payload: { player: name },
    });
  };

  return (
    <main>
      <Masthead />
      <LeadStory />
      <Section>
        <ColumnRule />
      </Section>
      <Dossier />
      <Section>
        <ColumnRule />
      </Section>
      <TheField />
      <Section>
        <ColumnRule />
      </Section>
      <Standings selected={selected} onSelect={handleSelect} />
      <Section>
        <ColumnRule />
      </Section>
      <PersonnelFile
        selected={selected}
        onSelect={handleSelect}
        cardRef={cardRef}
      />
      <Section>
        <ColumnRule />
      </Section>
      <Highlights />
      <Methodology />
      <Analytics />
    </main>
  );
}
