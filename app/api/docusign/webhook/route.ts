import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { data } from "@/lib/data";

/**
 * DocuSign Connect receiver — keeps Agreement Status in step with reality.
 *
 * Deliberately a webhook rather than the app polling DocuSign. The app has no
 * DocuSign credentials and does not need any: Connect pushes envelope events to
 * us, so there is no integration key to store, rotate, or leak. It also means
 * status is correct within seconds of a creator signing rather than whenever a
 * poll happens to run.
 *
 * Setup (DocuSign Admin → Connect → add configuration):
 *   URL     https://marketplace.collective.media/api/docusign/webhook
 *   Events  Envelope Sent, Delivered, Completed, Declined, Voided
 *   Include HMAC signature, with the secret set as DOCUSIGN_CONNECT_SECRET.
 */

/** Envelope status → the agreement state it implies. */
function agreementStatusFor(envelopeStatus: string): string | null {
  switch (envelopeStatus.toLowerCase()) {
    case "sent":
    case "delivered":
      return "Sent";
    case "completed":
      return "Signed";
    case "declined":
    case "voided":
      return "Declined";
    default:
      // Anything else (created, processing) is not a state worth writing.
      return null;
  }
}

/**
 * DocuSign signs each payload with HMAC-SHA256 over the raw body, base64.
 * Verified against the raw text — re-serialising the parsed JSON would change
 * the bytes and every signature would fail.
 */
function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(raw, "utf8")
    .digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.DOCUSIGN_CONNECT_SECRET;
  // Fails closed. This endpoint writes to the base, so an unauthenticated
  // caller must never be able to mark an agreement signed.
  if (!secret) {
    console.error("docusign webhook rejected: DOCUSIGN_CONNECT_SECRET not set");
    return NextResponse.json({ error: "Not configured." }, { status: 503 });
  }

  const raw = await req.text();
  if (!verify(raw, req.headers.get("x-docusign-signature-1"), secret)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  try {
    const body = JSON.parse(raw) as {
      event?: string;
      data?: {
        envelopeId?: string;
        envelopeSummary?: { status?: string; completedDateTime?: string };
      };
    };

    const envelopeId = body.data?.envelopeId;
    const envelopeStatus = body.data?.envelopeSummary?.status ?? "";
    if (!envelopeId) {
      return NextResponse.json({ error: "No envelopeId." }, { status: 400 });
    }

    const status = agreementStatusFor(envelopeStatus);
    if (!status) {
      // Acknowledge and do nothing — Connect retries anything it sees as failed.
      return NextResponse.json({ ok: true, ignored: envelopeStatus });
    }

    const signedDate =
      status === "Signed"
        ? (body.data?.envelopeSummary?.completedDateTime ?? new Date().toISOString()).slice(
            0,
            10
          )
        : null;

    const updated = await data.updateAgreementByEnvelope(
      envelopeId,
      status,
      signedDate
    );
    if (!updated) {
      // Unknown envelope: acknowledge so Connect stops retrying, but say so.
      console.warn("docusign webhook: no creator holds envelope", envelopeId);
      return NextResponse.json({ ok: true, matched: false });
    }
    return NextResponse.json({ ok: true, matched: true, status });
  } catch (err) {
    console.error("docusign webhook failed", err);
    return NextResponse.json({ error: "Could not process event." }, { status: 500 });
  }
}
