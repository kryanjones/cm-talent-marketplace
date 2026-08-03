/**
 * CRM adapter: the app running directly on Sarah's "Revenue Tracker & Sales
 * Pipeline" base (decided Jul 31 — her CRM is the single source of truth).
 *
 * SERVER ONLY, same guarantee as the airtable adapter.
 *
 * Split-brain by design:
 * - Business data (creators, rates, deals, deliverables, pitch approvals) is
 *   read from — and approval/agreement writes go to — the CRM base
 *   (AIRTABLE_CRM_BASE_ID).
 * - App plumbing (link clicks, saved bundles, overlap assumptions) stays in the
 *   marketplace base via the existing airtable adapter: click logs and bundle
 *   drafts are app state, not revenue data, and don't belong in her CRM.
 *
 * Reads degrade gracefully: fields this adapter expects but her base doesn't
 * have yet (Agreement Status, Positioning, …) simply come back null.
 */
import "server-only";
import type {
  AdvertiserRelationship,
  Approval,
  Booking,
  Campaign,
  Creator,
  CreatorApplication,
  CreatorStatus,
  OverlapAssumption,
  SavedBundle,
} from "@/lib/types";
import type { DataAdapter } from "./adapter";
import { airtableAdapter } from "./airtable";
import {
  type CrmRecord,
  deriveKeepItRelationships,
  isCmDeal,
  mapCrmCreator,
  mapDealToCampaign,
  mapDeliverableToBooking,
  mapProducts,
  mapRates,
  synthesizeChannels,
} from "./crm-map";

const API = "https://api.airtable.com/v0";

const T = {
  creators: "Creators",
  rates: "Rates",
  products: "Integration Types",
  deals: "Deals",
  deliverables: "Deliverables",
  companies: "Companies",
  creatorDeals: "Creator Deals",
};

function crmBaseUrl(table: string): string {
  const baseId = process.env.AIRTABLE_CRM_BASE_ID;
  if (!baseId) throw new Error("AIRTABLE_CRM_BASE_ID is not set");
  return `${API}/${baseId}/${encodeURIComponent(table)}`;
}

function authHeaders(): HeadersInit {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Same retry discipline as the marketplace adapter: 429/5xx/expired iterator. */
async function fetchAll(table: string, attempt = 0): Promise<CrmRecord[]> {
  const MAX_ATTEMPTS = 4;
  try {
    const out: CrmRecord[] = [];
    let offset: string | undefined;
    do {
      const url = new URL(crmBaseUrl(table));
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url.toString(), {
        headers: authHeaders(),
        next: { revalidate: 30 },
      });
      if (!res.ok) {
        const body = await res.text();
        const retryable =
          res.status === 429 ||
          res.status >= 500 ||
          body.includes("LIST_RECORDS_ITERATOR_NOT_AVAILABLE");
        const err = new Error(
          `CRM read failed (${table}): ${res.status} ${body}`
        ) as Error & { retryable?: boolean };
        err.retryable = retryable;
        throw err;
      }
      const data = (await res.json()) as {
        records: CrmRecord[];
        offset?: string;
      };
      out.push(...data.records);
      offset = data.offset;
    } while (offset);
    return out;
  } catch (err) {
    const retryable = (err as { retryable?: boolean }).retryable ?? false;
    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      await sleep(300 * (attempt + 1));
      return fetchAll(table, attempt + 1);
    }
    throw err;
  }
}

/** Tables that may not exist / not be shared read as empty, not as a crash. */
async function fetchAllOptional(table: string): Promise<CrmRecord[]> {
  try {
    return await fetchAll(table);
  } catch {
    return [];
  }
}

async function patchRecord(
  table: string,
  recordId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${crmBaseUrl(table)}/${recordId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    throw new Error(
      `CRM write failed (${table}/${recordId}): ${res.status} ${await res.text()}`
    );
  }
}

async function createRecord(
  table: string,
  fields: Record<string, unknown>,
  typecast = false
): Promise<CrmRecord> {
  const res = await fetch(crmBaseUrl(table), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ records: [{ fields }], typecast }),
  });
  if (!res.ok) {
    throw new Error(
      `CRM create failed (${table}): ${res.status} ${await res.text()}`
    );
  }
  const data = (await res.json()) as { records: CrmRecord[] };
  return data.records[0];
}

// ---------- assembled reads ----------

async function loadCreators(): Promise<Creator[]> {
  const [creatorRecs, rateRecs, productRecs] = await Promise.all([
    fetchAll(T.creators),
    fetchAllOptional(T.rates),
    fetchAllOptional(T.products),
  ]);
  const products = mapProducts(productRecs);
  const rates = mapRates(rateRecs, products);
  const byCreator = new Map<string, ReturnType<typeof mapRates>>();
  for (const r of rates) {
    const list = byCreator.get(r.creatorRecId) ?? [];
    list.push(r);
    byCreator.set(r.creatorRecId, list);
  }
  return creatorRecs
    .map((rec) => mapCrmCreator(rec, byCreator.get(rec.id) ?? []))
    .filter((c): c is Creator => c != null);
}

async function loadCompanies(): Promise<Map<string, string>> {
  const recs = await fetchAllOptional(T.companies);
  const out = new Map<string, string>();
  for (const r of recs) {
    const name = r.fields["Company Name"];
    if (typeof name === "string" && name.trim()) out.set(r.id, name.trim());
  }
  return out;
}

function statusToCrm(status: CreatorStatus): string {
  // Her CM Client Status vocabulary. Approving an application makes the person
  // Active in the CRM but does NOT list them for sale — visibility is gated on
  // CM Ad Sales, which only Sarah flips once rates and an agreement exist.
  switch (status) {
    case "Active":
      return "Active";
    case "Rejected":
      return "Inactive";
    default:
      return "Pending";
  }
}

export const crmAdapter: DataAdapter = {
  source: "crm",

  getCreators: loadCreators,

  async getCreatorById(id: string): Promise<Creator | null> {
    const all = await loadCreators();
    return all.find((c) => c.id === id) ?? null;
  },

  // ----- plumbing stays in the marketplace base -----
  getOverlapAssumptions(): Promise<OverlapAssumption[]> {
    return airtableAdapter.getOverlapAssumptions();
  },
  resolveLinkCode(code: string): Promise<string | null> {
    return airtableAdapter.resolveLinkCode(code);
  },
  recordLinkClick(code: string, referrerHost: string | null): Promise<void> {
    return airtableAdapter.recordLinkClick(code, referrerHost);
  },
  getLinkClickCounts(): Promise<Record<string, number>> {
    return airtableAdapter.getLinkClickCounts();
  },
  getSavedBundles(): Promise<SavedBundle[]> {
    return airtableAdapter.getSavedBundles();
  },
  saveBundle(bundle: SavedBundle): Promise<SavedBundle> {
    return airtableAdapter.saveBundle(bundle);
  },

  // ----- CRM-backed reads -----

  async getBookings(): Promise<Booking[]> {
    const [deliverables, productRecs, creatorRecs, rateRecs, deals, companies] =
      await Promise.all([
        fetchAllOptional(T.deliverables),
        fetchAllOptional(T.products),
        fetchAll(T.creators),
        fetchAllOptional(T.rates),
        fetchAllOptional(T.deals),
        loadCompanies(),
      ]);
    const products = mapProducts(productRecs);
    const rates = mapRates(rateRecs, products);
    const byCreator = new Map<string, typeof rates>();
    for (const r of rates) {
      const list = byCreator.get(r.creatorRecId) ?? [];
      list.push(r);
      byCreator.set(r.creatorRecId, list);
    }
    // Channels for every creator (not just sellable) so historical placements
    // by now-inactive creators still resolve.
    const channelsByCreatorRec = new Map(
      creatorRecs.map((rec) => [
        rec.id,
        synthesizeChannels(rec, byCreator.get(rec.id) ?? []),
      ])
    );
    const brandByDealId = new Map<string, string>();
    for (const deal of deals) {
      const companyId = (deal.fields["Company Name"] as string[] | undefined)?.[0];
      const brand = companyId ? companies.get(companyId) : null;
      if (brand) brandByDealId.set(deal.id, brand);
    }
    return deliverables.map((rec) =>
      mapDeliverableToBooking(rec, products, channelsByCreatorRec, brandByDealId)
    );
  },

  async getCampaigns(): Promise<Campaign[]> {
    const [deals, companies] = await Promise.all([
      fetchAllOptional(T.deals),
      loadCompanies(),
    ]);
    return deals.filter(isCmDeal).map((d) => mapDealToCampaign(d, companies));
  },

  async getAdvertiserRelationships(): Promise<AdvertiserRelationship[]> {
    const [deals, companies] = await Promise.all([
      fetchAllOptional(T.deals),
      loadCompanies(),
    ]);
    return deriveKeepItRelationships(deals, companies);
  },

  /**
   * Pitch approvals live in her Creator Deals table — the "can we pitch you to
   * this brand at all?" step, which is exactly what the app's approval flow
   * asks. Reads map her rows; writes create rows with everything in the notes
   * fields rather than setting her Pitch Approval Status select, so we never
   * invent options in an operational field.
   */
  async getApprovals(): Promise<Approval[]> {
    const [rows, creators, companies] = await Promise.all([
      fetchAllOptional(T.creatorDeals),
      loadCreators(),
      loadCompanies(),
    ]);
    const creatorById = new Map(creators.map((c) => [c.id, c]));
    return rows.map((r) => {
      const creatorId = (r.fields["Creator"] as string[] | undefined)?.[0] ?? null;
      const companyId = (r.fields["Company"] as string[] | undefined)?.[0] ?? null;
      const status =
        typeof r.fields["Pitch Approval Status"] === "string"
          ? (r.fields["Pitch Approval Status"] as string)
          : "Awaiting response";
      return {
        id: r.id,
        creatorId,
        creatorName: creatorId
          ? creatorById.get(creatorId)?.name ?? "Unknown creator"
          : "Unknown creator",
        advertiser: (companyId ? companies.get(companyId) : null) ?? "—",
        deliverables:
          typeof r.fields["Deal-Specific Deliverables"] === "string"
            ? (r.fields["Deal-Specific Deliverables"] as string)
            : null,
        flightMonth: null,
        // Money figures are not recorded on her pitch-approval rows; zero here
        // means "not part of this record", and the UI treats it as absent.
        placementFee: 0,
        commission: 0,
        creatorShare: 0,
        sentAt: r.createdTime ?? null,
        responseDue: null,
        status,
        respondedAt:
          typeof r.fields["Pitch Approval Date"] === "string"
            ? (r.fields["Pitch Approval Date"] as string)
            : null,
      } satisfies Approval;
    });
  },

  async recordApprovals(
    requests: Omit<Approval, "id">[]
  ): Promise<{ created: number }> {
    const companies = await loadCompanies();
    const companyIdByName = new Map(
      [...companies.entries()].map(([id, name]) => [name.toLowerCase(), id])
    );
    let created = 0;
    for (const req of requests) {
      let companyId = companyIdByName.get(req.advertiser.toLowerCase());
      if (!companyId) {
        const rec = await createRecord(T.companies, {
          "Company Name": req.advertiser,
        });
        companyId = rec.id;
        companyIdByName.set(req.advertiser.toLowerCase(), companyId);
      }
      const noteLines = [
        `Marketplace pitch-approval request (MSA §3.3).`,
        `Placement fee $${req.placementFee.toLocaleString()} · commission $${req.commission.toLocaleString()} · to creator $${req.creatorShare.toLocaleString()}.`,
        req.flightMonth ? `Flight: ${req.flightMonth}.` : null,
        req.responseDue ? `Reply requested by ${req.responseDue}.` : null,
      ].filter(Boolean);
      await createRecord(T.creatorDeals, {
        ...(req.creatorId ? { Creator: [req.creatorId] } : {}),
        Company: [companyId],
        "Deal-Specific Deliverables": req.deliverables ?? "",
        "Approval Notes": noteLines.join("\n"),
      });
      created++;
    }
    return { created };
  },

  // ----- CRM-backed writes -----

  async updateAgreementByEnvelope(
    envelopeId: string,
    status: string,
    signedDate: string | null
  ): Promise<Creator | null> {
    // Fresh read (no cache): the webhook must see an envelope recorded seconds ago.
    const res = await fetch(
      `${crmBaseUrl(T.creators)}?pageSize=100&filterByFormula=${encodeURIComponent(
        `{Agreement Envelope ID} = "${envelopeId.replace(/"/g, '\\"')}"`
      )}`,
      { headers: authHeaders(), cache: "no-store" }
    );
    if (!res.ok) return null; // field may not exist yet — degrade, don't crash
    const data = (await res.json()) as { records: CrmRecord[] };
    const rec = data.records[0];
    if (!rec) return null;
    await patchRecord(T.creators, rec.id, {
      "Agreement Status": status,
      ...(signedDate ? { "Agreement Signed Date": signedDate } : {}),
    });
    return this.getCreatorById(rec.id);
  },

  async updateCreatorStatus(
    id: string,
    status: CreatorStatus
  ): Promise<Creator | null> {
    await patchRecord(T.creators, id, {
      "CM Client Status": statusToCrm(status),
    });
    return this.getCreatorById(id);
  },

  async createCreatorApplication(app: CreatorApplication): Promise<Creator> {
    const fields: Record<string, unknown> = {
      "Creator Talent": app.name,
      "Bio/Background": app.bio,
      "CM Client Status": "Pending",
      "CM Ad Sales": "Potential CM creator",
      "Onboarding Notes": [
        `Marketplace application.`,
        `Beat: ${app.primaryBeat}. Market: ${app.homeMarketDMA}.`,
        `Prior outlets: ${app.priorOutlets}.`,
        `Categories: ${app.categoryAffinities}. Lean: ${app.politicalLean}.`,
        `No-go: ${app.noGoCategories || "—"}. Conditional: ${app.conditionalCategories || "—"}.`,
        ...app.channels.map(
          (ch) =>
            `${ch.platform}: ${ch.handleUrl} — audience ${ch.audienceSize}, reach/unit ${ch.avgReachPerUnit}`
        ),
      ].join("\n"),
    };
    // Map channel URLs and sizes onto her per-platform columns where they exist.
    for (const ch of app.channels) {
      if (/youtube/i.test(ch.platform)) {
        fields["YouTube Channel"] = ch.handleUrl;
        fields["YouTube Subscribers"] = ch.audienceSize;
      } else if (/newsletter|substack/i.test(ch.platform)) {
        fields["Newsletter Link"] = ch.handleUrl;
        fields["Newsletter Subscribers"] = ch.audienceSize;
      } else if (/podcast/i.test(ch.platform)) {
        fields["Podcast link"] = ch.handleUrl;
        fields["Podcast Downloads Per Episode"] = ch.avgReachPerUnit;
      }
    }
    const rec = await createRecord(T.creators, fields);
    // Applicants aren't sellable, so mapCrmCreator would return null — build a
    // minimal echo for the confirmation screen instead.
    return {
      id: rec.id,
      name: app.name,
      personaType: null,
      isDemoPersona: false,
      bio: app.bio,
      positioning: null,
      featuredPartnerships: null,
      teamEmail: null,
      agreementStatus: "Not sent",
      agreementSignedDate: null,
      agreementEnvelopeId: null,
      priceFloor: null,
      priorOutlets: app.priorOutlets
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      primaryBeat: app.primaryBeat,
      homeMarketDMA: app.homeMarketDMA,
      trustSignals: [],
      politicalLean: app.politicalLean,
      brandSafetyTier: null,
      categoryAffinities: app.categoryAffinities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      status: "Pending Review",
      applicationFeePaid: false,
      dateApproved: null,
      headshot: null,
      channels: [],
      brandBoundary: null,
    };
  },
};
