"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { BuyerCreator } from "@/lib/types";
import { compactNumber, percentFromFraction } from "@/lib/format";
import { Chip, Eyebrow, FictionalBadge, Pill } from "@/components/ui";
import { AVAILABILITY_TONE, type Availability } from "@/lib/inventory";
import { useBundle } from "./bundle-context";

export function CreatorCard({
  creator,
  availability = {},
}: {
  creator: BuyerCreator;
  /** channelId → qualitative state, resolved server-side. */
  availability?: Record<string, Availability>;
}) {
  const [expanded, setExpanded] = useState(false);
  const bundle = useBundle();

  const totalReach = creator.channels.reduce(
    (s, c) => s + (c.avgReachPerUnit ?? 0),
    0
  );
  const platforms = Array.from(new Set(creator.channels.map((c) => c.platform)));
  const selectedCount = bundle.creatorChannelCount(creator.id);
  const allSelected =
    creator.channels.length > 0 && selectedCount === creator.channels.length;

  return (
    <motion.article
      layout
      className="group flex flex-col border border-hairline bg-bg shadow-card transition-shadow duration-standard ease-brand hover:shadow-card-hover"
    >
      {/* Image-forward header. The portrait itself is a door to the media kit —
          Sarah's ask — while the badges layered on top stay non-navigating. */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-placeholder-grey">
        <Link
          href={`/creator/${creator.id}`}
          aria-label={`${creator.name} — media kit`}
          className="absolute inset-0"
        >
          {creator.headshot ? (
            <Image
              src={creator.headshot}
              alt={creator.name}
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              className="object-cover transition-transform duration-expressive ease-brand group-hover:scale-[1.03]"
              unoptimized
            />
          ) : null}
        </Link>
        {/*
          One row rather than two independently-positioned corners: pinning the
          badge left and the tier right let them collide on narrow cards, so
          "Use-with-context" rendered on top of "Fictional persona". Wrapping
          keeps both readable at any width.
        */}
        {(creator.isDemoPersona || creator.brandSafetyTier) && (
          <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-1.5">
            {creator.isDemoPersona ? <FictionalBadge /> : <span />}
            {creator.brandSafetyTier && (
              <span className="cm-fine whitespace-nowrap border border-hairline bg-bg/85 px-2 py-1 text-ink/70 backdrop-blur-sm">
                {creator.brandSafetyTier}
              </span>
            )}
          </div>
        )}
        {selectedCount > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-accent px-3 py-1.5">
            <span className="cm-fine text-ink-inverse">
              {selectedCount} channel{selectedCount > 1 ? "s" : ""} in bundle
            </span>
          </div>
        )}
      </div>

      {/* Identity */}
      <div className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="cm-h3 font-bold">{creator.name}</h3>
          <p className="cm-label mt-1 text-ink/55">
            {creator.primaryBeat}
            {creator.homeMarketDMA ? ` · ${creator.homeMarketDMA}` : ""}
          </p>
        </div>

        {/*
          One number, stated as a sentence rather than a dashboard. The card's
          job is to convey fit — beat, formats, credibility — and a buyer
          comparing three creators does not read six figures per card. Audience
          size, engagement, channel counts and lean all live one click away, in
          the channel detail and the media kit.
        */}
        <p className="cm-body text-sm text-ink/65">
          Reaches <strong className="font-semibold text-ink">
            ~{compactNumber(totalReach)}
          </strong>{" "}
          per run across {creator.channels.length} channel
          {creator.channels.length === 1 ? "" : "s"}.
        </p>

        {/* What you can actually buy */}
        <div className="flex flex-wrap gap-1">
          {platforms.map((p) => (
            <Chip key={p} tone="muted">
              {p}
            </Chip>
          ))}
        </div>

        {/* Credibility and category fit, kept to one line */}
        {(creator.trustSignals.length > 0 ||
          creator.categoryAffinities.length > 0) && (
          <div className="flex flex-wrap items-center gap-1">
            {creator.trustSignals.slice(0, 2).map((t) => (
              <Chip key={t} tone="accent">
                {t}
              </Chip>
            ))}
            {creator.categoryAffinities.slice(0, 2).map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>
        )}

        {/*
          Three actions do not fit one line at card width. `ml-auto` on the last
          one pushed it past the card edge, and the middle label broke mid-phrase
          ("VIEW" / "CHANNELS"). Wrapping the row and keeping each label
          unbreakable lets them reflow as whole units instead.
        */}
        <div className="mt-1 flex flex-col items-start gap-2.5">
          <Pill active={allSelected} onClick={() => bundle.toggleCreator(creator)}>
            {allSelected ? "Remove all" : "Add creator"}
          </Pill>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="cm-label whitespace-nowrap text-ink/55 underline-offset-4 transition-colors duration-micro hover:text-ink hover:underline"
            >
              {/* "Channels" not "View channels": at 182px of usable card width
                  the longer label needs 192px alongside "Media kit" and wraps.
                  Two noun links also read more consistently together. */}
              {expanded ? "Hide" : "Channels"}
            </button>
            <Link
              href={`/creator/${creator.id}`}
              className="cm-label whitespace-nowrap text-accent underline-offset-4 transition-opacity duration-micro hover:underline"
            >
              Media kit
            </Link>
          </div>
        </div>
      </div>

      {/* Expanded per-channel detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden border-t border-hairline bg-bg-alt"
          >
            <div className="flex flex-col divide-y divide-hairline">
              {creator.channels.map((ch) => {
                const inBundle = bundle.has(ch.id);
                return (
                  <div key={ch.id} className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="cm-sans text-sm font-semibold">
                            {ch.platform}
                          </p>
                          {availability[ch.id] && (
                            <span
                              className={`cm-fine ${
                                AVAILABILITY_TONE[availability[ch.id]]
                              }`}
                            >
                              {availability[ch.id]}
                            </span>
                          )}
                        </div>
                        {ch.handleUrl && (
                          <p className="cm-fine text-ink/45">{ch.handleUrl}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => bundle.toggleChannel(creator.id, ch.id)}
                        className={`cm-label border px-3 py-1.5 transition-all duration-micro ease-brand ${
                          inBundle
                            ? "border-accent bg-accent text-ink-inverse"
                            : "border-ink/40 text-ink hover:bg-ink hover:text-ink-inverse"
                        }`}
                      >
                        {inBundle ? "✓ Added" : "+ Add"}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Metric
                        label="Audience"
                        value={compactNumber(ch.audienceSize)}
                      />
                      <Metric
                        label="Reach / unit"
                        value={compactNumber(ch.avgReachPerUnit)}
                      />
                      <Metric
                        label="Engagement"
                        value={percentFromFraction(ch.avgEngagementRate)}
                      />
                    </div>
                    {ch.formatMetricLabel && (
                      <p className="cm-fine text-ink/55">
                        {ch.formatMetricLabel}: {ch.formatMetricValue}
                      </p>
                    )}
                    {ch.availableAdFormats.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ch.availableAdFormats.map((f) => (
                          <Chip key={f} tone="muted">
                            {f}
                          </Chip>
                        ))}
                      </div>
                    )}
                    {!ch.talentReadOK && (
                      <p className="cm-fine text-warning">
                        Sponsor dollars accepted — no talent ad-read on this channel.
                      </p>
                    )}
                  </div>
                );
              })}

              {creator.brandBoundary &&
                (creator.brandBoundary.noGoCategories.length > 0 ||
                  creator.brandBoundary.conditionalCategories.length > 0) && (
                  <div className="flex flex-col gap-2 p-4">
                    <Eyebrow>Brand boundaries</Eyebrow>
                    {creator.brandBoundary.noGoCategories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="cm-fine text-ink/45">No-go:</span>
                        {creator.brandBoundary.noGoCategories.map((c) => (
                          <Chip key={c} tone="accent">
                            {c}
                          </Chip>
                        ))}
                      </div>
                    )}
                    {creator.brandBoundary.conditionalCategories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="cm-fine text-ink/45">Conditional:</span>
                        {creator.brandBoundary.conditionalCategories.map((c) => (
                          <Chip key={c}>{c}</Chip>
                        ))}
                      </div>
                    )}
                    {creator.brandBoundary.conditionsNotes && (
                      <p className="cm-fine text-ink/55">
                        {creator.brandBoundary.conditionsNotes}
                      </p>
                    )}
                  </div>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="cm-fine text-ink/45">{label}</span>
      <span className="cm-sans text-base font-bold leading-tight">{value}</span>
    </div>
  );
}
