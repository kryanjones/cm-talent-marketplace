import {
  getActiveCreators,
  getPendingCreators,
  data,
} from "@/lib/data";
import { isUnlocked, roleRequiresPassword } from "@/lib/auth";
import { AccessGate } from "@/components/sales/AccessGate";
import { SalesView } from "@/components/sales/SalesView";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  // Lightweight gate (Section 1): open in dev if no password configured.
  if (roleRequiresPassword("sales") && !isUnlocked("sales")) {
    return <AccessGate role="sales" />;
  }

  const [active, pending, bundles, overlap, bookings, relationships, campaigns, trackedClicks] =
    await Promise.all([
      getActiveCreators(),
      getPendingCreators(),
      data.getSavedBundles(),
      data.getOverlapAssumptions(),
      data.getBookings(),
      data.getAdvertiserRelationships(),
      data.getCampaigns(),
      data.getLinkClickCounts(),
    ]);

  return (
    <SalesView
      active={active}
      pending={pending}
      bundles={bundles}
      overlap={overlap}
      bookings={bookings}
      relationships={relationships}
      campaigns={campaigns}
      trackedClicks={trackedClicks}
    />
  );
}
