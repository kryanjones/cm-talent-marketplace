import { getActiveBuyerCreators, data, dataSource } from "@/lib/data";
import { BuyerExperience } from "@/components/buyer/BuyerExperience";

// Always render against fresh data so Airtable edits show up.
export const dynamic = "force-dynamic";

export default async function BuyerPage() {
  const [creators, overlap] = await Promise.all([
    getActiveBuyerCreators(),
    data.getOverlapAssumptions(),
  ]);

  return (
    <>
      {dataSource === "local" && (
        <div className="border-b border-hairline bg-bg-alt">
          <p className="mx-auto max-w-content px-6 py-2 cm-fine text-ink/50">
            Running on the local seed dataset — add Airtable credentials to connect
            the live base.
          </p>
        </div>
      )}
      <BuyerExperience creators={creators} overlap={overlap} />
    </>
  );
}
