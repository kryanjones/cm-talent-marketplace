import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";

/**
 * Tracked placement link: /l/CODE → the advertiser's landing page.
 *
 * This is the only click data obtainable without access to any creator's
 * analytics account — the creator publishes this URL instead of the raw one, and
 * the redirect counts the click on the way through.
 *
 * Two rules govern everything here:
 *
 * 1. THE REDIRECT MUST NEVER FAIL BECAUSE LOGGING FAILED. A real person is
 *    mid-click. If Airtable is slow, rate-limited or down, they still land on
 *    the advertiser's page and we lose a number. Losing a click is a reporting
 *    inconvenience; a broken link in a published podcast is a live incident we
 *    cannot retract.
 *
 * 2. LOG THE MINIMUM. Code, timestamp, referring host. No IP, no user agent,
 *    no full referrer — that is a creator's audience, and counts are all the
 *    reporting needs.
 */
export const dynamic = "force-dynamic";

/** Host only. A full referrer can carry query strings and personal data. */
function referrerHost(req: NextRequest): string | null {
  const raw = req.headers.get("referer");
  if (!raw) return null;
  try {
    return new URL(raw).host || null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const code = params.code?.trim();
  if (!code) return NextResponse.redirect(new URL("/", req.url), 302);

  let destination: string | null = null;
  try {
    destination = await data.resolveLinkCode(code);
  } catch (err) {
    console.error("link resolve failed", code, err);
  }

  if (!destination) {
    // Unknown or unresolvable code. Send them somewhere real rather than
    // showing an error page on a link that is already out in the world.
    return NextResponse.redirect(new URL("/", req.url), 302);
  }

  // Record the click, but never let it hold up or break the redirect.
  try {
    await data.recordLinkClick(code, referrerHost(req));
  } catch (err) {
    console.error("click not recorded", code, err);
  }

  // 302, not 301: a permanent redirect would be cached by browsers and we would
  // stop seeing clicks entirely after the first one.
  return NextResponse.redirect(destination, 302);
}
