"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  AdvertiserRelationship,
  Creator,
  OverlapAssumption,
  SavedBundle,
} from "@/lib/types";
import {
  calculateBundleReach,
  coefficientsFromAssumptions,
  type ResolvedComponent,
} from "@/lib/reach";
import { compactNumber } from "@/lib/format";
import { bundleSharePath } from "@/lib/share";
import { Chip, Eyebrow } from "@/components/ui";
import { DealCalculator } from "./DealCalculator";
import { PitchApproval } from "./PitchApproval";
import { ClearanceWarning } from "./ClearanceWarning";

export function SavedBundles({
  bundles,
  creators,
  overlap,
  relationships,
}: {
  bundles: SavedBundle[];
  creators: Creator[];
  overlap: OverlapAssumption[];
  relationships: AdvertiserRelationship[];
}) {
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const coef = useMemo(() => coefficientsFromAssumptions(overlap), [overlap]);
  const [panel, setPanel] = useState<
    { key: string; which: "pricing" | "approvals" } | null
  >(null);

  if (bundles.length === 0) {
    return (
      <div className="py-10">
        <Eyebrow>Saved bundles</Eyebrow>
        <p className="cm-body mt-3 text-ink/55">
          No buyer bundles saved yet. When a buyer saves a bundle on Discover, it
          shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-6">
      <Eyebrow>{bundles.length} saved bundle{bundles.length > 1 ? "s" : ""}</Eyebrow>
      {bundles.map((b) => {
        const resolved: ResolvedComponent[] = [];
        const creatorNames = new Set<string>();
        for (const comp of b.components) {
          const creator = byId.get(comp.creatorId);
          const channel = creator?.channels.find((ch) => ch.id === comp.channelId);
          if (creator && channel) {
            creatorNames.add(creator.name);
            resolved.push({
              creator: {
                id: creator.id,
                name: creator.name,
                primaryBeat: creator.primaryBeat,
                categoryAffinities: creator.categoryAffinities,
                homeMarketDMA: creator.homeMarketDMA,
              },
              channel,
            });
          }
        }
        const reach = calculateBundleReach(resolved, coef);
        return (
          <div key={b.id ?? b.bundleName} className="border border-hairline p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="cm-h3 font-bold">{b.bundleName}</h3>
              <div className="flex items-center gap-4">
                <span className="cm-fine text-ink/45">
                  {b.createdBy} · {b.createdAt ? new Date(b.createdAt).toLocaleString() : "—"}
                </span>
                <a
                  href={bundleSharePath(b.components)}
                  className="cm-fine text-accent underline-offset-4 hover:underline"
                >
                  Open in Discover →
                </a>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <Stat label="Components" v={String(b.components.length)} />
              <Stat label="Gross reach" v={compactNumber(reach.grossReach)} />
              <Stat label="Est. net reach" v={compactNumber(reach.netReach)} accent />
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {Array.from(creatorNames).map((n) => (
                <Chip key={n}>{n}</Chip>
              ))}
            </div>

            {/* The two sales-side halves of the handoff: price it, and get the
                creators' teams to approve it before it reaches the brand. */}
            {(() => {
              const key = b.id ?? b.bundleName;
              const open = panel?.key === key ? panel.which : null;
              const toggle = (which: "pricing" | "approvals") =>
                setPanel(open === which ? null : { key, which });
              return (
                <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggle("pricing")}
                      className={`cm-label border px-4 py-2 transition-colors ${
                        open === "pricing"
                          ? "border-ink bg-ink text-ink-inverse"
                          : "border-ink hover:bg-ink hover:text-ink-inverse"
                      }`}
                    >
                      Pricing
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle("approvals")}
                      className={`cm-label border px-4 py-2 transition-colors ${
                        open === "approvals"
                          ? "border-ink bg-ink text-ink-inverse"
                          : "border-ink hover:bg-ink hover:text-ink-inverse"
                      }`}
                    >
                      Creator approvals
                    </button>
                  </div>
                  {/*
                    Fades in without animating height. The calculator's own
                    controls change its height (the premium row appears and
                    disappears), and animating `height: auto` around content
                    that resizes mid-flight strands framer-motion with a stale
                    inline height — the panel gets stuck part-open.
                  */}
                  <AnimatePresence initial={false} mode="wait">
                    {open && (
                      <motion.div
                        key={open}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      >
                        <div className="mt-4 border-t border-hairline pt-5">
                          <ClearanceWarning
                            components={b.components}
                            creators={creators}
                          />
                          {open === "pricing" ? (
                            <DealCalculator
                              components={b.components}
                              creators={creators}
                              relationships={relationships}
                            />
                          ) : (
                            <PitchApproval
                              components={b.components}
                              creators={creators}
                              relationships={relationships}
                            />
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, v, accent }: { label: string; v: string; accent?: boolean }) {
  return (
    <div>
      <span className="cm-fine text-ink/45">{label}</span>
      <p className={`cm-sans text-lg font-bold ${accent ? "text-accent" : ""}`}>{v}</p>
    </div>
  );
}
