import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { data, getActiveCreators } from "@/lib/data";
import { buildReport } from "@/lib/campaign";
import { WrapReport } from "@/components/campaign/WrapReport";
import { isUnlocked, roleRequiresPassword } from "@/lib/auth";
import { AccessGate } from "@/components/sales/AccessGate";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const campaigns = await data.getCampaigns();
  const c = campaigns.find((x) => x.id === params.id);
  return { title: c ? `${c.name} — wrap report` : "Campaign — Collective Media" };
}

/**
 * A campaign's wrap report.
 *
 * Behind the sales gate. It carries delivery figures and creator-level
 * performance, which is commercial detail about creators — not something to put
 * on an open URL just because it is convenient to send.
 */
export default async function CampaignPage({
  params,
}: {
  params: { id: string };
}) {
  if (roleRequiresPassword("sales") && !isUnlocked("sales")) {
    return <AccessGate role="sales" />;
  }

  const [campaigns, bookings, creators] = await Promise.all([
    data.getCampaigns(),
    data.getBookings(),
    getActiveCreators(),
  ]);

  const campaign = campaigns.find((c) => c.id === params.id);
  if (!campaign) notFound();

  const report = buildReport(campaign, bookings, creators);

  return (
    <div className="mx-auto max-w-content px-6">
      <div className="cm-no-print pt-6">
        <Link
          href="/sales"
          className="cm-label text-ink/50 underline-offset-4 transition-colors hover:text-accent hover:underline"
        >
          ← Sales desk
        </Link>
      </div>
      <WrapReport report={report} />
    </div>
  );
}
