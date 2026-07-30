import "server-only";
import type {
  Creator,
  OverlapAssumption,
  SavedBundle,
  CreatorApplication,
  CreatorStatus,
  Booking,
  AdvertiserRelationship,
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

  getSavedBundles(): Promise<SavedBundle[]>;
  saveBundle(bundle: SavedBundle): Promise<SavedBundle>;

  updateCreatorStatus(
    id: string,
    status: CreatorStatus,
    dateApproved?: string | null
  ): Promise<Creator | null>;

  createCreatorApplication(app: CreatorApplication): Promise<Creator>;
}
