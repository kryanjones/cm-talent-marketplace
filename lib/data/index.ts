/**
 * Single data-access entry point for the whole app.
 *
 * Every route and server component imports from here — never from a specific
 * adapter. This is the seam the build prompt asks for: swapping Airtable for
 * Supabase/Postgres later means adding one adapter and changing the line below.
 */
import "server-only";
import type { Creator, BuyerCreator } from "@/lib/types";
import type { DataAdapter } from "./adapter";
import { localAdapter } from "./local";
import { airtableAdapter } from "./airtable";
import { crmAdapter } from "./crm";

function pickAdapter(): DataAdapter {
  const forced = process.env.DATA_SOURCE?.toLowerCase();
  if (forced === "local") return localAdapter;
  if (forced === "airtable") return airtableAdapter;
  // Real talent, real rates: Sarah's CRM as the source of truth. Requires
  // AIRTABLE_CRM_BASE_ID and a token with access to that base.
  if (forced === "crm") return crmAdapter;
  // Auto: use Airtable when credentials exist, otherwise the seed dataset.
  if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    return airtableAdapter;
  }
  return localAdapter;
}

export const data: DataAdapter = pickAdapter();
export const dataSource = data.source;

// ---- Convenience read helpers used by routes ----

export async function getActiveCreators(): Promise<Creator[]> {
  const all = await data.getCreators();
  return all.filter((c) => c.status === "Active");
}

export async function getPendingCreators(): Promise<Creator[]> {
  const all = await data.getCreators();
  return all.filter((c) => c.status === "Pending Review");
}

/**
 * Strip everything a buyer must not see: rate cards on channels and the
 * sales-only boundary fields (past partners, active exclusivities). This runs
 * on the server; the buyer client only ever receives the sanitized shape.
 */
export function toBuyerCreator(c: Creator): BuyerCreator {
  // Destructure the internal fields out rather than spreading everything: a
  // spread silently republishes any field added to Creator later, which is how
  // a contact address ends up readable in a public page's source.
  const {
    teamEmail,
    agreementStatus,
    agreementSignedDate,
    agreementEnvelopeId,
    priceFloor,
    ...rest
  } = c;
  return {
    ...rest,
    channels: c.channels.map(({ rateCard, ...ch }) => ch),
    brandBoundary: c.brandBoundary
      ? (() => {
          const { pastBrandPartners, activeExclusivities, ...rest } =
            c.brandBoundary!;
          return rest;
        })()
      : null,
  };
}

export async function getActiveBuyerCreators(): Promise<BuyerCreator[]> {
  return (await getActiveCreators()).map(toBuyerCreator);
}
