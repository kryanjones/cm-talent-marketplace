"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BundleComponent, BuyerCreator } from "@/lib/types";
import { SHARE_PARAM, encodeShareParam, decodeShareParam } from "@/lib/share";

const STORAGE_KEY = "cm-bundle";

interface BundleApi {
  components: BundleComponent[];
  has: (channelId: string) => boolean;
  creatorChannelCount: (creatorId: string) => number;
  toggleChannel: (creatorId: string, channelId: string) => void;
  toggleCreator: (creator: BuyerCreator) => void;
  remove: (channelId: string) => void;
  clear: () => void;
  count: number;
}

const Ctx = createContext<BundleApi | null>(null);

export function BundleProvider({
  creators,
  children,
}: {
  creators: BuyerCreator[];
  children: ReactNode;
}) {
  const [components, setComponents] = useState<BundleComponent[]>([]);

  // channelId → owning creatorId, for validating restored bundles. The
  // creator half is always re-derived from live data, so a share link (or a
  // stale localStorage entry) only restores channels that still exist.
  const channelOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of creators) for (const ch of c.channels) m.set(ch.id, c.id);
    return m;
  }, [creators]);

  // Hydrate once on mount: a share link (?b=) wins over localStorage. Runs
  // client-side only, after first paint, to keep server/client HTML in sync.
  const hydratedOnce = useRef(false);
  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;

    let channelIds: string[] = [];
    const param = new URL(window.location.href).searchParams.get(SHARE_PARAM);
    if (param) {
      channelIds = decodeShareParam(param);
    } else {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          channelIds = (JSON.parse(raw) as BundleComponent[]).map(
            (c) => c.channelId
          );
        }
      } catch {
        // Corrupt storage — start fresh.
      }
    }
    const restored: BundleComponent[] = [];
    for (const channelId of channelIds) {
      const creatorId = channelOwner.get(channelId);
      if (creatorId) restored.push({ creatorId, channelId });
    }
    if (restored.length) setComponents(restored);
  }, [channelOwner]);

  // Keep the URL and localStorage in step with the bundle, so the address bar
  // is always a shareable link. Skips the initial mount (components is still
  // the pre-hydration empty state on that run).
  const skipFirstSync = useRef(true);
  useEffect(() => {
    if (skipFirstSync.current) {
      skipFirstSync.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(components));
    } catch {
      // Storage unavailable (private mode) — the URL still carries the bundle.
    }
    const url = new URL(window.location.href);
    if (components.length) {
      url.searchParams.set(SHARE_PARAM, encodeShareParam(components));
    } else {
      url.searchParams.delete(SHARE_PARAM);
    }
    window.history.replaceState(null, "", url);
  }, [components]);

  const api = useMemo<BundleApi>(() => {
    const has = (channelId: string) =>
      components.some((c) => c.channelId === channelId);

    return {
      components,
      has,
      creatorChannelCount: (creatorId: string) =>
        components.filter((c) => c.creatorId === creatorId).length,
      toggleChannel: (creatorId, channelId) =>
        setComponents((prev) =>
          prev.some((c) => c.channelId === channelId)
            ? prev.filter((c) => c.channelId !== channelId)
            : [...prev, { creatorId, channelId }]
        ),
      toggleCreator: (creator) =>
        setComponents((prev) => {
          const ids = creator.channels.map((ch) => ch.id);
          const allIn = ids.every((id) => prev.some((c) => c.channelId === id));
          if (allIn) {
            // Remove all of this creator's channels.
            return prev.filter((c) => c.creatorId !== creator.id);
          }
          // Add any missing channels.
          const missing = creator.channels
            .filter((ch) => !prev.some((c) => c.channelId === ch.id))
            .map((ch) => ({ creatorId: creator.id, channelId: ch.id }));
          return [...prev, ...missing];
        }),
      remove: (channelId) =>
        setComponents((prev) => prev.filter((c) => c.channelId !== channelId)),
      clear: () => setComponents([]),
      count: components.length,
    };
  }, [components]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useBundle() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBundle must be used within BundleProvider");
  return ctx;
}
