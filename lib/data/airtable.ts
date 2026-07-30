/**
 * Airtable adapter.
 *
 * SERVER ONLY. The "server-only" import makes the build fail if this module is
 * ever pulled into a client bundle, guaranteeing AIRTABLE_API_KEY never ships
 * to the browser.
 *
 * The live base uses linked-record fields (no denormalized lookup fields), so
 * we fetch each table and join in memory by Airtable record id — see assemble().
 */
import "server-only";
import type {
  Channel,
  Creator,
  BrandBoundary,
  OverlapAssumption,
  SavedBundle,
  CreatorApplication,
  CreatorStatus,
  Booking,
  RateCard,
  AgeBands,
  GenderSplit,
} from "@/lib/types";
import type { DataAdapter } from "./adapter";

const API = "https://api.airtable.com/v0";

const TABLES = {
  creators: process.env.AIRTABLE_TABLE_CREATORS || "Creators",
  channels: process.env.AIRTABLE_TABLE_CHANNELS || "Channels",
  boundaries: process.env.AIRTABLE_TABLE_BOUNDARIES || "Brand Boundaries",
  overlap: process.env.AIRTABLE_TABLE_OVERLAP || "Overlap Assumptions",
  bundles: process.env.AIRTABLE_TABLE_BUNDLES || "Saved Bundles",
  bookings: process.env.AIRTABLE_TABLE_BOOKINGS || "Bookings",
};

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime?: string;
}

function baseUrl(table: string): string {
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!baseId) throw new Error("AIRTABLE_BASE_ID is not set");
  return `${API}/${baseId}/${encodeURIComponent(table)}`;
}

function authHeaders(): HeadersInit {
  const key = process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error("AIRTABLE_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch every record from a table, following pagination.
 *
 * Airtable's paginated offset can expire mid-iteration
 * (LIST_RECORDS_ITERATOR_NOT_AVAILABLE), and the API rate-limits at ~5 req/s
 * (429). Both are transient, so we retry the whole table fetch from the start
 * with backoff instead of surfacing an intermittent blank page.
 */
async function fetchAll(table: string, attempt = 0): Promise<AirtableRecord[]> {
  const MAX_ATTEMPTS = 4;
  try {
    const out: AirtableRecord[] = [];
    let offset: string | undefined;
    do {
      const url = new URL(baseUrl(table));
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const res = await fetch(url.toString(), {
        headers: authHeaders(),
        // Server-side cache; records refresh on a short interval.
        next: { revalidate: 30 },
      });
      if (!res.ok) {
        const body = await res.text();
        const retryable =
          res.status === 429 ||
          res.status >= 500 ||
          body.includes("LIST_RECORDS_ITERATOR_NOT_AVAILABLE");
        const err = new Error(
          `Airtable read failed (${table}): ${res.status} ${body}`
        ) as Error & { retryable?: boolean };
        err.retryable = retryable;
        throw err;
      }
      const data = (await res.json()) as {
        records: AirtableRecord[];
        offset?: string;
      };
      out.push(...data.records);
      offset = data.offset;
    } while (offset);
    return out;
  } catch (err) {
    const retryable = (err as { retryable?: boolean }).retryable ?? false;
    if (retryable && attempt < MAX_ATTEMPTS - 1) {
      await sleep(300 * (attempt + 1)); // linear backoff
      return fetchAll(table, attempt + 1);
    }
    throw err;
  }
}

// ---------- field coercion helpers ----------

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
function bool(v: unknown): boolean {
  return v === true || v === "true";
}
function arr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string" && v.trim())
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}
function firstAttachmentUrl(v: unknown): string | null {
  if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0]) {
    const a = v[0] as { url?: string };
    return a.url ?? null;
  }
  return str(v);
}
function parseJson<T>(v: unknown): T | string | null {
  if (v == null || v === "") return null;
  if (typeof v === "object") return v as T;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return String(v);
  }
}
function linkedId(v: unknown): string | null {
  if (Array.isArray(v) && v.length) return String(v[0]);
  return null;
}

// ---------- record mappers ----------

function mapChannel(
  r: AirtableRecord,
  creatorIdByRecord: Map<string, string>,
  creatorNameByRecord: Map<string, string>,
  creatorIdByName: Map<string, string>
): Channel {
  const f = r.fields;
  // The live base's Channels.Creator is a plain text creator NAME (e.g.
  // "Lila Cho"), not a linked record. We support both: an array (linked
  // record → join by record id) or a string (→ join by creator name).
  const rawCreator = f["Creator"];
  let creatorId: string | null;
  let creatorName: string;
  if (Array.isArray(rawCreator)) {
    const rec = linkedId(rawCreator);
    creatorId = rec ? creatorIdByRecord.get(rec) ?? rec : null;
    creatorName = rec ? creatorNameByRecord.get(rec) ?? "" : "";
  } else {
    creatorName = str(rawCreator) ?? "";
    creatorId = creatorIdByName.get(creatorName) ?? null;
  }
  const platform = str(f["Platform"]) ?? "";
  // Channel Name is a linked-record field in the live base (returns record
  // ids), so fall back to a constructed "Creator — Platform" display name.
  const rawChannelName = f["Channel Name"];
  const channelName =
    typeof rawChannelName === "string" && rawChannelName
      ? rawChannelName
      : `${creatorName}${creatorName && platform ? " — " : ""}${platform}`;
  return {
    id: r.id,
    channelName,
    creatorId,
    creatorName,
    platform,
    handleUrl: str(f["Handle / URL"]),
    audienceSize: numOrNull(f["Audience Size"]),
    avgEngagementRate: numOrNull(f["Avg Engagement Rate"]),
    avgReachPerUnit: numOrNull(f["Avg Reach Per Unit"]),
    formatMetricLabel: str(f["Format Metric Label"]),
    formatMetricValue: str(f["Format Metric Value"]),
    audienceAgeBands: parseJson<AgeBands>(f["Audience Age Bands"]),
    audienceGenderSplit: parseJson<GenderSplit>(f["Audience Gender Split"]),
    topGeosDMAs: str(f["Top Geos / DMAs"]),
    audienceIncomeIndex: str(f["Audience Income Index"]),
    audienceEducationIndex: str(f["Audience Education Index"]),
    availableAdFormats: arr(f["Available Ad Formats"]),
    inventorySlotsPerMonth: numOrNull(f["Inventory Slots Per Month"]),
    leadTimeDays: numOrNull(f["Lead Time (days)"]),
    rateCard: parseJson<RateCard>(f["Rate Card"]),
    talentReadOK: bool(f["Talent Read OK"]),
  };
}

function mapBoundary(
  r: AirtableRecord,
  creatorIdByRecord: Map<string, string>,
  creatorNameByRecord: Map<string, string>
): BrandBoundary {
  const f = r.fields;
  const creatorRec = linkedId(f["Creator"]);
  return {
    id: r.id,
    creatorId: creatorRec ? creatorIdByRecord.get(creatorRec) ?? creatorRec : null,
    creatorName: creatorRec ? creatorNameByRecord.get(creatorRec) ?? "" : "",
    noGoCategories: arr(f["No-Go Categories"]),
    conditionalCategories: arr(f["Conditional Categories"]),
    conditionsNotes: str(f["Conditions Notes"]),
    pastBrandPartners: str(f["Past Brand Partners"]),
    activeExclusivities: str(f["Active Exclusivities"]),
    categoryExclusivityAvailable: bool(f["Category Exclusivity Available"]),
  };
}

type RawCreator = Omit<Creator, "channels" | "brandBoundary"> & {
  recordId: string;
};

function mapCreator(r: AirtableRecord): RawCreator {
  const f = r.fields;
  return {
    recordId: r.id,
    // Prefer a human "Creator ID" field if present, else fall back to record id.
    id: str(f["Creator ID"]) ?? r.id,
    name: str(f["Name"]) ?? "",
    personaType: str(f["Persona Type"]),
    isDemoPersona: bool(f["Is Demo Persona"]),
    bio: str(f["Bio"]),
    // Optional fields — absent from the base today, read if they are ever added.
    positioning: str(f["Positioning"]),
    featuredPartnerships: str(f["Featured Partnerships"]),
    priorOutlets: arr(f["Prior Outlets"]),
    primaryBeat: str(f["Primary Beat"]),
    homeMarketDMA: str(f["Home Market / DMA"]),
    trustSignals: arr(f["Trust Signals"]),
    politicalLean: str(f["Political Lean"]),
    brandSafetyTier: str(f["Brand Safety Tier"]),
    categoryAffinities: arr(f["Category Affinities"]),
    status: (str(f["Status"]) as CreatorStatus) ?? "Active",
    applicationFeePaid: bool(f["Application Fee Paid"]),
    dateApproved: str(f["Date Approved"]),
    headshot: firstAttachmentUrl(f["Headshot"]),
  };
}

// ---------- assembly with caching ----------

let cache: { at: number; creators: Creator[] } | null = null;
const TTL_MS = 30_000;

async function loadAll(): Promise<Creator[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.creators;

  const [creatorRecs, channelRecs, boundaryRecs] = await Promise.all([
    fetchAll(TABLES.creators),
    fetchAll(TABLES.channels),
    fetchAll(TABLES.boundaries),
  ]);

  // The live Creators table mixes real creators with auto-created "channel
  // proxy" rows (Name = "Person — Platform") that only carry Name + Channels.
  // Real creators (and applicants) always have a Creator ID or a Status; the
  // proxy rows have neither. Keep only the real ones.
  const realRecs = creatorRecs.filter(
    (r) =>
      r.fields["Creator ID"] !== undefined || r.fields["Status"] !== undefined
  );

  const raw = realRecs.map(mapCreator);
  const idByRecord = new Map(raw.map((c) => [c.recordId, c.id]));
  const nameByRecord = new Map(raw.map((c) => [c.recordId, c.name]));
  const idByName = new Map(raw.map((c) => [c.name, c.id]));

  const channels = channelRecs.map((r) =>
    mapChannel(r, idByRecord, nameByRecord, idByName)
  );
  const boundaries = boundaryRecs.map((r) => mapBoundary(r, idByRecord, nameByRecord));

  const channelsByCreator = new Map<string, Channel[]>();
  for (const ch of channels) {
    if (!ch.creatorId) continue;
    const list = channelsByCreator.get(ch.creatorId) ?? [];
    list.push(ch);
    channelsByCreator.set(ch.creatorId, list);
  }
  const boundaryByCreator = new Map<string, BrandBoundary>();
  for (const b of boundaries) {
    if (b.creatorId) boundaryByCreator.set(b.creatorId, b);
  }

  const creators: Creator[] = raw.map(({ recordId, ...c }) => ({
    ...c,
    channels: channelsByCreator.get(c.id) ?? [],
    brandBoundary: boundaryByCreator.get(c.id) ?? null,
  }));

  cache = { at: Date.now(), creators };
  return creators;
}

function invalidate() {
  cache = null;
}

async function createRecord(table: string, fields: Record<string, unknown>) {
  const res = await fetch(baseUrl(table), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable create failed (${table}): ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as AirtableRecord;
}

async function patchRecord(table: string, id: string, fields: Record<string, unknown>) {
  const res = await fetch(`${baseUrl(table)}/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    throw new Error(`Airtable update failed (${table}): ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as AirtableRecord;
}

export const airtableAdapter: DataAdapter = {
  source: "airtable",

  async getCreators() {
    return loadAll();
  },

  async getCreatorById(id: string) {
    const all = await loadAll();
    return all.find((c) => c.id === id) ?? null;
  },

  async getOverlapAssumptions() {
    try {
      const recs = await fetchAll(TABLES.overlap);
      return recs.map<OverlapAssumption>((r) => ({
        scenario: str(r.fields["Scenario"]) ?? "",
        overlapCoefficient: numOrNull(r.fields["Overlap Coefficient"]) ?? 0,
      }));
    } catch (err) {
      // Reach math has sane defaults; don't take the page down over this table.
      console.error("overlap assumptions read failed, using defaults", err);
      return [];
    }
  },

  async getBookings() {
    try {
      const recs = await fetchAll(TABLES.bookings);
      return recs.map<Booking>((r) => {
        const f = r.fields;
        // Channel may be a linked record (array of record ids) or plain text —
        // the same duality the Channels table already shows for Creator.
        const rawChannel = f["Channel"];
        const channelId = Array.isArray(rawChannel)
          ? String(rawChannel[0])
          : str(rawChannel);
        return {
          id: r.id,
          channelId,
          brand: str(f["Brand"]),
          month: str(f["Month"]),
          slots: numOrNull(f["Slots"]) ?? 1,
          status: (str(f["Status"]) as Booking["status"]) ?? "Confirmed",
        };
      });
    } catch {
      // No Bookings table yet — treat inventory as unbooked rather than failing.
      return [];
    }
  },

  async getSavedBundles() {
    try {
      const recs = await fetchAll(TABLES.bundles);
      return recs.map<SavedBundle>((r) => ({
        id: r.id,
        bundleName: str(r.fields["Bundle Name"]) ?? "",
        createdBy: str(r.fields["Created By"]) ?? "",
        components: (parseJson(r.fields["Components"]) as SavedBundle["components"]) ?? [],
        createdAt: str(r.fields["Created At"]) ?? r.createdTime ?? "",
      }));
    } catch {
      // Saved Bundles table is optional in the schema.
      return [];
    }
  },

  async saveBundle(bundle: SavedBundle) {
    const rec = await createRecord(TABLES.bundles, {
      "Bundle Name": bundle.bundleName,
      "Created By": bundle.createdBy,
      Components: JSON.stringify(bundle.components),
      "Created At": bundle.createdAt,
    });
    return { ...bundle, id: rec.id };
  },

  async updateCreatorStatus(id, status, dateApproved) {
    // Resolve the Airtable record id from a fresh read (not the cache) so a
    // just-created applicant is always found. Match by Creator ID or record id.
    const recs = await fetchAll(TABLES.creators);
    const rec = recs.find(
      (r) => (str(r.fields["Creator ID"]) ?? r.id) === id
    );
    if (!rec) return null;
    const fields: Record<string, unknown> = { Status: status };
    if (dateApproved !== undefined) fields["Date Approved"] = dateApproved;
    await patchRecord(TABLES.creators, rec.id, fields);
    invalidate();
    // Airtable's list endpoint is briefly eventually-consistent after a write,
    // so override the just-written fields on the assembled result to guarantee
    // the response reflects this update.
    const updated = await airtableAdapter.getCreatorById(id);
    return updated
      ? { ...updated, status, dateApproved: dateApproved ?? updated.dateApproved }
      : null;
  },

  async createCreatorApplication(app: CreatorApplication) {
    const headshot = `https://api.dicebear.com/7.x/personas/png?seed=${encodeURIComponent(
      app.name
    )}&size=300`;

    const creatorRec = await createRecord(TABLES.creators, {
      Name: app.name,
      Bio: app.bio,
      "Primary Beat": app.primaryBeat,
      "Home Market / DMA": app.homeMarketDMA,
      "Prior Outlets": splitList(app.priorOutlets),
      "Category Affinities": splitList(app.categoryAffinities),
      "Political Lean": app.politicalLean || "Nonpartisan",
      Status: "Pending Review",
      "Application Fee Paid": true,
      "Is Demo Persona": false,
      "Persona Type": "Applicant",
      Headshot: [{ url: headshot }],
    });

    for (const ch of app.channels) {
      await createRecord(TABLES.channels, {
        // Deliberately NOT setting "Channel Name": it's a linked-record field
        // that would spawn a proxy row in Creators. Creator is a plain text
        // creator NAME in this base; the reader reconstructs the display name.
        Creator: app.name,
        Platform: ch.platform,
        "Handle / URL": ch.handleUrl,
        "Audience Size": ch.audienceSize,
        "Avg Reach Per Unit": ch.avgReachPerUnit,
        "Talent Read OK": true,
      });
    }

    // Brand Boundaries.Creator IS a linked record in this base.
    await createRecord(TABLES.boundaries, {
      Creator: [creatorRec.id],
      "No-Go Categories": splitList(app.noGoCategories),
      "Conditional Categories": splitList(app.conditionalCategories),
      "Category Exclusivity Available": false,
    });

    invalidate();
    const mapped = mapCreator(creatorRec);
    const { recordId, ...rest } = mapped;
    return { ...rest, channels: [], brandBoundary: null, headshot };
  },
};

function splitList(v: string): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}
