import "server-only";
import type {
  Creator,
  OverlapAssumption,
  SavedBundle,
  CreatorApplication,
  CreatorStatus,
  Booking,
  AdvertiserRelationship,
  Approval,
} from "@/lib/types";

/**
 * The backend contract. Both the Airtable adapter and the local seed adapter
 * implement this. Swapping to Supabase/Postgres later means writing one more
 * implementation of this interface — components and API routes are untouched.
 */
export interface DataAdapter {
  source: "airtable" | "local";

  /** All creators, fully assembled with channels + brand boundary. */
  getCreators(): Promise<Creator[]>;
  getCreatorById(id: string): Promise<Creator | null>;

  getOverlapAssumptions(): Promise<OverlapAssumption[]>;

  /**
   * Booked/held inventory. Returns [] when no Bookings table exists, so every
   * channel simply reads as fully open rather than the app failing.
   */
  getBookings(): Promise<Booking[]>;

  /**
   * Schedule B rows across all creators. Returns [] when no Advertiser
   * Relationships table exists, in which case every advertiser is new (20%).
   */
  getAdvertiserRelationships(): Promise<AdvertiserRelationship[]>;

  /** Recorded §3.3 approval requests. [] when no Approvals table exists. */
  getApprovals(): Promise<Approval[]>;
  /** Records that a request was put to a creator, with its response deadline. */
  recordApprovals(
    requests: Omit<Approval, "id">[]
  ): Promise<{ created: number }>;

  /**
   * Sets a creator's agreement status from a DocuSign envelope event.
   * Returns null when no creator holds that envelope id.
   */
  updateAgreementByEnvelope(
    envelopeId: string,
    status: string,
    signedDate: string | null
  ): Promise<Creator | null>;

  getSavedBundles(): Promise<SavedBundle[]>;
  saveBundle(bundle: SavedBundle): Promise<SavedBundle>;

  updateCreatorStatus(
    id: string,
    status: CreatorStatus,
    dateApproved?: string | null
  ): Promise<Creator | null>;

  createCreatorApplication(app: CreatorApplication): Promise<Creator>;
}
