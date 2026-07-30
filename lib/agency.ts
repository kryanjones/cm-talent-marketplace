/**
 * Agency-model guardrails.
 *
 * Collective Media sells as the creators' agent, which only works where a
 * signed master representation agreement exists. Without one we are not
 * authorised to commit that creator's inventory, so a bundle containing them
 * cannot go to a brand.
 *
 * This is a warning surface, not a hard block: sales may legitimately price a
 * speculative bundle before the paperwork is back. What it must never do is let
 * a bundle reach an advertiser while nobody noticed a creator was uncleared.
 */
import type { AgreementStatus, Creator } from "@/lib/types";

export function isCleared(creator: Pick<Creator, "agreementStatus">): boolean {
  return creator.agreementStatus === "Signed";
}

/** Creators in this set who cannot yet be sold, with why. */
export function unclearedIn(
  creators: Pick<Creator, "id" | "name" | "agreementStatus">[]
): { id: string; name: string; status: AgreementStatus | "Not sent" }[] {
  return creators
    .filter((c) => c.agreementStatus !== "Signed")
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: (c.agreementStatus as AgreementStatus) ?? "Not sent",
    }));
}

export const AGREEMENT_TONE: Record<AgreementStatus, string> = {
  Signed: "text-success",
  Sent: "text-warning",
  "Not sent": "text-ink/45",
  Declined: "text-accent",
};

/** One line explaining what the state means for selling. */
export function agreementNote(status: AgreementStatus | null): string {
  switch (status) {
    case "Signed":
      return "Cleared to sell";
    case "Sent":
      return "Agreement out for signature — not cleared yet";
    case "Declined":
      return "Agreement declined — do not pitch";
    default:
      return "No agreement on file — not cleared to sell";
  }
}
