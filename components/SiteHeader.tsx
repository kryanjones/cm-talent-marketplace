"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Discover", match: (p: string) => p === "/" },
  { href: "/sales", label: "Sales", match: (p: string) => p.startsWith("/sales") },
  { href: "/apply", label: "Apply", match: (p: string) => p.startsWith("/apply") },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-content items-center justify-between px-6 py-4">
        <Link href="/" className="group flex items-baseline gap-3">
          {/* Wordmark lockup — the sunburst mark is reproduced from supplied
              artwork only (BRAND.md), never redrawn, so we use the wordmark. */}
          <span className="cm-h3 font-bold tracking-tight">Collective Media</span>
          <span className="cm-label hidden text-accent sm:inline">Talent Marketplace</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`cm-label px-3 py-2 transition-colors duration-micro ease-brand ${
                  active ? "text-ink" : "text-ink/45 hover:text-ink"
                }`}
              >
                {item.label}
                {active && <span className="cm-rule-red mt-1 h-[3px] w-full" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
