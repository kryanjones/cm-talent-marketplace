/**
 * Creator approval requests — MSA §3.3.
 *
 * "Collective Media shall submit each proposed Advertiser Agreement to Creator
 * for written approval, together with the proposed Placement Fee, any
 * Pass-Through Costs, the deliverables and flight dates, and the resulting
 * allocation between the Parties. Creator shall respond within two (2) business
 * days... If Creator does not respond within the applicable response period, the
 * proposed Advertiser Agreement shall be deemed rejected. Silence shall never
 * constitute approval."
 *
 * Every one of those elements is required, so the request is assembled from the
 * priced deal rather than written by hand — a request missing the allocation is
 * not a §3.3 submission, however polite the email.
 */
import type { CreatorSplit, DealResult } from "@/lib/deal";
import { usd } from "@/lib/format";

export type ApprovalStatus =
  | "Awaiting response"
  | "Approved"
  | "Rejected"
  | "Deemed rejected";

export interface ApprovalRequest {
  creatorId: string;
  creatorName: string;
  advertiser: string;
  deliverables: string;
  flightMonth: string | null;
  grossPlacements: number;
  agencyDeduction: number;
  passThroughs: number;
  placementFee: number;
  commission: number;
  creatorShare: number;
  rate: number;
  sentAt: string;
  responseDue: string;
}

/**
 * Add N business days. The contract counts in business days, so a Friday
 * submission is due Tuesday, not Sunday — calendar arithmetic would quietly
 * shorten the window the creator is entitled to.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_RESPONSE_DAYS = 2;

/** Build the per-creator requests for a priced deal. */
export function buildRequests(
  deal: DealResult,
  opts: {
    advertiser: string;
    flightMonth: string | null;
    responseDays?: number;
    now?: Date;
  }
): ApprovalRequest[] {
  const now = opts.now ?? new Date();
  const sentAt = iso(now);
  const responseDue = iso(
    addBusinessDays(now, opts.responseDays ?? DEFAULT_RESPONSE_DAYS)
  );

  return deal.splits.map((split: CreatorSplit) => {
    const lines = deal.lines.filter((l) => l.creatorId === split.creatorId);
    const deliverables = lines
      .map((l) => `${l.platform} — ${l.format} × ${l.units}`)
      .join("\n");
    // Each creator's share of the deductions follows their share of the gross,
    // which is how the deal was priced.
    const share = deal.grossPlacements > 0 ? split.gross / deal.grossPlacements : 0;
    return {
      creatorId: split.creatorId,
      creatorName: split.creatorName,
      advertiser: opts.advertiser,
      deliverables,
      flightMonth: opts.flightMonth,
      grossPlacements: split.gross,
      agencyDeduction: deal.agencyDeduction * share,
      passThroughs: deal.passThroughs * share,
      placementFee: split.placementFee,
      commission: split.commission,
      creatorShare: split.creatorShare,
      rate: split.rate,
      sentAt,
      responseDue,
    };
  });
}

/**
 * The approval email. Carries every element §3.3 requires, and states the
 * consequence of not replying — because the creator is bound by that
 * consequence and should not learn it from the contract after the fact.
 */
export function approvalEmail(r: ApprovalRequest): { subject: string; body: string } {
  const money = (n: number) => usd(n);
  const flight = r.flightMonth ? `\nFlight: ${r.flightMonth}` : "";
  // No column padding: mail clients render plain text in a proportional font,
  // so spaces line nothing up. Label-per-line reads correctly everywhere.
  const agencyLine = r.agencyDeduction
    ? `\nLess media agency commission: ${money(r.agencyDeduction)}`
    : "";
  const passLine = r.passThroughs
    ? `\nLess pass-through costs: ${money(r.passThroughs)}`
    : "";

  const body =
    `Hi,\n\n` +
    `We have a proposed placement for ${r.creatorName} with ${r.advertiser}, ` +
    `and we need your written approval before we take it any further.\n\n` +
    `DELIVERABLES\n${r.deliverables}${flight}\n\n` +
    `THE NUMBERS\n` +
    `Gross placement value: ${money(r.grossPlacements)}` +
    agencyLine +
    passLine +
    `\nPlacement fee: ${money(r.placementFee)}\n\n` +
    `THE SPLIT\n` +
    `Collective Media (${Math.round(r.rate * 100)}%): ${money(r.commission)}\n` +
    `You: ${money(r.creatorShare)}\n\n` +
    `Pass-through costs are advertiser-funded campaign costs and sit outside ` +
    `the split entirely — no commission is taken on them.\n\n` +
    `PLEASE REPLY BY ${r.responseDue}\n` +
    `That is two business days. Reply with a yes, a no, or any conditions you ` +
    `want attached. If we do not hear from you by then the proposal is treated ` +
    `as declined — we never take silence as approval.\n\n` +
    `Thank you,\nCollective Media`;

  return {
    subject: `Approval needed by ${r.responseDue} — ${r.creatorName} × ${r.advertiser}`,
    body,
  };
}

/** A request past its due date with no response is deemed rejected (§3.3). */
export function effectiveStatus(
  status: ApprovalStatus,
  responseDue: string | null,
  today = new Date()
): ApprovalStatus {
  if (status !== "Awaiting response") return status;
  if (!responseDue) return status;
  return responseDue < iso(today) ? "Deemed rejected" : status;
}
