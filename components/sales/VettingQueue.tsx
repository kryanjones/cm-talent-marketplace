"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Creator } from "@/lib/types";
import { compactNumber } from "@/lib/format";
import { Chip, Eyebrow } from "@/components/ui";

export function VettingQueue({ pending }: { pending: Creator[] }) {
  const [queue, setQueue] = useState(pending);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch("/api/creators/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        setQueue((q) => q.filter((c) => c.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (queue.length === 0) {
    return (
      <div className="py-10">
        <Eyebrow>Applications</Eyebrow>
        <p className="cm-body mt-3 text-ink/55">No pending applicants right now.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <Eyebrow>{queue.length} pending applicant{queue.length > 1 ? "s" : ""}</Eyebrow>
      <AnimatePresence initial={false}>
        {queue.map((c) => (
          <motion.div
            key={c.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="border border-hairline p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="cm-h3 font-bold">{c.name}</h3>
                  <Chip tone="muted">{c.primaryBeat}</Chip>
                  {c.applicationFeePaid && <Chip tone="accent">Fee paid</Chip>}
                </div>
                {c.bio && <p className="cm-body mt-2 text-sm text-ink/60">{c.bio}</p>}

                <div className="mt-3 flex flex-col gap-1">
                  {c.channels.map((ch) => (
                    <p key={ch.id} className="cm-fine text-ink/60">
                      {ch.platform} · {ch.handleUrl || "—"} ·{" "}
                      {compactNumber(ch.audienceSize)} audience ·{" "}
                      {compactNumber(ch.avgReachPerUnit)} reach/unit
                    </p>
                  ))}
                </div>

                {c.brandBoundary && c.brandBoundary.noGoCategories.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <span className="cm-fine text-ink/45">No-go:</span>
                    {c.brandBoundary.noGoCategories.map((n) => (
                      <Chip key={n}>{n}</Chip>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => act(c.id, "approve")}
                  className="cm-label border border-success px-4 py-2 text-success transition-colors hover:bg-success hover:text-ink-inverse disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === c.id}
                  onClick={() => act(c.id, "reject")}
                  className="cm-label border border-hairline px-4 py-2 text-ink/60 transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
