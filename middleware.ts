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

  // Always allow the gate page + its unlock endpoint through.
  if (pathname === "/gate" || pathname === "/api/site-unlock") {
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
