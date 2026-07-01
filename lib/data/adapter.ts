import "server-only";
import type {
  Creator,
  OverlapAssumption,
  SavedBundle,
  CreatorApplication,
  CreatorStatus,
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

  getSavedBundles(): Promise<SavedBundle[]>;
  saveBundle(bundle: SavedBundle): Promise<SavedBundle>;

  updateCreatorStatus(
    id: string,
    status: CreatorStatus,
    dateApproved?: string | null
  ): Promise<Creator | null>;

  createCreatorApplication(app: CreatorApplication): Promise<Creator>;
}
