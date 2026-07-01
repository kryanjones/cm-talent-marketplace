"use client";

import { Eyebrow, Pill } from "@/components/ui";
import type { FilterOptions, FilterState } from "./filters";

const AUDIENCE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "Niche · <50K", min: 0, max: 50_000 },
  { label: "Mid · 50K–500K", min: 50_000, max: 500_000 },
  { label: "Mega · 500K+", min: 500_000, max: Number.MAX_SAFE_INTEGER },
];

export function FilterPanel({
  options,
  filters,
  setFilters,
  resultCount,
  onReset,
}: {
  options: FilterOptions;
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  resultCount: number;
  onReset: () => void;
}) {
  const toggle = (key: keyof FilterState, value: string) => {
    const list = filters[key] as string[];
    const next = list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];
    setFilters({ ...filters, [key]: next });
  };

  const bounds = options.audienceBounds;
  const activeBucket = AUDIENCE_BUCKETS.find(
    (b) => filters.audienceMin === b.min && filters.audienceMax === b.max
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <Eyebrow>Refine</Eyebrow>
        <button
          type="button"
          onClick={onReset}
          className="cm-fine text-ink/45 underline-offset-2 hover:text-accent hover:underline"
        >
          Reset
        </button>
      </div>

      <input
        type="search"
        value={filters.search}
        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        placeholder="Search name, beat, outlet…"
        className="cm-sans w-full border border-hairline bg-bg px-3 py-2 text-sm outline-none transition-colors duration-micro focus:border-ink"
      />

      <p className="cm-fine text-ink/50">
        <span className="text-accent">{resultCount}</span> creators match
      </p>

      <Group title="Beat">
        {options.beats.map((b) => (
          <Pill key={b} active={filters.beats.includes(b)} onClick={() => toggle("beats", b)}>
            {b}
          </Pill>
        ))}
      </Group>

      <Group title="Platform">
        {options.platforms.map((p) => (
          <Pill
            key={p}
            active={filters.platforms.includes(p)}
            onClick={() => toggle("platforms", p)}
          >
            {p}
          </Pill>
        ))}
      </Group>

      <Group title="Audience size">
        {AUDIENCE_BUCKETS.map((b) => (
          <Pill
            key={b.label}
            active={activeBucket?.label === b.label}
            onClick={() =>
              setFilters(
                activeBucket?.label === b.label
                  ? { ...filters, audienceMin: bounds[0], audienceMax: bounds[1] }
                  : { ...filters, audienceMin: b.min, audienceMax: b.max }
              )
            }
          >
            {b.label}
          </Pill>
        ))}
      </Group>

      <Group title="Category affinity">
        {options.affinities.map((a) => (
          <Pill
            key={a}
            active={filters.affinities.includes(a)}
            onClick={() => toggle("affinities", a)}
          >
            {a}
          </Pill>
        ))}
      </Group>

      <Group title="Brand safety tier">
        {options.tiers.map((t) => (
          <Pill key={t} active={filters.tiers.includes(t)} onClick={() => toggle("tiers", t)}>
            {t}
          </Pill>
        ))}
      </Group>

      <Group title="Available ad formats">
        {options.formats.map((f) => (
          <Pill
            key={f}
            active={filters.formats.includes(f)}
            onClick={() => toggle("formats", f)}
          >
            {f}
          </Pill>
        ))}
      </Group>

      <Group title="Political lean" hint="Audience context — presented neutrally.">
        {options.leans.map((l) => (
          <Pill key={l} active={filters.leans.includes(l)} onClick={() => toggle("leans", l)}>
            {l}
          </Pill>
        ))}
      </Group>

      <div className="flex flex-col gap-2">
        <Eyebrow>Home market / DMA</Eyebrow>
        <select
          value={filters.geo ?? ""}
          onChange={(e) =>
            setFilters({ ...filters, geo: e.target.value || null })
          }
          className="cm-sans w-full border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
        >
          <option value="">All markets</option>
          {options.geos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Eyebrow>Category allowed</Eyebrow>
        <p className="cm-fine text-ink/45">
          Hide creators who decline this category in their brand boundaries.
        </p>
        <select
          value={filters.allowedCategory ?? ""}
          onChange={(e) =>
            setFilters({ ...filters, allowedCategory: e.target.value || null })
          }
          className="cm-sans w-full border border-hairline bg-bg px-3 py-2 text-sm outline-none focus:border-ink"
        >
          <option value="">Any category</option>
          {options.boundaryCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{title}</Eyebrow>
      {hint && <p className="cm-fine text-ink/40">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
