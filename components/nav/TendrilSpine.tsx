"use client";

import { usePathname, useRouter } from "next/navigation";
import { SECTIONS, type SectionConfig } from "@/lib/nav/sections";

function findSection(pathname: string): SectionConfig | null {
  for (const s of SECTIONS) {
    if (pathname === s.baseRoute || pathname.startsWith(s.baseRoute + "/")) {
      return s;
    }
    for (const sp of s.subPages) {
      if (pathname === sp.href || pathname.startsWith(sp.href + "/")) {
        return s;
      }
    }
  }
  return null;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function TendrilSpine() {
  const pathname = usePathname();
  const router = useRouter();
  const section = findSection(pathname);

  if (!section) return null;

  const primary = section.subPages.filter((sp) => sp.primary);
  const secondary = section.subPages.filter((sp) => !sp.primary);
  const totalNodes = primary.length + secondary.length;

  return (
    <nav
      aria-label={`${section.label} navigation`}
      className="hidden lg:flex fixed left-0 top-0 h-full w-[52px] z-40 flex-col items-center"
      style={{
        background: "rgba(14,20,16,0.92)",
        backdropFilter: "blur(8px)",
        borderRight: "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Section label — vertical */}
      <div
        className="pt-5 text-[9px] font-[family-name:var(--font-mono)] tracking-[2px]"
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          color: section.colour,
          opacity: 0.6,
        }}
      >
        {section.label}
      </div>

      {/* Spine line */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          top: 56,
          bottom: 56,
          width: 0.5,
          background: section.colour,
          opacity: 0.2,
        }}
      />

      {/* Sub-page nodes */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex flex-col"
        style={{ top: 56, bottom: 56 }}
      >
        {primary.map((sp, i) => {
          const active = isActive(pathname, sp.href);
          const size = active ? 13 : 11;
          const topPercent = totalNodes <= 1 ? 0 : (i / (totalNodes - 1)) * 60;
          return (
            <a
              key={sp.href + sp.label}
              href={sp.href}
              onClick={(e) => {
                e.preventDefault();
                router.push(sp.href);
              }}
              title={sp.label}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${topPercent}%`, left: 0 }}
            >
              <span
                className="block rounded-full transition-all duration-150"
                style={{
                  width: size,
                  height: size,
                  background: section.colour,
                  opacity: active ? 0.9 : 0.5,
                  border: `1px solid ${section.colour}`,
                }}
              />
              <span
                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-[family-name:var(--font-mono)] opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none"
                style={{ color: section.colour }}
              >
                {sp.label}
              </span>
            </a>
          );
        })}
        {secondary.map((sp, i) => {
          const active = isActive(pathname, sp.href);
          const size = active ? 9 : 7;
          const topPercent =
            totalNodes <= 1
              ? 100
              : ((primary.length + i) / (totalNodes - 1)) * 100;
          const clampedTop = Math.min(topPercent, 100);
          return (
            <a
              key={sp.href + sp.label}
              href={sp.href}
              onClick={(e) => {
                e.preventDefault();
                router.push(sp.href);
              }}
              title={sp.label}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${clampedTop}%`, left: 0 }}
            >
              <span
                className="block rounded-full transition-all duration-150"
                style={{
                  width: size,
                  height: size,
                  background: active ? section.colour : "transparent",
                  opacity: active ? 0.9 : 0.38,
                  border: `0.5px solid ${section.colour}`,
                }}
              />
              <span
                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-[family-name:var(--font-mono)] opacity-0 group-hover:opacity-80 transition-opacity pointer-events-none"
                style={{ color: section.colour }}
              >
                {sp.label}
              </span>
            </a>
          );
        })}
      </div>

      {/* Brain nucleus — return to hub */}
      <button
        type="button"
        onClick={() => router.push("/")}
        title="Return to hub"
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center justify-center rounded-full"
        style={{
          width: 20,
          height: 20,
          border: "0.5px solid rgba(132,245,184,0.45)",
        }}
      >
        <span
          className="block rounded-full"
          style={{
            width: 6,
            height: 6,
            background: "#84f5b8",
            opacity: 0.85,
          }}
        />
      </button>
    </nav>
  );
}
