import { NextRequest, NextResponse } from "next/server";

/**
 * Site-wide password gate.
 *
 * If SITE_PASSWORD is set, every route (buyer, sales, apply, API) requires a
 * matching `cm_site` cookie; unauthenticated visitors are sent to /gate. If
 * SITE_PASSWORD is unset (e.g. local dev), the whole site is open. This is a
 * lightweight shared-password gate for a private demo — not per-user auth.
 *
 * The internal /sales route keeps its own optional SALES_ACCESS_PASSWORD on top
 * of this, so you can share one password for the demo and still keep the sales
 * desk behind a second one if you want.
 */
export function middleware(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next(); // gate disabled

  const { pathname, search } = req.nextUrl;

  /**
   * Paths the password gate must not touch.
   *
   * The gate is a shared password held in a cookie, which only a browser can
   * present. Machine callers cannot, so any endpoint a third-party service
   * posts to has to be exempt or it silently receives a 307 to /gate and never
   * runs — DocuSign Connect was being bounced exactly this way.
   *
   * Exempting the webhook does not weaken anything: it authenticates every
   * request by HMAC against DOCUSIGN_CONNECT_SECRET and rejects unsigned
   * callers, which is stronger than a shared password would have been.
   *
   * Exact matches only — a prefix test would expose anything below the path.
   */
  const OPEN_PATHS = new Set([
    "/gate",
    "/api/site-unlock",
    "/api/docusign/webhook",
  ]);
  if (OPEN_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  // Tracked placement links. These are published inside a creator's content and
  // clicked by the public, who have no password and never will — gating them
  // would break every link already out in the world. The route only redirects
  // to a stored destination and records a count; it exposes nothing.
  if (pathname.startsWith("/l/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("cm_site")?.value;
  if (token === password) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/gate";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except Next internals and static asset files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml)).*)"],
};
