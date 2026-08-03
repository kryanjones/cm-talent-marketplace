/**
 * Fixture tests for lib/data/crm-map.ts.
 *
 * Fixtures are REST-API-shaped records (field NAMES, plain values) hand-built
 * from a real snapshot of Sarah's base taken 2026-08-03 — real people, real
 * rates — so the mapping is proven before the app's token can even reach the
 * base. Run: npx tsx scripts/crm/test_mapping.ts
 */
import {
  type CrmRecord,
  deriveKeepItRelationships,
  mapCrmCreator,
  mapDealToCampaign,
  mapDeliverableToBooking,
  mapProducts,
  mapRates,
} from "../../lib/data/crm-map";

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok  ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}`, detail ?? "");
  }
}

// ---------- fixtures ----------

const products: CrmRecord[] = [
  { id: "recsneUgzER7PzqDb", fields: { Name: "🎙️ Standard Host-Read Ad", Platforms: ["► Video (YT)", "🎧 Podcast"] } },
  { id: "rectXspYllNOcffRv", fields: { Name: "💓 Personalized Host-Read Ad", Platforms: ["► Video (YT)", "🎧 Podcast"] } },
  { id: "recKLiZrJaxhhGNPt", fields: { Name: "✉️ Standard Newsletter Integration", Platforms: ["📧 Newsletter"] } },
  { id: "rec7RMo5JxiTtlTQ5", fields: { Name: "Multi-Edition Newsletter Series (100% SOV)", Platforms: ["📧 Newsletter"] } },
  { id: "recuHuyCHqPHq7O7O", fields: { Name: "Social Amplification (Add-on Only)", Platforms: ["＠ Social"] } },
  { id: "reca9OkxSKxqfNxVC", fields: { Name: "Livestream Shout Out", Platforms: ["🔴 Livestream"] } },
  { id: "recNoPlatform00000", fields: { Name: "Cross-Channel Package" } },
];

const TERRY = "recYG3FHzcWms26N0";
const rates: CrmRecord[] = [
  // Terry: real figures from the snapshot.
  { id: "r1", fields: { Creator: [TERRY], "Ad Product": ["recsneUgzER7PzqDb"], Rate: 3000, Active: true } },
  { id: "r2", fields: { Creator: [TERRY], "Ad Product": ["rectXspYllNOcffRv"], Rate: 5000, Active: true } },
  { id: "r3", fields: { Creator: [TERRY], "Ad Product": ["recKLiZrJaxhhGNPt"], Rate: 2500, Active: true } },
  // Priced but INACTIVE — must not surface.
  { id: "r4", fields: { Creator: [TERRY], "Ad Product": ["rec7RMo5JxiTtlTQ5"], Rate: 15000, Active: false } },
  // $0 add-on — listed as a format, never priced into a bundle.
  { id: "r5", fields: { Creator: [TERRY], "Ad Product": ["recuHuyCHqPHq7O7O"], Rate: 0, Active: true } },
  // Livestream product where the creator has no livestream stat columns.
  { id: "r6", fields: { Creator: [TERRY], "Ad Product": ["reca9OkxSKxqfNxVC"], Rate: 500, Active: true } },
  // No-platform product → lands on the first channel.
  { id: "r7", fields: { Creator: [TERRY], "Ad Product": ["recNoPlatform00000"], Rate: 9000, Active: true } },
  // Real quirks seen in the base: no product / no creator.
  { id: "r8", fields: { Creator: [TERRY] } },
  { id: "r9", fields: { Rate: 1234, Active: true } },
];

const terryRec: CrmRecord = {
  id: TERRY,
  fields: {
    "Creator Talent": "Terry Moran",
    "Channel / Company Name": "Real Patriotism",
    "CM Ad Sales": "Actively Selling",
    "CM Client Status": "Active",
    "Content Niche": ["News/Pol"],
    "Advertiser Category Fit": ["Finance", "Consumer Tech"],
    "(RED) Restricted Categories": ["Gambling"],
    "YELLOW (Case by Case Categories)": ["Alcohol"],
    "YouTube Subscribers": 65000,
    "YouTube Avg. Views/Video": 41000,
    "YouTube Engagement Rate": 0.047,
    "YouTube CTR": 0.031,
    "YouTube Channel": "https://youtube.com/@terry",
    "Newsletter Subscribers": 103189,
    "Newsletter Open Rate Avg": 0.52,
    "Newsletter Link": "https://terry.substack.com",
    "Podcast Downloads Per Episode": 100,
    "Total Social Reach": 1308300,
    "Creator's Biz Lead Email": "team@example.com",
    Images: [{ url: "https://example.com/terry.jpg" }],
    "Bio/Background": "Longtime network correspondent.",
  },
};

const notSellableRec: CrmRecord = {
  id: "recNOSALES00000000",
  fields: { "Creator Talent": "Joanna Stern", "CM Ad Sales": "NO CM AD SALES" },
};

const companies = new Map([["recCOMPANY0000001", "Ground News"]]);

const cmDeal: CrmRecord = {
  id: "recDEAL00000000001",
  fields: {
    "Campaign Name": "Autumn Launch",
    "Company Name": ["recCOMPANY0000001"],
    Stage: "Live",
    "Campaign Flight Start": "2026-09-01",
    "Campaign Flight End": "2026-11-15",
    Creators: [TERRY],
  },
};
const compDeal: CrmRecord = {
  id: "recDEAL00000000002",
  fields: {
    "NOT a CM Deal!": true,
    "Company Name": ["recCOMPANY0000001"],
    Creators: [TERRY],
  },
};

// ---------- creator + channels ----------

console.log("mapCrmCreator:");
const prodMap = mapProducts(products);
const mappedRates = mapRates(rates, prodMap).filter((r) => r.creatorRecId === TERRY);
const terry = mapCrmCreator(terryRec, mappedRates);

check("sellable creator maps", terry != null);
check("non-sellable creator drops", mapCrmCreator(notSellableRec, []) == null);
check("creatorless rate rows drop", mapRates(rates, prodMap).every((r) => r.creatorRecId));
if (!terry) process.exit(1);

check("not a demo persona", terry.isDemoPersona === false);
check("headshot from attachment", terry.headshot === "https://example.com/terry.jpg");
check("beat from first niche", terry.primaryBeat === "News/Pol");
check("team email from biz lead", terry.teamEmail === "team@example.com");
check("agreement null until field exists", terry.agreementStatus === null);
check("RED → no-go", terry.brandBoundary?.noGoCategories.includes("Gambling") === true);
check("YELLOW → conditional", terry.brandBoundary?.conditionalCategories.includes("Alcohol") === true);

const platforms = terry.channels.map((c) => c.platform).sort();
check(
  "channels: YouTube, Newsletter, Podcast, Social + Livestream from priced product",
  JSON.stringify(platforms) ===
    JSON.stringify(["Livestream", "Newsletter", "Podcast", "Social", "YouTube"]),
  platforms
);

const yt = terry.channels.find((c) => c.platform === "YouTube")!;
const nl = terry.channels.find((c) => c.platform === "Newsletter")!;
const social = terry.channels.find((c) => c.platform === "Social")!;
const live = terry.channels.find((c) => c.platform === "Livestream")!;

check("yt audience = subs", yt.audienceSize === 65000);
check("yt reach = avg views", yt.avgReachPerUnit === 41000);
check("nl reach = subs × open rate", nl.avgReachPerUnit === Math.round(103189 * 0.52));
check("host-read $3000 on YouTube", (yt.rateCard as any)?.["🎙️ Standard Host-Read Ad"]?.usd === 3000);
check("host-read also on Podcast", (terry.channels.find((c) => c.platform === "Podcast")!.rateCard as any)?.["🎙️ Standard Host-Read Ad"]?.usd === 3000);
check("newsletter integration $2500", (nl.rateCard as any)?.["✉️ Standard Newsletter Integration"]?.usd === 2500);
check("inactive rate absent", !JSON.stringify(nl.rateCard).includes("Multi-Edition"));
check("$0 add-on listed as format", social.availableAdFormats.includes("Social Amplification (Add-on Only)"));
check("$0 add-on NOT in rate card", social.rateCard === null || !(social.rateCard as any)["Social Amplification (Add-on Only)"]);
check("livestream channel honest nulls", live.audienceSize === null && (live.rateCard as any)?.["Livestream Shout Out"]?.usd === 500);
check("platformless product on first channel", (terry.channels[0].rateCard as any)?.["Cross-Channel Package"]?.usd === 9000);

// ---------- deals ----------

console.log("deals:");
const campaign = mapDealToCampaign(cmDeal, companies);
check("campaign advertiser resolves", campaign.advertiser === "Ground News");
check("campaign months normalized", campaign.startMonth === "2026-09" && campaign.endMonth === "2026-11");

const keepIt = deriveKeepItRelationships([cmDeal, compDeal], companies);
check("only non-CM deals derive keep-it", keepIt.length === 1);
check("keep-it treatment + creator", keepIt[0].treatment === "Keep it" && keepIt[0].creatorId === TERRY);

// ---------- deliverables ----------

console.log("deliverables:");
const channelsByCreator = new Map([[TERRY, terry.channels]]);
const brandByDeal = new Map([[cmDeal.id, "Ground News"]]);
const booking = mapDeliverableToBooking(
  {
    id: "recDELIV0000000001",
    fields: {
      Creator: [TERRY],
      "Integration Type": ["recKLiZrJaxhhGNPt"],
      Deal: [cmDeal.id],
      "Run Date": "2026-09-12",
      Live: true,
      "Live Link": "https://terry.substack.com/p/sponsored",
      "Delivered Impressions": 54000,
    },
  },
  prodMap,
  channelsByCreator,
  brandByDeal
);
check("booking resolves newsletter channel", booking.channelId === nl.id);
check("booking month", booking.month === "2026-09");
check("published because Live", booking.publishedDate === "2026-09-12");
check("impressions carried, clicks unknown", booking.impressions === 54000 && booking.clicks === null);
check("brand via deal", booking.brand === "Ground News");

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
