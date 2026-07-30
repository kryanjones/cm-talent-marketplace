"use client";

import { compactNumber, fullNumber, percent } from "@/lib/format";
import { launchEmail, observations, type CampaignReport } from "@/lib/campaign";
import { Chip, Eyebrow } from "@/components/ui";

/**
 * The end-of-campaign wrap.
 *
 * One page, built from what was actually recorded. Where figures are missing it
 * says so rather than rounding the gap down to zero — a wrap report that
 * silently reports partial data as a result is worse than no report, because
 * the advertiser acts on it.
 *
 * "Observations" rather than "recommendations": everything here is arithmetic.
 * The strategic recap is written by a human on top of it.
 */
export function WrapReport({ report }: { report: CampaignReport }) {
  const r = report;
  const notes = observations(r);
  const { subject, body } = launchEmail(r);
  const mailto = `mailto:?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;

  return (
    <article className="flex flex-col gap-10 pb-16 pt-8">
      <header className="flex flex-col gap-4">
        <span className="cm-rule-red" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Campaign wrap</Eyebrow>
            <h1 className="cm-title mt-2">{r.campaign.name || r.campaign.advertiser}</h1>
            <p className="cm-label mt-2 text-ink/55">
              {r.campaign.advertiser}
              {r.campaign.startMonth ? ` · ${r.campaign.startMonth}` : ""}
              {r.campaign.endMonth ? ` – ${r.campaign.endMonth}` : ""}
              {r.campaign.status ? ` · ${r.campaign.status}` : ""}
            </p>
          </div>
          <div className="cm-no-print flex gap-2">
            <a
              href={mailto}
              className="cm-label border border-hairline px-4 py-2.5 text-ink/60 transition-colors hover:border-ink hover:text-ink"
            >
              Launch email
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="cm-label border border-ink px-4 py-2.5 transition-colors hover:bg-ink hover:text-ink-inverse"
            >
              Download report
            </button>
          </div>
        </div>
      </header>

      {/* Topline */}
      <section className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-4">
        <Stat label="Creators" value={String(r.creatorCount)} />
        <Stat
          label="Placements live"
          value={`${r.livePlacements} of ${r.placementCount}`}
        />
        <Stat
          label="Impressions"
          value={r.impressionsReported ? compactNumber(r.impressions) : "Not reported"}
          note={
            r.impressionsReported
              ? `from ${r.impressionsReported} of ${r.placementCount} placements`
              : "no figures entered yet"
          }
          accent={r.impressionsReported > 0}
        />
        <Stat
          label="Click rate"
          value={r.clickRate != null ? percent(r.clickRate, 2) : "Not reported"}
          note={
            r.clickRate != null
              ? `${fullNumber(r.clicks)} clicks`
              : "needs impressions and clicks on the same placement"
          }
        />
      </section>

      {r.partiallyMeasured && (
        <p className="cm-fine border border-warning/40 bg-warning/5 px-4 py-3 text-warning">
          Performance is recorded for {r.impressionsReported} of {r.placementCount}{" "}
          placements. Totals above cover only those — the remainder are unmeasured,
          not zero.
        </p>
      )}

      {/* Observations */}
      {notes.length > 0 && (
        <section className="flex flex-col gap-3">
          <Eyebrow>What the numbers show</Eyebrow>
          <ul className="flex max-w-3xl flex-col gap-2">
            {notes.map((n) => (
              <li key={n} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 bg-accent" aria-hidden />
                <span className="cm-body text-sm text-ink/70">{n}</span>
              </li>
            ))}
          </ul>
          <p className="cm-fine text-ink/40">
            Observations are arithmetic on recorded data. Strategic recommendations
            for the next flight are written by the team.
          </p>
        </section>
      )}

      {/* Placement detail */}
      <section className="flex flex-col gap-3">
        <Eyebrow>Placements</Eyebrow>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Creator</Th>
                <Th>Platform</Th>
                <Th>Published</Th>
                <Th align="right">Impressions</Th>
                <Th align="right">Clicks</Th>
                <Th>Link</Th>
              </tr>
            </thead>
            <tbody>
              {r.placements.map((p) => (
                <tr key={p.bookingId} className="border-b border-hairline/60">
                  <td className="cm-sans py-2.5 pr-3 text-sm font-semibold">
                    {p.creatorName}
                  </td>
                  <td className="cm-fine py-2.5 pr-3 text-ink/60">{p.platform}</td>
                  <td className="cm-fine py-2.5 pr-3 text-ink/60">
                    {p.publishedDate ?? (
                      <span className="text-warning">not published</span>
                    )}
                  </td>
                  <td className="cm-fine py-2.5 pr-3 text-right tabular-nums">
                    {p.impressions != null ? (
                      fullNumber(p.impressions)
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                  <td className="cm-fine py-2.5 pr-3 text-right tabular-nums">
                    {p.clicks != null ? (
                      <>
                        {fullNumber(p.clicks)}
                        {/* Say where the number came from: one we measured is
                            worth more than one transcribed off a dashboard. */}
                        <span
                          className={`ml-1.5 ${
                            p.clickSource === "tracked"
                              ? "text-success"
                              : "text-ink/35"
                          }`}
                          title={
                            p.clickSource === "tracked"
                              ? "Measured by our tracked link"
                              : "Reported figure, entered by hand"
                          }
                        >
                          {p.clickSource === "tracked" ? "measured" : "reported"}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                  <td className="cm-fine py-2.5">
                    {p.liveUrl ? (
                      <a
                        href={p.liveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-accent underline-offset-2 hover:underline"
                      >
                        {p.liveUrl.replace(/^https?:\/\//, "").slice(0, 42)}
                      </a>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cm-fine text-ink/40">
          A dash means no figure has been recorded for that placement, not a zero
          result. Clicks marked <span className="text-success">measured</span> come
          from our own tracked links; <span className="text-ink/55">reported</span>{" "}
          figures were entered by hand from platform dashboards.
        </p>
      </section>

      {/* Delivery notes worth carrying into the recap */}
      {r.placements.some((p) => p.deliveryNotes) && (
        <section className="flex flex-col gap-3">
          <Eyebrow>Delivery notes</Eyebrow>
          <div className="flex flex-col divide-y divide-hairline border border-hairline">
            {r.placements
              .filter((p) => p.deliveryNotes)
              .map((p) => (
                <div key={p.bookingId} className="flex flex-col gap-1 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="cm-sans text-sm font-semibold">
                      {p.creatorName}
                    </span>
                    <Chip tone="muted">{p.platform}</Chip>
                  </div>
                  <p className="cm-body text-sm text-ink/65">{p.deliveryNotes}</p>
                </div>
              ))}
          </div>
        </section>
      )}

      <p className="cm-fine border-t border-hairline pt-5 text-ink/40">
        Figures as recorded at the time of export. Nothing here is collected
        automatically — impressions and clicks are entered from platform reporting.
      </p>
    </article>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`cm-fine pb-2 font-normal text-ink/45 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Stat({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 bg-bg px-5 py-5">
      <span className="cm-fine text-ink/45">{label}</span>
      <span
        className={`cm-sans text-2xl font-bold leading-none tabular-nums ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </span>
      {note && <span className="cm-fine text-ink/35">{note}</span>}
    </div>
  );
}
