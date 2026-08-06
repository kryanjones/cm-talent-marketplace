"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BUDGET_BANDS } from "@/lib/plan";
import { Eyebrow } from "@/components/ui";
import type { BundleComponent } from "@/lib/types";
import { BriefQuestions } from "./BriefQuestions";
import {
  BRIEF_GOALS,
  EMPTY_ANSWERS,
  platformLabelsToChannels,
  type BriefAnswers,
} from "./brief-options";

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

export function BriefPanel({
  onPlan,
  topics,
  initialBrief,
}: {
  onPlan: (components: BundleComponent[]) => void;
  /** Live topic vocabulary for the editorial-alignment question. */
  topics: string[];
  /** A brief carried over from the landing page — auto-runs on mount. */
  initialBrief?: BriefAnswers | null;
}) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<BriefAnswers>(initialBrief ?? EMPTY_ANSWERS);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [plan, setPlan] = useState<PlanResponse | null>(null);

  const run = useCallback(
    async (a: BriefAnswers) => {
      setStatus("working");
      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            industry: a.industry || null,
            affinity: null,
            topics: a.topics,
            audience: a.audience,
            goal: a.goal,
            budget: a.budget,
            platforms: platformLabelsToChannels(a.platforms),
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
    },
    [onPlan]
  );

  // A landing-page brief arrives via URL params and runs itself: the buyer
  // already pressed "Show me a bundle" — asking again would be a second door.
  const autoRan = useRef(false);
  useEffect(() => {
    if (initialBrief && !autoRan.current) {
      autoRan.current = true;
      run(initialBrief);
    }
  }, [initialBrief, run]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(answers);
  }

  const budgetLabel =
    BUDGET_BANDS.find((b) => b.value === answers.budget)?.label ?? "";
  const goalLabel =
    BRIEF_GOALS.find((g) => g.value === answers.goal)?.label ?? answers.goal;
  const briefSummary = [
    answers.industry || "Any industry",
    answers.topics.length ? answers.topics.slice(0, 2).join(", ") : null,
    goalLabel,
    budgetLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  // ---------- working state (visible when a landing brief is assembling)
  if (status === "working") {
    return (
      <div className="border border-hairline bg-bg-alt px-5 py-5">
        <Eyebrow>Your brief</Eyebrow>
        <p className="cm-h3 mt-2 font-bold">Assembling your bundle…</p>
        <p className="cm-fine mt-1 text-ink/50">{briefSummary}</p>
      </div>
    );
  }

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
            <span className="cm-fine text-ink/70">{briefSummary}</span>
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

  // ---------- the form (all six questions, single screen)
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
                Six questions. Nothing is binding, and no rates are shown.
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

          <BriefQuestions answers={answers} onChange={setAnswers} topics={topics} />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="cm-label bg-accent px-6 py-3 text-ink-inverse transition-opacity hover:opacity-90"
            >
              Show me a bundle
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
