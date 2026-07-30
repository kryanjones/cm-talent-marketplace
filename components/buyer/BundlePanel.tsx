"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BuyerCreator, OverlapAssumption } from "@/lib/types";
import {
  calculateBundleReach,
  coefficientsFromAssumptions,
  type ResolvedComponent,
} from "@/lib/reach";
import { recommend, type OptimizationGoal } from "@/lib/recommend";
import { compactNumber, fullNumber, percent } from "@/lib/format";
import { AnimatedNumber, Bar, Eyebrow } from "@/components/ui";
import { useBundle } from "./bundle-context";
import { RecommendationList } from "./RecommendationList";

// Where "talk to us" goes. Both are public by nature (they appear in a mailto
// link and an anchor), so NEXT_PUBLIC_ is correct here — no secret involved.
const SALES_EMAIL =
  process.env.NEXT_PUBLIC_SALES_EMAIL || "partnerships@collective.media";
const MEETING_URL = process.env.NEXT_PUBLIC_MEETING_URL || "";

export function BundlePanel({
  creators,
  overlap,
  activeCategory,
}: {
  creators: BuyerCreator[];
  overlap: OverlapAssumption[];
  activeCategory: string | null;
}) {
  const bundle = useBundle();
  const [goal, setGoal] = useState<OptimizationGoal>("Maximize Reach");
  const [pricingRequested, setPricingRequested] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  /**
   * Hand the bundle to a human. Saves it server-side so sales can see what was
   * assembled, then offers email and (if configured) a meeting booker. It does
   * not claim anything was "sent" until the buyer actually sends it.
   */
  async function requestPricing() {
    setPricingRequested(true);
    if (saveState !== "saved") await saveBundle();
  }

  async function copyShareLink() {
    // The URL always mirrors the bundle (bundle-context syncs it), so the
    // address bar IS the share link.
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the user can still copy the address bar.
    }
  }

  // A changed bundle is a new bundle: stale "Saved ✓" / "Pricing sent ✓"
  // states would misrepresent what sales actually received.
  useEffect(() => {
    setSaveState("idle");
    setPricingRequested(false);
  }, [bundle.components]);

  const creatorsById = useMemo(
    () => new Map(creators.map((c) => [c.id, c])),
    [creators]
  );
  const coef = useMemo(() => coefficientsFromAssumptions(overlap), [overlap]);

  // Resolve bundle components into reach inputs.
  const resolved = useMemo<ResolvedComponent[]>(() => {
    const out: ResolvedComponent[] = [];
    for (const comp of bundle.components) {
      const creator = creatorsById.get(comp.creatorId);
      const channel = creator?.channels.find((ch) => ch.id === comp.channelId);
      if (creator && channel) {
        out.push({
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
    return out;
  }, [bundle.components, creatorsById]);

  const reach = useMemo(() => calculateBundleReach(resolved, coef), [resolved, coef]);

  const recommendations = useMemo(
    () =>
      resolved.length === 0
        ? []
        : recommend({
            candidates: creators,
            bundleComponents: resolved,
            goal,
            overlap,
            activeCategories: activeCategory ? [activeCategory] : [],
          }),
    [resolved, creators, goal, overlap, activeCategory]
  );

  // Group resolved components by creator for display.
  const grouped = useMemo(() => {
    const map = new Map<string, ResolvedComponent[]>();
    for (const r of resolved) {
      const list = map.get(r.creator.id) ?? [];
      list.push(r);
      map.set(r.creator.id, list);
    }
    return Array.from(map.entries());
  }, [resolved]);

  /**
   * A prefilled handoff email. Carries what the bundle is and what it reaches —
   * never a rate, since the buyer has not been shown one.
   */
  const mailtoHref = useMemo(() => {
    const lines = grouped.map(
      ([, comps]) =>
        `- ${comps[0].creator.name}: ${comps
          .map((c) => c.channel.platform)
          .join(", ")}`
    );
    const link =
      typeof window !== "undefined" ? `\n\nBundle link: ${window.location.href}` : "";
    const body =
      `Hello,\n\nI've put together a bundle on the Talent Marketplace and would like ` +
      `rates and availability.\n\n` +
      `${grouped.length} creator${grouped.length === 1 ? "" : "s"}, ` +
      `${resolved.length} channel${resolved.length === 1 ? "" : "s"}\n` +
      `${lines.join("\n")}\n\n` +
      `Estimated net reach: ${compactNumber(reach.netReach)} ` +
      `(${compactNumber(reach.grossReach)} gross)${link}\n\nThank you.`;
    return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(
      "Pricing request — Talent Marketplace bundle"
    )}&body=${encodeURIComponent(body)}`;
  }, [grouped, resolved.length, reach.netReach, reach.grossReach]);

  async function saveBundle() {
    setSaveState("saving");
    try {
      const res = await fetch("/api/bundles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleName: `Bundle · ${new Date().toLocaleDateString()}`,
          components: bundle.components,
        }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  const empty = resolved.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div>
          <Eyebrow>Your bundle</Eyebrow>
          <p className="cm-h3 font-bold">
            {bundle.count} component{bundle.count === 1 ? "" : "s"}
          </p>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={bundle.clear}
            className="cm-fine text-ink/45 hover:text-accent"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="cm-scroll flex-1 overflow-y-auto py-4">
        {empty ? (
          <div className="flex flex-col items-start gap-2 py-8">
            <span className="cm-rule-red" />
            <p className="cm-body-lg cm-serif text-ink/70">
              Start assembling.
            </p>
            <p className="cm-fine text-ink/45">
              Select creators or individual channels and watch the reach math build
              in real time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Aggregate reach */}
            <div className="flex flex-col gap-3 bg-bg-alt p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="cm-fine text-ink/45">Gross reach</span>
                  <p className="cm-sans text-2xl font-bold leading-none">
                    <AnimatedNumber value={reach.grossReach} format={compactNumber} />
                  </p>
                </div>
                <div className="text-right">
                  <span className="cm-fine text-ink/45">Est. net reach</span>
                  <p className="cm-sans text-2xl font-bold leading-none text-accent">
                    <AnimatedNumber value={reach.netReach} format={compactNumber} />
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-hairline pt-2">
                <span className="cm-fine text-ink/55">
                  {fullNumber(reach.grossReach)} gross · {fullNumber(reach.netReach)} net
                </span>
                <span className="cm-fine text-ink/55">
                  ~{percent(reach.impliedOverlapPct)} overlap
                </span>
              </div>
              <p className="cm-fine text-ink/40">
                Net is a deduplicated estimate from tunable overlap assumptions —
                not measured cross-audience data.
              </p>
            </div>

            {/*
              Deliberately not a single "blended engagement" figure. Averaging a
              newsletter open rate with a social engagement rate produces a
              number that flatters the bundle and measures nothing — the schema
              keeps these metrics apart for that reason. Platform count and
              format count describe the shape of the buy instead; per-channel
              rates stay on each channel.
            */}
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Platforms" value={String(reach.platformCount)} />
              <MiniStat label="Formats" value={String(reach.combinedFormats.length)} />
            </div>

            {/* Demographic composite */}
            {reach.demographicComposite.ageBands && (
              <div className="flex flex-col gap-2">
                <Eyebrow>Audience age composite</Eyebrow>
                <div className="flex flex-col gap-1.5">
                  {Object.entries(reach.demographicComposite.ageBands).map(
                    ([band, pct]) => (
                      <Bar key={band} label={band} pct={pct} />
                    )
                  )}
                </div>
              </div>
            )}

            {/* Geo footprint */}
            {reach.geoFootprint.length > 0 && (
              <div className="flex flex-col gap-2">
                <Eyebrow>Geographic footprint</Eyebrow>
                <div className="flex flex-wrap gap-1">
                  {reach.geoFootprint.slice(0, 12).map((g) => (
                    <span
                      key={g}
                      className="cm-fine border border-hairline px-2 py-1 text-ink/60"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Components grouped by creator */}
            <div className="flex flex-col gap-3">
              <Eyebrow>Components</Eyebrow>
              <AnimatePresence initial={false} mode="popLayout">
                {grouped.map(([creatorId, comps]) => (
                  <motion.div
                    key={creatorId}
                    layout
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    className="border border-hairline"
                  >
                    <div className="border-b border-hairline px-3 py-2">
                      <p className="cm-sans text-sm font-semibold">
                        {comps[0].creator.name}
                      </p>
                    </div>
                    <div className="flex flex-col divide-y divide-hairline">
                      {comps.map((c) => (
                        <div
                          key={c.channel.id}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="cm-fine text-ink/80">{c.channel.platform}</p>
                            <p className="cm-fine text-ink/45">
                              +{compactNumber(reach.incrementalByChannel[c.channel.id])}{" "}
                              net · {compactNumber(c.channel.avgReachPerUnit)} gross
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => bundle.remove(c.channel.id)}
                            className="cm-fine text-ink/40 transition-colors hover:text-accent"
                            aria-label="Remove channel"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Recommendations */}
            <RecommendationList
              goal={goal}
              setGoal={setGoal}
              recommendations={recommendations}
              creatorsById={creatorsById}
              onAdd={(c) => bundle.toggleCreator(c)}
            />
          </div>
        )}
      </div>

      {/* Sticky actions */}
      {!empty && (
        <div className="flex flex-col gap-2 border-t border-hairline pt-3">
          {pricingRequested ? (
            <div className="flex flex-col gap-2 border border-hairline bg-bg-alt p-3">
              <p className="cm-fine text-ink/60">
                Your bundle is saved for our team. Send it over and we will come
                back with rates and availability.
              </p>
              <a
                href={mailtoHref}
                className="cm-label w-full bg-accent px-4 py-3 text-center text-ink-inverse transition-opacity duration-micro hover:opacity-90"
              >
                Email the team
              </a>
              {MEETING_URL && (
                <a
                  href={MEETING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cm-label w-full border border-ink px-4 py-2.5 text-center text-ink transition-colors duration-micro hover:bg-ink hover:text-ink-inverse"
                >
                  Book a call
                </a>
              )}
              <button
                type="button"
                onClick={() => setPricingRequested(false)}
                className="cm-fine text-ink/45 hover:text-accent"
              >
                Back
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={requestPricing}
              className="cm-label w-full bg-accent px-4 py-3 text-ink-inverse transition-opacity duration-micro hover:opacity-90"
            >
              Request pricing
            </button>
          )}
          <button
            type="button"
            onClick={saveBundle}
            disabled={saveState === "saving"}
            className="cm-label w-full border border-ink px-4 py-2.5 text-ink transition-colors duration-micro hover:bg-ink hover:text-ink-inverse disabled:opacity-50"
          >
            {saveState === "saved"
              ? "Saved for sales ✓"
              : saveState === "saving"
              ? "Saving…"
              : saveState === "error"
              ? "Save failed — retry"
              : "Save bundle"}
          </button>
          <button
            type="button"
            onClick={copyShareLink}
            className="cm-fine text-center text-ink/50 transition-colors duration-micro hover:text-accent"
          >
            {copied ? "Link copied ✓" : "Copy share link"}
          </button>
          <p className="cm-fine text-center text-ink/40">
            Rate cards are shared on request, not displayed here.
          </p>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline p-3">
      <span className="cm-fine text-ink/45">{label}</span>
      <p className="cm-sans text-lg font-bold leading-tight">{value}</p>
    </div>
  );
}
