"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { BundleComponent, BuyerCreator } from "@/lib/types";

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

export function BundleProvider({ children }: { children: ReactNode }) {
  const [components, setComponents] = useState<BundleComponent[]>([]);

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
