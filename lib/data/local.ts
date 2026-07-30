/**
 * Local seed-data adapter.
 *
 * Reads the normalized JSON in /data (generated from CM_Seed_Data_Review.xlsx)
 * so the app runs with zero credentials. The seed files are treated as
 * read-only; runtime writes (applications, approvals, saved bundles) are stored
 * in a gitignored overlay at data/runtime.json and merged on read. That keeps
 * the seed pristine while making the application/vetting flow durable across
 * requests and restarts. When Airtable creds are present, lib/data/index.ts
 * uses the Airtable adapter instead.
 */
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type {
  Channel,
  Creator,
  BrandBoundary,
  OverlapAssumption,
  SavedBundle,
  CreatorApplication,
  CreatorStatus,
} from "@/lib/types";
import type { DataAdapter } from "./adapter";

type RawCreator = Omit<Creator, "channels" | "brandBoundary">;

const DATA_DIR = path.join(process.cwd(), "data");
const RUNTIME_FILE = path.join(DATA_DIR, "runtime.json");

interface Runtime {
  creators: RawCreator[];
  channels: Channel[];
  boundaries: BrandBoundary[];
  statusOverrides: Record<string, { status: CreatorStatus; dateApproved: string | null }>;
  bundles: SavedBundle[];
}

function readSeed<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
}

function readRuntime(): Runtime {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME_FILE, "utf-8")) as Runtime;
  } catch {
    return {
      creators: [],
      channels: [],
      boundaries: [],
      statusOverrides: {},
      bundles: [],
    };
  }
}

function writeRuntime(rt: Runtime): void {
  fs.writeFileSync(RUNTIME_FILE, JSON.stringify(rt, null, 2));
}

/** Seed + runtime overlay, merged. Read fresh each call so seed edits show up. */
function load(): {
  creators: RawCreator[];
  channels: Channel[];
  boundaries: BrandBoundary[];
  overlaps: OverlapAssumption[];
  runtime: Runtime;
} {
  const rt = readRuntime();
  const seedCreators = readSeed<RawCreator[]>("creators.json");
  const creators = [...rt.creators, ...seedCreators].map((c) => {
    const o = rt.statusOverrides[c.id];
    return o ? { ...c, status: o.status, dateApproved: o.dateApproved } : c;
  });
  return {
    creators,
    channels: [...readSeed<Channel[]>("channels.json"), ...rt.channels],
    boundaries: [...readSeed<BrandBoundary[]>("brandBoundaries.json"), ...rt.boundaries],
    overlaps: readSeed<OverlapAssumption[]>("overlapAssumptions.json"),
    runtime: rt,
  };
}

function assemble(
  c: RawCreator,
  channels: Channel[],
  boundaries: BrandBoundary[]
): Creator {
  return {
    ...c,
    channels: channels.filter((ch) => ch.creatorId === c.id),
    brandBoundary: boundaries.find((b) => b.creatorId === c.id) ?? null,
  };
}

function nextId(prefix: string, existing: string[]): string {
  const nums = existing
    .map((id) => Number(String(id).replace(/^\D+/, "").split("-")[0]))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

function splitList(v: string): string[] {
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const localAdapter: DataAdapter = {
  source: "local",

  async getCreators() {
    const { creators, channels, boundaries } = load();
    return creators.map((c) => assemble(c, channels, boundaries));
  },

  async getCreatorById(id: string) {
    const { creators, channels, boundaries } = load();
    const c = creators.find((x) => x.id === id);
    return c ? assemble(c, channels, boundaries) : null;
  },

  async getOverlapAssumptions() {
    return load().overlaps;
  },

  async getSavedBundles() {
    return load().runtime.bundles;
  },

  async saveBundle(bundle: SavedBundle) {
    const rt = readRuntime();
    const id = nextId("BND", rt.bundles.map((b) => b.id ?? ""));
    const stored = { ...bundle, id };
    rt.bundles.unshift(stored);
    writeRuntime(rt);
    return stored;
  },

  async updateCreatorStatus(id, status, dateApproved) {
    const rt = readRuntime();
    rt.statusOverrides[id] = { status, dateApproved: dateApproved ?? null };
    writeRuntime(rt);
    return localAdapter.getCreatorById(id);
  },

  async createCreatorApplication(app: CreatorApplication) {
    const { creators, channels, boundaries, runtime } = load();
    const creatorId = nextId("CR", creators.map((c) => c.id));

    const newCreator: RawCreator = {
      id: creatorId,
      name: app.name,
      personaType: "Applicant",
      isDemoPersona: false,
      bio: app.bio,
      positioning: null, // sales writes this by hand after approval
      priorOutlets: splitList(app.priorOutlets),
      primaryBeat: app.primaryBeat,
      homeMarketDMA: app.homeMarketDMA,
      trustSignals: [],
      politicalLean: app.politicalLean || "Nonpartisan",
      brandSafetyTier: "Standard",
      categoryAffinities: splitList(app.categoryAffinities),
      status: "Pending Review",
      applicationFeePaid: true, // stubbed payment marked paid on submit
      dateApproved: null,
      headshot: `https://api.dicebear.com/7.x/personas/png?seed=${encodeURIComponent(
        app.name
      )}&size=300`,
    };

    const newChannels: Channel[] = app.channels.map((ch, i) => ({
      id: `${nextId("CH", channels.map((c) => c.id))}-${i}`,
      channelName: `${app.name} — ${ch.platform}`,
      creatorId,
      creatorName: app.name,
      platform: ch.platform,
      handleUrl: ch.handleUrl,
      audienceSize: ch.audienceSize,
      avgEngagementRate: null,
      avgReachPerUnit: ch.avgReachPerUnit,
      formatMetricLabel: null,
      formatMetricValue: null,
      audienceAgeBands: null,
      audienceGenderSplit: null,
      topGeosDMAs: null,
      audienceIncomeIndex: null,
      audienceEducationIndex: null,
      availableAdFormats: [],
      inventorySlotsPerMonth: null,
      leadTimeDays: null,
      rateCard: null,
      talentReadOK: true,
    }));

    const newBoundary: BrandBoundary = {
      id: nextId("BB", boundaries.map((b) => b.id)),
      creatorId,
      creatorName: app.name,
      noGoCategories: splitList(app.noGoCategories),
      conditionalCategories: splitList(app.conditionalCategories),
      conditionsNotes: null,
      pastBrandPartners: null,
      activeExclusivities: null,
      categoryExclusivityAvailable: false,
    };

    runtime.creators.unshift(newCreator);
    runtime.channels.push(...newChannels);
    runtime.boundaries.push(newBoundary);
    writeRuntime(runtime);

    return { ...newCreator, channels: newChannels, brandBoundary: newBoundary };
  },
};
