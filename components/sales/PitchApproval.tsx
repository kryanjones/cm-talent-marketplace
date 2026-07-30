"use client";

import { useMemo, useState } from "react";
import type { AdvertiserRelationship, BundleComponent, Creator } from "@/lib/types";
import { priceDeal, primaryFormat, type DealLineInput, type Treatment } from "@/lib/deal";
import {
  buildRequests,
  approvalEmail,
  DEFAULT_RESPONSE_DAYS,
  type ApprovalRequest,
} from "@/lib/approval";
import { usd } from "@/lib/format";
import { Eyebrow } from "@/components/ui";

/**
 * Creator approval requests under MSA §3.3.
 *
 * The clause requires the submission to carry the proposed Placement Fee, any
 * Pass-Through Costs, the deliverables and flight dates, and the resulting
 * allocation between the Parties — so the request is generated from the priced
 * deal rather than typed. One request per creator, showing only that creator's
 * own placements and their own numbers.
 *
 * Sending is left to the person: these are emails to real people, and the app
 * records that a request went out rather than pretending to send it.
 */
export function PitchApproval({
  components,
  creators,
  relationships,
}: {
  components: BundleComponent[];
  creators: Creator[];
  relationships: AdvertiserRelationship[];
}) {
  const byId = useMemo(() => new Map(creators.map((c) => [c.id, c])), [creators]);
  const [advertiser, setAdvertiser] = useState("");
  const [flightMonth, setFlightMonth] = useState("");
  const [agencyCut, setAgencyCut] = useState(0);
  const [passThroughs, setPassThroughs] = useState(0);
  const [recorded, setRecorded] = useState<"idle" | "saving" | "done" | "error">("idle");

  const lines = useMemo<DealLineInput[]>(
    () =>
      components
        .map((comp) => {
          const channel = byId
            .get(comp.creatorId)
            ?.channels.find((ch) => ch.id === comp.channelId);
          const format = channel ? primaryFormat(channel) : null;
          return format
            ? { creatorId: comp.creatorId, channelId: comp.channelId, format, units: 1 }
            : null;
        })
        .filter(Boolean) as DealLineInput[],
    [components, byId]
  );

  const treatments = useMemo(() => {
    const q = advertiser.trim().toLowerCase();
    const out: Record<string, Treatment> = {};
    if (!q) return out;
    for (const rel of relationships) {
      if (!rel.creatorId) continue;
      const brand = rel.brand.trim().toLowerCase();
      const parent = (rel.parentCompany ?? "").trim().toLowerCase();
      if (!((brand && brand === q) || (parent && parent === q))) continue;
      if (rel.treatment === "Keep it") out[rel.creatorId] = "Keep it";
      else if (rel.treatment === "Hand it to us" && out[rel.creatorId] !== "Keep it")
        out[rel.creatorId] = "Hand it to us";
    }
    return out;
  }, [advertiser, relationships]);

  const deal = useMemo(
    () => priceDeal(lines, creators, { agencyCut, passThroughs, treatments }),
    [lines, creators, agencyCut, passThroughs, treatments]
  );

  const requests = useMemo(
    () =>
      buildRequests(deal, {
        advertiser: advertiser.trim() || "an advertiser",
        flightMonth: flightMonth || null,
      }),
    [deal, advertiser, flightMonth]
  );

  const withEmail = requests.filter((r) => byId.get(r.creatorId)?.teamEmail);
  const missing = requests.filter((r) => !byId.get(r.creatorId)?.teamEmail);
  const ready = advertiser.trim().length > 0;

  function mailto(r: ApprovalRequest) {
    const { subject, body } = approvalEmail(r);
    const to = byId.get(r.creatorId)?.teamEmail ?? "";
    return `mailto:${to}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  async function record() {
    setRecorded("saving");
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: requests.map((r) => ({
            creatorId: r.creatorId,
            creatorName: r.creatorName,
            advertiser: r.advertiser,
            deliverables: r.deliverables,
            flightMonth: r.flightMonth,
            placementFee: r.placementFee,
            commission: r.commission,
            creatorShare: r.creatorShare,
            sentAt: r.sentAt,
            responseDue: r.responseDue,
            status: "Awaiting response",
            respondedAt: null,
          })),
        }),
      });
      setRecorded(res.ok ? "done" : "error");
    } catch {
      setRecorded("error");
    }
  }

  if (lines.length === 0) {
    return <p className="cm-fine text-ink/50">No priceable channels in this bundle.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Advertiser</span>
          <input
            value={advertiser}
            onChange={(e) => setAdvertiser(e.target.value)}
            placeholder="e.g. Patagonia"
            className="cm-sans w-48 border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Flight month</span>
          <input
            type="month"
            value={flightMonth}
            onChange={(e) => setFlightMonth(e.target.value)}
            className="cm-sans w-40 border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Agency cut</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={90}
              value={Math.round(agencyCut * 100)}
              onChange={(e) =>
                setAgencyCut(Math.min(90, Math.max(0, Number(e.target.value) || 0)) / 100)
              }
              className="cm-sans w-16 border border-hairline bg-bg px-2 py-2 text-right text-sm outline-none focus:border-ink"
            />
            <span className="cm-fine text-ink/45">%</span>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="cm-fine text-ink/45">Pass-throughs</span>
          <input
            type="number"
            min={0}
            value={passThroughs}
            onChange={(e) => setPassThroughs(Math.max(0, Number(e.target.value) || 0))}
            className="cm-sans w-32 border border-hairline bg-bg px-3 py-2 text-right text-sm outline-none focus:border-ink"
          />
        </label>
      </div>

      {!ready && (
        <p className="cm-fine text-ink/45">
          Name the advertiser to generate the requests — §3.3 submissions have to
          say who the deal is with.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Eyebrow>What each creator is asked to approve</Eyebrow>
        <div className="flex flex-col divide-y divide-hairline border border-hairline">
          {requests.map((r) => {
            const email = byId.get(r.creatorId)?.teamEmail;
            return (
              <div key={r.creatorId} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="cm-sans text-sm font-semibold">{r.creatorName}</p>
                    <p className="cm-fine whitespace-pre-line text-ink/55">
                      {r.deliverables}
                    </p>
                  </div>
                  {email && ready ? (
                    <a
                      href={mailto(r)}
                      className="cm-label whitespace-nowrap border border-ink px-3 py-1.5 transition-colors hover:bg-ink hover:text-ink-inverse"
                    >
                      Request approval
                    </a>
                  ) : (
                    <span className="cm-fine whitespace-nowrap text-warning">
                      {email ? "Name the advertiser" : "No team email on file"}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  <Fig label="Placement fee" v={usd(r.placementFee)} />
                  <Fig label={`CM ${Math.round(r.rate * 100)}%`} v={usd(r.commission)} />
                  <Fig label="Creator" v={usd(r.creatorShare)} />
                  <Fig label="Reply by" v={r.responseDue} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="cm-fine text-ink/40">
          Each email carries the deliverables, flight month, the fee after any
          agency cut and pass-throughs, the split, and a {DEFAULT_RESPONSE_DAYS}
          -business-day deadline — everything §3.3 requires — and states that
          silence is not approval.
        </p>
      </div>

      {missing.length > 0 && (
        <p className="cm-fine text-warning">
          {missing.length} of {requests.length} creator
          {requests.length === 1 ? "" : "s"} cannot be contacted. Add a Team Email
          in Airtable for {missing.map((r) => r.creatorName).join(", ")}.
        </p>
      )}

      {ready && (
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            onClick={record}
            disabled={recorded === "saving" || withEmail.length === 0}
            className="cm-label border border-ink px-4 py-2 transition-colors hover:bg-ink hover:text-ink-inverse disabled:opacity-40"
          >
            {recorded === "done"
              ? "Recorded ✓"
              : recorded === "saving"
              ? "Recording…"
              : recorded === "error"
              ? "Failed — retry"
              : "Record as sent"}
          </button>
          <span className="cm-fine text-ink/45">
            Logs the request and its deadline, so an unanswered proposal can be
            treated as declined rather than forgotten.
          </span>
        </div>
      )}
    </div>
  );
}

function Fig({ label, v }: { label: string; v: string }) {
  return (
    <span className="cm-fine tabular-nums text-ink/60">
      {label} <strong className="ml-1 font-semibold text-ink">{v}</strong>
    </span>
  );
}
