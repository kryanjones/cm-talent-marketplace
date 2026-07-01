"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Mono uppercase eyebrow/section label. */
export function Eyebrow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`cm-label text-ink/50 ${className}`}>{children}</p>;
}

/** Required fictional-persona indicator for every creator surface. */
export function FictionalBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`cm-fine inline-flex items-center gap-1 border border-hairline bg-bg/85 px-2 py-1 text-ink/70 backdrop-blur-sm ${className}`}
    >
      <span className="h-1.5 w-1.5 bg-accent" aria-hidden />
      Fictional persona
    </span>
  );
}

/** A small selectable pill used across filters and chips. */
export function Pill({
  active = false,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
}) {
  const interactive = !!onClick;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={!interactive}
      className={[
        "cm-label whitespace-nowrap border px-3 py-1.5 transition-all duration-micro ease-brand",
        interactive ? "cursor-pointer" : "cursor-default",
        active
          ? "border-ink bg-ink text-ink-inverse"
          : "border-hairline bg-bg text-ink/70 hover:border-ink/40 hover:text-ink",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Static chip (non-interactive tag). */
export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "muted";
}) {
  const tones = {
    neutral: "border-hairline text-ink/70",
    accent: "border-accent/30 text-accent",
    muted: "border-hairline text-ink/45",
  };
  return (
    <span className={`cm-fine inline-block border px-2 py-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** A labeled metric block. */
export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="cm-fine text-ink/45">{label}</span>
      <span
        className={`cm-sans font-bold leading-none ${
          accent ? "text-accent" : "text-ink"
        } text-xl`}
      >
        {value}
      </span>
      {sub && <span className="cm-fine text-ink/40">{sub}</span>}
    </div>
  );
}

/** Animated count-up number (count-up on mount / value change). */
export function AnimatedNumber({
  value,
  format,
}: {
  value: number;
  format: (n: number) => string;
}) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.4, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
    >
      {format(value)}
    </motion.span>
  );
}

/** A simple horizontal bar (for demographic composites). */
export function Bar({
  label,
  pct,
  max = 100,
}: {
  label: string;
  pct: number;
  max?: number;
}) {
  const w = Math.max(0, Math.min(100, (pct / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <span className="cm-fine w-14 shrink-0 text-ink/50">{label}</span>
      <div className="h-2 flex-1 bg-bg-alt">
        <motion.div
          className="h-full bg-ink"
          initial={{ width: 0 }}
          animate={{ width: `${w}%` }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
      <span className="cm-fine w-10 shrink-0 text-right text-ink/60">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}
