import { redirect } from "next/navigation";
import { getActiveBuyerCreators } from "@/lib/data";
import { BriefLanding } from "@/components/landing/BriefLanding";
import { deriveTopics } from "@/components/buyer/brief-options";

export const dynamic = "force-dynamic";

/**
 * The front door is the brief (Sarah's redesign): a visitor either briefs us
 * or steps through to the gallery at /discover.
 *
 * Shared-bundle links predate the split and point at "/?b=…" — those visitors
 * are opening someone's bundle, not starting a brief, so they pass straight
 * through to the gallery with the parameter intact.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const shared = searchParams.b;
  if (typeof shared === "string" && shared) {
    redirect(`/discover?b=${encodeURIComponent(shared)}`);
  }

  const creators = await getActiveBuyerCreators();
  return (
    <BriefLanding topics={deriveTopics(creators)} creatorCount={creators.length} />
  );
}
