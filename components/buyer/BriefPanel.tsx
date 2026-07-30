"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CATEGORY_AFFINITIES, NOGO_CATEGORIES } from "@/lib/constants";
import { GOALS, type OptimizationGoal } from "@/lib/recommend";
import { BUDGET_BANDS } from "@/lib/plan";
import { Eyebrow, Pill } from "@/components/ui";
import type { BundleComponent } from "@/lib/types";

interface PlanResponse {
  components: BundleComponent[];
  summary: {
    creatorCount: number;
    channelCount: number;
    grossReach: number;
    netReach: number;
    overlapPct: number;
    platforms: string[];
  };
  narrative: { headline: string; points: string[] };
  excludedForBoundaries: number;
  conditional: { name: string; note: string | null }[];
  empty: boolean;
}

const GOAL_HELP: Record<OptimizationGoal, string> = {
  "Maximize Reach": "The largest deduplicated audience the budget allows.",
  "Fit Budget": "Efficient coverage that leaves room in the number.",
  "Tighten Category": "Stay inside one audience interest for a coherent buy.",
  "Expand Audience": "Spread across markets you are not already reaching.",
};

export function BriefPanel({
  onPlan,
}: {
  onPlan: (components: BundleComponent[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [industry, setIndustry] = useState<string>("");
  const [affinity, setAffinity] = useState<string>("");
  const [goal, setGoal] = useState<OptimizationGoal>("Maximize Reach");
  const [budget, setBudget] = useState<number>(BUDGET_BANDS[2].value);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [plan, setPlan] = useState<PlanResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("working");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: industry || null,
          affinity: affinity || null,
          goal,
          budget,
        }),
      });
      if (!res.ok) throw new Error("plan failed");
      const data = (await res.json()) as PlanResponse;
      setPlan(data);
      setStatus("done");
      if (!data.empty) onPlan(data.components);
    } catch {
      setStatus("error");
    }
  }

  const budgetLabel =
    BUDGET_BANDS.find((b) => b.value === budget)?.label ?? "";

  // ---------- resolved state: a compact summary of the brief + the rationale
  if (status === "done" && plan && !plan.empty) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="border border-hairline bg-bg-alt"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Eyebrow>Your brief</Eyebrow>
            <span className="cm-fine text-ink/70">
              {[industry || "Any category", affinity, goal, budgetLabel]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setPlan(null);
              setOpen(true);
            }}
            className="cm-label text-accent underline-offset-4 hover:underline"
          >
            Edit brief
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div>
            <Eyebrow>Why this bundle works</Eyebrow>
            <p className="cm-h3 mt-2 max-w-3xl font-bold">
              {plan.narrative.headline}
            </p>
          </div>
          <ul className="flex max-w-3xl flex-col gap-2">
            {plan.narrative.points.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 bg-accent" aria-hidden />
                <span className="cm-body text-sm text-ink/70">{p}</span>
              </li>
            ))}
          </ul>
          <p className="cm-fine text-ink/45">
            Added to your bundle on the right. Adjust it freely — nothing here is locked.
          </p>
        </div>
      </motion.div>
    );
  }

  // ---------- empty result
  if (status === "done" && plan?.empty) {
    return (
      <div className="border border-hairline bg-bg-alt px-5 py-5">
        <Eyebrow>Your brief</Eyebrow>
        <p className="cm-h3 mt-2 font-bold">{plan.narrative.headline}</p>
        <p className="cm-body mt-2 max-w-2xl text-sm text-ink/65">
          {plan.narrative.points[0]}
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setPlan(null);
            setOpen(true);
          }}
          className="cm-label mt-4 border border-ink px-4 py-2 transition-colors hover:bg-ink hover:text-ink-inverse"
        >
          Change the brief
        </button>
      </div>
    );
  }

  // ---------- collapsed prompt
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4 border border-hairline bg-bg-alt px-5 py-4">
        <div>
          <Eyebrow>Start here</Eyebrow>
          <p className="cm-body mt-1 text-sm text-ink/70">
            Tell us the campaign and the budget, and we will assemble a starting bundle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cm-label bg-accent px-5 py-3 text-ink-inverse transition-opacity hover:opacity-90"
        >
          Build my bundle
        </button>
      </div>
    );
  }

  // ---------- the form
  return (
    <AnimatePresence initial={false}>
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="overflow-hidden border border-hairline bg-bg-alt"
      >
        <div className="flex flex-col gap-6 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow>Your brief</Eyebrow>
              <p className="cm-body mt-1 text-sm text-ink/60">
                Four questions. Nothing is binding, and no rates are shown.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="cm-fine text-ink/45 hover:text-accent"
            >
              Close
            </button>
          </div>

          <Field
            label="What are you advertising?"
            hint="Used to withhold creators who decline that category. Nothing is pitched to them."
          >
            <div className="flex flex-wrap gap-1.5">
              <Pill active={industry === ""} onClick={() => setIndustry("")}>
                General
              </Pill>
              {NOGO_CATEGORIES.map((c) => (
                <Pill
                  key={c}
                  active={industry === c}
                  onClick={() => setIndustry(industry === c ? "" : c)}
                >
                  {c}
                </Pill>
              ))}
            </div>
          </Field>

          <Field
            label="Which audience are you after?"
            hint="Optional. Shapes which creators are prioritised."
          >
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_AFFINITIES.map((a) => (
                <Pill
                  key={a}
                  active={affinity === a}
                  onClick={() => setAffinity(affinity === a ? "" : a)}
                >
                  {a}
                </Pill>
              ))}
            </div>
          </Field>

          <Field label="What matters most?" hint={GOAL_HELP[goal]}>
            <div className="flex flex-wrap gap-1.5">
              {GOALS.map((g) => (
                <Pill key={g} active={goal === g} onClick={() => setGoal(g)}>
                  {g}
                </Pill>
              ))}
            </div>
          </Field>

          <Field label="Working budget" hint="Shapes the plan. Never shown as a rate.">
            <div className="flex flex-wrap gap-1.5">
              {BUDGET_BANDS.map((b) => (
                <Pill key={b.label} active={budget === b.value} onClick={() => setBudget(b.value)}>
                  {b.label}
                </Pill>
              ))}
            </div>
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={status === "working"}
              className="cm-label bg-accent px-6 py-3 text-ink-inverse transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "working" ? "Assembling…" : "Show me a bundle"}
            </button>
            {status === "error" && (
              <span className="cm-fine text-error">
                Could not build a plan. Try again.
              </span>
            )}
          </div>
        </div>
      </motion.form>
    </AnimatePresence>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="cm-sans text-sm font-semibold">{label}</span>
      {hint && <span className="cm-fine text-ink/45">{hint}</span>}
      {children}
    </div>
  );
}
