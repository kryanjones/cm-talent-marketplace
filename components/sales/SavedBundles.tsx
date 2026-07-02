"use client";

import { useMemo } from "react";
import type { Creator, OverlapAssumption, SavedBundle } from "@/lib/types";
import {
  calculateBundleReach,
  coefficientsFromAssumptions,
  type ResolvedComponent,
} from "@/lib/reach";
import { compactNumber } from "@/lib/format";
import { bundleSharePath } from "@/lib/share";
import { Chip, Eyebrow } from "@/components/ui";

export function SavedBundles({
  bundles,
  creators,
  overlap,
}: {
  bundles: SavedBundle[];
  creators: Creator[];
  overlap: OverlapAssumption[];
}) {
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const coef = useMemo(() => coefficientsFromAssumptions(overlap), [overlap]);

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
