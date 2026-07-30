"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BuyerCreator, OverlapAssumption } from "@/lib/types";
import { CreatorCard } from "./CreatorCard";
import { FilterPanel } from "./FilterPanel";
import { BundlePanel } from "./BundlePanel";
import { BriefPanel } from "./BriefPanel";
import { BundleProvider, useBundle } from "./bundle-context";
import { arrangeForDisplay } from "@/lib/arrange";
import type { Availability } from "@/lib/inventory";
import {
  buildOptions,
  creatorMatches,
  defaultFilters,
  activeFilterCount,
  type FilterState,
} from "./filters";

export function BuyerExperience({
  creators,
  overlap,
  availability,
}: {
  creators: BuyerCreator[];
  overlap: OverlapAssumption[];
  /** channelId → qualitative state. Slot counts stay on the server. */
  availability: Record<string, Availability>;
}) {
  return (
    <BundleProvider creators={creators}>
      <BuyerInner
        creators={creators}
        overlap={overlap}
        availability={availability}
      />
    </BundleProvider>
  );
}

function BuyerInner({
  creators,
  overlap,
  availability,
}: {
  creators: BuyerCreator[];
  overlap: OverlapAssumption[];
  /** channelId → qualitative state. Slot counts stay on the server. */
  availability: Record<string, Availability>;
}) {
  const options = useMemo(() => buildOptions(creators), [creators]);
  const [filters, setFilters] = useState<FilterState>(() =>
    defaultFilters(options.audienceBounds)
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const bundle = useBundle();

  // Filter, then arrange so similar-looking headshots (same gender/ethnicity
  // recipe) never cluster — recomputed per filter change so the alternation
  // holds for whatever subset is on screen.
  const filtered = useMemo(
    () => arrangeForDisplay(creators.filter((c) => creatorMatches(c, filters))),
    [creators, filters]
  );

  const activeCount = activeFilterCount(filters, options.audienceBounds);

  return (
    <div className="mx-auto max-w-content px-6">
      {/* Hero */}
      <section className="border-b border-hairline py-10">
        <span className="cm-rule-red mb-4" />
        <h1 className="cm-title max-w-3xl">
          Design a sponsorship around the journalists your audience already trusts.
        </h1>
        <p className="cm-body mt-4 max-w-2xl text-ink/60">
          Filter the creators Collective Media represents, build a custom bundle of
          creators and channels, and see real reach and engagement math — including a
          deduplicated estimate — as you go.
        </p>

        {/* Guided entry point. Browsing stays available underneath — this
            never blocks the array. */}
        <div className="mt-7">
          <BriefPanel onPlan={bundle.setBundle} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 py-8 lg:grid-cols-[240px_minmax(0,1fr)_360px]">
        {/* Filters — desktop rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 cm-scroll">
            <FilterPanel
              options={options}
              filters={filters}
              setFilters={setFilters}
              resultCount={filtered.length}
              onReset={() => setFilters(defaultFilters(options.audienceBounds))}
            />
          </div>
        </aside>

        {/* Creator array */}
        <section>
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="cm-label border border-ink px-3 py-2"
            >
              Filters{activeCount > 0 ? ` · ${activeCount}` : ""}
            </button>
            <span className="cm-fine text-ink/50">{filtered.length} creators</span>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <motion.div
                key={c.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              >
                <CreatorCard creator={c} availability={availability} />
              </motion.div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-start gap-2 py-16">
              <span className="cm-rule-red" />
              <p className="cm-title text-ink/70">No creators match.</p>
              <button
                type="button"
                onClick={() => setFilters(defaultFilters(options.audienceBounds))}
                className="cm-label text-accent underline-offset-4 hover:underline"
              >
                Reset filters
              </button>
            </div>
          )}
        </section>

        {/* Bundle — desktop rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)]">
            <div className="h-[calc(100vh-7rem)] border border-hairline bg-bg p-4">
              <BundlePanel
                creators={creators}
                overlap={overlap}
                activeCategory={filters.allowedCategory}
              />
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile filters drawer */}
      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} side="left">
        <FilterPanel
          options={options}
          filters={filters}
          setFilters={setFilters}
          resultCount={filtered.length}
          onReset={() => setFilters(defaultFilters(options.audienceBounds))}
        />
      </Drawer>

      {/* Mobile bundle drawer + FAB */}
      <button
        type="button"
        onClick={() => setBundleOpen(true)}
        className="cm-label fixed bottom-5 right-5 z-30 flex items-center gap-2 bg-accent px-5 py-3 text-ink-inverse shadow-card-hover lg:hidden"
      >
        Bundle · {bundle.count}
      </button>
      <Drawer open={bundleOpen} onClose={() => setBundleOpen(false)} side="right">
        <div className="h-full">
          <BundlePanel
            creators={creators}
            overlap={overlap}
            activeCategory={filters.allowedCategory}
          />
        </div>
      </Drawer>
    </div>
  );
}

function Drawer({
  open,
  onClose,
  side,
  children,
}: {
  open: boolean;
  onClose: () => void;
  side: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40"
          />
          <motion.div
            initial={{ x: side === "left" ? "-100%" : "100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "left" ? "-100%" : "100%" }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className={`cm-scroll absolute top-0 ${
              side === "left" ? "left-0" : "right-0"
            } h-full w-[85%] max-w-sm overflow-y-auto bg-bg p-5`}
          >
            <button
              type="button"
              onClick={onClose}
              className="cm-label mb-4 text-ink/50 hover:text-accent"
            >
              ✕ Close
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
