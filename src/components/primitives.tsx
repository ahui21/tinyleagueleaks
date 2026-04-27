import type { ReactNode } from "react";
import { INK, STAMP_RED, GAIN, LOSS } from "../lib/colors";

export function Stamp({
  text,
  rotate = -8,
  color = STAMP_RED,
  className = "",
}: {
  text: string;
  rotate?: number;
  color?: string;
  className?: string;
}) {
  return (
    <div
      className={
        "inline-block border-4 px-3 py-1 font-black tracking-widest text-center select-none " +
        className
      }
      style={{
        borderColor: color,
        color,
        transform: `rotate(${rotate}deg)`,
        fontFamily: "'Special Elite', 'Courier New', monospace",
        textShadow: "1px 1px 0 rgba(0,0,0,0.05)",
        boxShadow: `inset 0 0 0 2px ${color}20`,
      }}
    >
      {text}
    </div>
  );
}

export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={"max-w-6xl mx-auto px-4 sm:px-6 md:px-10 " + className}
    >
      {children}
    </section>
  );
}

export function ColumnRule() {
  return (
    <div
      className="border-t-4 border-double my-6"
      style={{ borderColor: INK }}
    />
  );
}

export function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean | "neutral";
}) {
  const color =
    highlight === false ? LOSS : highlight === true ? GAIN : INK;
  return (
    <div
      className="border-b border-dotted pb-2"
      style={{ borderColor: INK + "40" }}
    >
      <div
        className="text-[10px] uppercase tracking-widest opacity-60"
        style={{ fontFamily: "'DM Mono', monospace" }}
      >
        {label}
      </div>
      <div className="text-base font-bold break-words" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

export function Eyebrow({
  children,
  red = false,
  className = "",
}: {
  children: ReactNode;
  red?: boolean;
  className?: string;
}) {
  return (
    <div
      className={
        "text-[11px] uppercase tracking-[0.3em] " + className
      }
      style={{
        fontFamily: "'DM Mono', monospace",
        color: red ? STAMP_RED : INK,
      }}
    >
      {children}
    </div>
  );
}
