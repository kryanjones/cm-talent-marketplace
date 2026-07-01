import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";
import { isUnlocked } from "@/lib/auth";
import type { SavedBundle } from "@/lib/types";

/** List saved bundles (sales-only visibility). */
export async function GET() {
  if (!isUnlocked("sales") && !isUnlocked("admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  const bundles = await data.getSavedBundles();
  return NextResponse.json({ bundles });
}

/** Save a bundle a buyer assembled, so sales can see what's being built. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SavedBundle>;
    if (!body.components || body.components.length === 0) {
      return NextResponse.json(
        { error: "A bundle needs at least one component." },
        { status: 400 }
      );
    }
    const bundle: SavedBundle = {
      bundleName: body.bundleName || "Untitled bundle",
      createdBy: body.createdBy || "Buyer (anonymous)",
      components: body.components,
      createdAt: new Date().toISOString(),
    };
    const saved = await data.saveBundle(bundle);
    return NextResponse.json({ ok: true, bundle: saved }, { status: 201 });
  } catch (err) {
    console.error("save bundle failed", err);
    return NextResponse.json({ error: "Could not save bundle." }, { status: 500 });
  }
}
