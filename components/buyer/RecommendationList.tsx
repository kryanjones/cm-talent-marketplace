"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GOALS, type OptimizationGoal, type Recommendation } from "@/lib/recommend";
import { Eyebrow, Pill } from "@/components/ui";
import type { BuyerCreator } from "@/lib/types";

export function RecommendationList({
  goal,
  setGoal,
  recommendations,
  creatorsById,
  onAdd,
}: {
  goal: OptimizationGoal;
  setGoal: (g: OptimizationGoal) => void;
  recommendations: Recommendation[];
  creatorsById: Map<string, BuyerCreator>;
  onAdd: (creator: BuyerCreator) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>Recommended additions</Eyebrow>
      <div className="flex flex-wrap gap-1.5">
        {GOALS.map((g) => (
          <Pill key={g} active={goal === g} onClick={() => setGoal(g)}>
            {g}
          </Pill>
        ))}
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {recommendations.length === 0 ? (
          <motion.p
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="cm-fine text-ink/45"
          >
            Add a creator to get recommendations.
          </motion.p>
        ) : (
          recommendations.map((rec) => {
            const creator = creatorsById.get(rec.creatorId);
            if (!creator) return null;
            return (
              <motion.button
                key={rec.creatorId}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                onClick={() => onAdd(creator)}
                className="group flex flex-col gap-1 border border-hairline bg-bg p-3 text-left transition-colors duration-micro hover:border-ink"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="cm-sans text-sm font-semibold">
                    {creator.name}
                  </span>
                  <span className="cm-label text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    + Add
                  </span>
                </div>
                <span className="cm-fine text-ink/55">{rec.reason}</span>
                {rec.flags.length > 0 && (
                  <span className="cm-fine text-warning">{rec.flags.join(" · ")}</span>
                )}
              </motion.button>
            );
          })
        )}
      </AnimatePresence>
    </div>
  );
}
