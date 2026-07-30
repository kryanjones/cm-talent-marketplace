"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Booking, Creator, RateCard } from "@/lib/types";
import { compactNumber, percentFromFraction, usd } from "@/lib/format";
import { Chip, Eyebrow } from "@/components/ui";
import { AvailabilityGrid } from "@/components/calendar/AvailabilityGrid";
import { AGREEMENT_TONE, agreementNote } from "@/lib/agency";
import {
  computeFill,
  rollUp,
  currentMonthKey,
  AVAILABILITY_TONE,
  type ChannelFill,
} from "@/lib/inventory";

export function InventoryTable({
  creators,
  bookings,
}: {
  creators: Creator[];
  bookings: Booking[];
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const month = currentMonthKey();
  const fills = useMemo(
    () => computeFill(creators.flatMap((c) => c.channels), bookings, month),
    [creators, bookings, month]
  );
  const anyBookings = bookings.length > 0;

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return creators
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.primaryBeat ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [creators, query]);

  return (
    <div className="flex flex-col gap-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Eyebrow>Inventory · {filtered.length} creators</Eyebrow>
          <span className="cm-fine text-ink/45">
            Availability for {month}
            {!anyBookings &&
              " · no bookings recorded yet, so everything reads as open"}
          </span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search creator or beat…"
          className="cm-sans w-64 max-w-full border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
        />
      </div>

      <div className="border border-hairline">
        {/* Header row */}
        <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 border-b border-hairline bg-bg-alt px-4 py-2 md:grid">
          <span className="cm-fine text-ink/45">Creator</span>
          <span className="cm-fine text-ink/45">Beat</span>
          <span className="cm-fine text-ink/45">Channels</span>
          <span className="cm-fine text-ink/45">Open this month</span>
          <span className="cm-fine text-ink/45">Detail</span>
        </div>

        <div className="divide-y divide-hairline">
          {filtered.map((c) => {
            const open = openId === c.id;
            const roll = rollUp(
              c.channels
                .map((ch) => fills.get(ch.id))
                .filter(Boolean) as ChannelFill[]
            );
            return (
              <div key={c.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  className="grid w-full grid-cols-2 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-alt md:grid-cols-[2fr_1fr_1fr_1fr_auto]"
                >
                  <span className="cm-sans font-semibold">
                    {c.name}
                    {c.agreementStatus !== "Signed" && (
                      <span
                        title={agreementNote(c.agreementStatus)}
                        className={`cm-fine ml-2 font-normal ${
                          AGREEMENT_TONE[c.agreementStatus ?? "Not sent"]
                        }`}
                      >
                        ● not cleared
                      </span>
                    )}
                  </span>
                  <span className="cm-fine text-ink/60">{c.primaryBeat}</span>
                  <span className="cm-fine text-ink/60">{c.channels.length}</span>
                  <span className="cm-fine">
                    {roll.capacity > 0 ? (
                      <>
                        <span className={AVAILABILITY_TONE[roll.availability]}>
                          {roll.available} of {roll.capacity} open
                        </span>
                        {roll.booked > 0 && (
                          <span className="text-ink/40"> · {roll.booked} booked</span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </span>
                  <span className="cm-label text-accent">{open ? "Hide" : "View"}</span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden bg-bg-alt"
                    >
                      <div className="flex flex-col gap-4 p-4">
                        {c.channels.map((ch) => (
                          <div key={ch.id} className="border border-hairline bg-bg p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="cm-sans font-semibold">{ch.platform}</p>
                              <div className="flex flex-wrap gap-1">
                                {!ch.talentReadOK && (
                                  <Chip tone="accent">No talent read</Chip>
                                )}
                                {ch.leadTimeDays != null && (
                                  <Chip tone="muted">{ch.leadTimeDays}d lead</Chip>
                                )}
                                {(() => {
                                  const f = fills.get(ch.id);
                                  if (!f || f.capacity === null) return null;
                                  return (
                                    <span
                                      className={`cm-fine border border-hairline px-2 py-1 ${
                                        AVAILABILITY_TONE[f.availability]
                                      }`}
                                    >
                                      {f.available} of {f.capacity} open
                                      {f.booked > 0 ? ` · ${f.booked} booked` : ""}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <Mini label="Audience" v={compactNumber(ch.audienceSize)} />
                              <Mini label="Reach/unit" v={compactNumber(ch.avgReachPerUnit)} />
                              <Mini label="Engagement" v={percentFromFraction(ch.avgEngagementRate)} />
                              <Mini label={ch.formatMetricLabel ?? "Metric"} v={ch.formatMetricValue ?? "—"} />
                            </div>
                            <RateCardView card={ch.rateCard} />
                          </div>
                        ))}

                        {/* Six-month availability, plus a link the team can
                            send to the creator's own people. */}
                        <div className="border border-hairline bg-bg p-4">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <Eyebrow>Availability · next 6 months</Eyebrow>
                            <a
                              href={`/availability/${c.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cm-label text-accent underline-offset-4 hover:underline"
                            >
                              Shareable link →
                            </a>
                          </div>
                          <AvailabilityGrid
                            creatorName={c.name}
                            channels={c.channels}
                            bookings={bookings}
                          />
                        </div>

                        {c.brandBoundary && (
                          <div className="border border-hairline bg-bg p-4">
                            <Eyebrow>Brand boundaries (sales)</Eyebrow>
                            <div className="mt-2 flex flex-col gap-2">
                              {c.brandBoundary.pastBrandPartners && (
                                <p className="cm-fine text-ink/65">
                                  <span className="text-ink/45">Past partners: </span>
                                  {c.brandBoundary.pastBrandPartners}
                                </p>
                              )}
                              {c.brandBoundary.activeExclusivities && (
                                <p className="cm-fine text-warning">
                                  <span className="text-ink/45">Active exclusivity: </span>
                                  {c.brandBoundary.activeExclusivities}
                                </p>
                              )}
                              <p className="cm-fine text-ink/65">
                                <span className="text-ink/45">Category exclusivity: </span>
                                {c.brandBoundary.categoryExclusivityAvailable
                                  ? "Available"
                                  : "Not offered"}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Mini({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <span className="cm-fine text-ink/45">{label}</span>
      <p className="cm-sans text-sm font-bold">{v}</p>
    </div>
  );
}

function RateCardView({ card }: { card: RateCard | string | null }) {
  if (!card) return null;
  if (typeof card === "string") {
    return <p className="mt-3 cm-fine text-ink/55">Rate card: {card}</p>;
  }
  const entries = Object.entries(card);
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <Eyebrow>Rate card</Eyebrow>
      <div className="mt-2 flex flex-wrap gap-2">
        {entries.map(([format, entry]) => (
          <span key={format} className="cm-fine border border-hairline px-2 py-1 text-ink/70">
            {format}:{" "}
            <strong className="text-ink">
              {usd(entry.usd)}
              {entry.type === "cpm" ? " CPM" : " flat"}
            </strong>
          </span>
        ))}
      </div>
    </div>
  );
}
