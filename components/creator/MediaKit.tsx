"use client";

import Image from "next/image";
import { useMemo } from "react";
import type { BuyerCreator, OverlapAssumption, AgeBands, GenderSplit } from "@/lib/types";
import {
  calculateBundleReach,
  coefficientsFromAssumptions,
  type ResolvedComponent,
} from "@/lib/reach";
import { compactNumber, fullNumber, percentFromFraction } from "@/lib/format";
import { Bar, Chip, Eyebrow, FictionalBadge } from "@/components/ui";
import { AVAILABILITY_TONE, type Availability } from "@/lib/inventory";

/**
 * A creator's digital media kit.
 *
 * Airtable-fed and deliberately restrained: one column, generous space, and a
 * strict order — who they are, then who is listening, then what you can buy,
 * then how to work with them. The reference kits we looked at put everything at
 * equal weight, which is why they read as overwhelming.
 *
 * Buyer-facing, so it receives a BuyerCreator: rate cards and the sales-only
 * boundary fields are already stripped upstream and cannot leak here.
 */
export function MediaKit({
  creator,
  overlap,
  availability = {},
}: {
  creator: BuyerCreator;
  overlap: OverlapAssumption[];
  /** channelId → qualitative state. Slot counts never reach this document. */
  availability?: Record<string, Availability>;
}) {
  const coef = useMemo(() => coefficientsFromAssumptions(overlap), [overlap]);

  // Reuse the bundle math to build a creator-level audience composite: treating
  // all of their channels as one "bundle" gives the deduplicated cross-platform
  // reach plus the weighted demographic picture.
  const composite = useMemo(() => {
    const components: ResolvedComponent[] = creator.channels.map((channel) => ({
      creator: {
        id: creator.id,
        name: creator.name,
        primaryBeat: creator.primaryBeat,
        categoryAffinities: creator.categoryAffinities,
        homeMarketDMA: creator.homeMarketDMA,
      },
      channel,
    }));
    return calculateBundleReach(components, coef);
  }, [creator, coef]);

  const ageBands = composite.demographicComposite.ageBands as AgeBands | null;
  const genderSplit = composite.demographicComposite.genderSplit as GenderSplit | null;
  const largestAudience = Math.max(
    0,
    ...creator.channels.map((c) => c.audienceSize ?? 0)
  );

  // Deliberately NOT a blended engagement rate. A newsletter open rate and a
  // LinkedIn click rate are different measurements, so averaging them produces
  // a headline number that looks spectacular and means nothing. Instead we show
  // the single strongest channel and name the surface it belongs to, so the
  // figure stays comparable to something. Per-channel rates live below.
  // Only ever the curated list. The raw internal partner record lives on
  // BrandBoundary.pastBrandPartners and is stripped before it reaches here.
  const partnerships = useMemo(
    () => parsePartnerships(creator.featuredPartnerships),
    [creator.featuredPartnerships]
  );

  const strongest = useMemo(() => {
    const rated = creator.channels.filter((c) => c.avgEngagementRate != null);
    if (!rated.length) return null;
    return rated.reduce((a, b) =>
      (b.avgEngagementRate ?? 0) > (a.avgEngagementRate ?? 0) ? b : a
    );
  }, [creator.channels]);

  return (
    <article className="flex flex-col gap-14 pb-16 pt-8">
      {/* The media kit was designed at screen width, so landscape is the
          orientation that survives print-to-PDF; portrait squeezes the
          two-column header and stat grids. Scoped here rather than in the
          global print styles because the wrap report prints portrait. */}
      <style>{`@media print { @page { size: letter landscape; margin: 12mm; } }`}</style>
      {/* ---------- Identity ---------- */}
      <header className="grid grid-cols-1 gap-8 md:grid-cols-[300px_minmax(0,1fr)]">
        <div className="relative aspect-[3/4] w-full max-w-[300px] overflow-hidden bg-placeholder-grey">
          {creator.headshot && (
            <Image
              src={creator.headshot}
              alt={creator.name}
              fill
              sizes="300px"
              className="object-cover"
              unoptimized
              priority
            />
          )}
          {creator.isDemoPersona && (
            <div className="absolute left-3 top-3">
              <FictionalBadge />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div>
            <span className="cm-rule-red mb-4" />
            <h1 className="cm-title">{creator.name}</h1>
            <p className="cm-label mt-2 text-ink/55">
              {creator.primaryBeat}
              {creator.homeMarketDMA ? ` · ${creator.homeMarketDMA}` : ""}
            </p>
          </div>

          {/* Sales positioning — written by a human, with Bio as the fallback. */}
          {(creator.positioning || creator.bio) && (
            <p className="cm-body max-w-2xl text-ink/75">
              {creator.positioning || creator.bio}
            </p>
          )}

          {creator.priorOutlets.length > 0 && (
            <p className="cm-fine text-ink/50">
              Previously: {creator.priorOutlets.join(" · ")}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {creator.trustSignals.map((t) => (
              <Chip key={t} tone="accent">
                {t}
              </Chip>
            ))}
            {creator.categoryAffinities.map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>

          <div className="cm-no-print flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => window.print()}
              className="cm-label border border-ink px-4 py-2.5 transition-colors hover:bg-ink hover:text-ink-inverse"
            >
              Download media kit
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Headline numbers ---------- */}
      <section className="grid grid-cols-2 gap-px border border-hairline bg-hairline md:grid-cols-4">
        <Stat label="Largest audience" value={compactNumber(largestAudience)} />
        <Stat
          label="Reach per run"
          value={compactNumber(composite.netReach)}
          note="deduplicated across channels"
        />
        {strongest ? (
          <Stat
            label="Strongest channel"
            value={percentFromFraction(strongest.avgEngagementRate)}
            note={`${strongest.platform}${
              strongest.formatMetricLabel
                ? ` · ${strongest.formatMetricLabel.toLowerCase()}`
                : " engagement"
            }`}
          />
        ) : (
          <Stat label="Channels" value={String(creator.channels.length)} />
        )}
        <Stat
          label="Platforms"
          value={String(new Set(creator.channels.map((c) => c.platform)).size)}
          note={Array.from(new Set(creator.channels.map((c) => c.platform)))
            .slice(0, 3)
            .join(", ")}
        />
      </section>

      {/* ---------- Audience ---------- */}
      {(ageBands || genderSplit || composite.geoFootprint.length > 0) && (
        <section className="flex flex-col gap-6">
          <div>
            <Eyebrow>Who is listening</Eyebrow>
            <h2 className="cm-h2 mt-2">Audience composite</h2>
            <p className="cm-fine mt-1 text-ink/45">
              Weighted across every channel by reach.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            {ageBands && (
              <div className="flex flex-col gap-3">
                <Eyebrow>Age</Eyebrow>
                <div className="flex flex-col gap-2">
                  {Object.entries(ageBands).map(([band, pct]) => (
                    <Bar key={band} label={band} pct={pct} />
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-6">
              {genderSplit && (
                <div className="flex flex-col gap-3">
                  <Eyebrow>Gender</Eyebrow>
                  <div className="flex flex-col gap-2">
                    {Object.entries(genderSplit).map(([k, pct]) => (
                      <Bar key={k} label={k} pct={pct} />
                    ))}
                  </div>
                </div>
              )}

              {composite.geoFootprint.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Eyebrow>Top markets</Eyebrow>
                  <div className="flex flex-wrap gap-1.5">
                    {composite.geoFootprint.slice(0, 8).map((g) => (
                      <Chip key={g} tone="muted">
                        {g}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Channels ---------- */}
      <section className="flex flex-col gap-6">
        <div>
          <Eyebrow>Where they publish</Eyebrow>
          <h2 className="cm-h2 mt-2">Channels</h2>
        </div>

        <div className="flex flex-col">
          {creator.channels.map((ch) => (
            <div
              key={ch.id}
              className="grid grid-cols-1 gap-4 border-t border-hairline py-6 md:grid-cols-[180px_minmax(0,1fr)]"
            >
              <div>
                <p className="cm-h3 font-bold">{ch.platform}</p>
                {availability[ch.id] && (
                  <p
                    className={`cm-fine mt-1 ${AVAILABILITY_TONE[availability[ch.id]]}`}
                  >
                    {availability[ch.id]}
                  </p>
                )}
                {ch.handleUrl && (
                  <p className="cm-fine mt-1 break-all text-ink/45">{ch.handleUrl}</p>
                )}
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Mini label="Audience" value={compactNumber(ch.audienceSize)} />
                  <Mini label="Reach / unit" value={compactNumber(ch.avgReachPerUnit)} />
                  <Mini
                    label="Engagement"
                    value={percentFromFraction(ch.avgEngagementRate)}
                  />
                  {ch.formatMetricLabel && (
                    <Mini
                      label={ch.formatMetricLabel}
                      value={ch.formatMetricValue ?? "—"}
                    />
                  )}
                </div>

                {ch.availableAdFormats.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="cm-fine mr-1 text-ink/45">Formats</span>
                    {ch.availableAdFormats.map((f) => (
                      <Chip key={f} tone="muted">
                        {f}
                      </Chip>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {ch.leadTimeDays != null && (
                    <span className="cm-fine text-ink/50">
                      Lead time {ch.leadTimeDays} days
                    </span>
                  )}
                  {ch.audienceIncomeIndex && (
                    <span className="cm-fine text-ink/50">
                      Income index {ch.audienceIncomeIndex}
                    </span>
                  )}
                  {ch.audienceEducationIndex && (
                    <span className="cm-fine text-ink/50">
                      Education index {ch.audienceEducationIndex}
                    </span>
                  )}
                  {!ch.talentReadOK && (
                    <span className="cm-fine text-warning">No talent ad-read</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Recent partnerships (curated) ---------- */}
      {partnerships.length > 0 && (
        <section className="flex flex-col gap-6">
          <div>
            <Eyebrow>Proof</Eyebrow>
            <h2 className="cm-h2 mt-2">Recent partnerships</h2>
          </div>
          <div className="grid grid-cols-1 gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {partnerships.map((p) => (
              <div key={p.brand} className="flex flex-col gap-1 bg-bg px-5 py-4">
                <span className="cm-sans font-semibold">{p.brand}</span>
                {p.note && (
                  <span className="cm-fine text-ink/55">{p.note}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Working with them ---------- */}
      {creator.brandBoundary && (
        <section className="flex flex-col gap-4 border-t border-hairline pt-8">
          <div>
            <Eyebrow>Working together</Eyebrow>
            <h2 className="cm-h2 mt-2">Brand fit</h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              {creator.brandBoundary.noGoCategories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="cm-fine mr-1 text-ink/45">Will not run</span>
                  {creator.brandBoundary.noGoCategories.map((c) => (
                    <Chip key={c} tone="accent">
                      {c}
                    </Chip>
                  ))}
                </div>
              )}
              {creator.brandBoundary.conditionalCategories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="cm-fine mr-1 text-ink/45">With conditions</span>
                  {creator.brandBoundary.conditionalCategories.map((c) => (
                    <Chip key={c}>{c}</Chip>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {creator.brandBoundary.conditionsNotes && (
                <p className="cm-body text-sm text-ink/65">
                  {creator.brandBoundary.conditionsNotes}
                </p>
              )}
              {creator.brandSafetyTier && (
                <p className="cm-fine text-ink/50">
                  Brand safety tier: {creator.brandSafetyTier}
                </p>
              )}
              {creator.politicalLean && (
                <p className="cm-fine text-ink/50">
                  Audience lean: {creator.politicalLean}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Contact ---------- */}
      <section className="cm-no-print flex flex-wrap items-center justify-between gap-4 border border-hairline bg-bg-alt px-6 py-5">
        <div>
          <p className="cm-h3 font-bold">Interested in {creator.name}?</p>
          <p className="cm-fine mt-1 text-ink/55">
            Rates and availability are shared by the Collective Media team on request.
          </p>
        </div>
        <a
          href={`mailto:partnerships@collective.media?subject=${encodeURIComponent(
            `Partnership enquiry — ${creator.name}`
          )}`}
          className="cm-label bg-accent px-5 py-3 text-ink-inverse transition-opacity hover:opacity-90"
        >
          Request pricing
        </a>
      </section>

      <p className="cm-fine text-ink/40">
        Figures reflect the most recent data on file. Reach per run is an estimate,
        deduplicated across this creator&rsquo;s channels.
        {" "}
        {fullNumber(composite.grossReach)} gross before deduplication.
      </p>
    </article>
  );
}

/**
 * Parse the curated "Featured Partnerships" field.
 *
 * One partnership per line (or comma-separated). An optional short note may
 * follow an em dash, hyphen or pipe: "Delta — three-part travel series".
 */
export function parsePartnerships(
  raw: string | null
): { brand: string; note: string | null }[] {
  if (!raw) return [];
  // Split on newlines when the field is written one-per-line, and only fall
  // back to commas for a plain single-line list. Splitting on both breaks any
  // note that contains a comma ("newsletter takeover, Q3" became two entries).
  const parts = raw.includes("\n") ? raw.split("\n") : raw.split(",");
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.+?)\s*(?:—|–|\||\s-\s)\s*(.+)$/);
      return m
        ? { brand: m[1].trim(), note: m[2].trim() }
        : { brand: line, note: null };
    });
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-bg px-5 py-5">
      <span className="cm-fine text-ink/45">{label}</span>
      <span className="cm-sans text-2xl font-bold leading-none">{value}</span>
      {note && <span className="cm-fine text-ink/35">{note}</span>}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="cm-fine text-ink/45">{label}</span>
      <span className="cm-sans text-base font-bold leading-tight">{value}</span>
    </div>
  );
}
