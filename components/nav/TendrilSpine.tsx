"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useCallback } from "react";
import { SECTIONS, type SectionConfig } from "@/lib/nav/sections";
import { useTransition } from "@/lib/context/TransitionContext";

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
  const { bloom } = useTransition();
  const navigatingRef = useRef(false);
  const section = findSection(pathname);

  const returnToHub = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const originX = rect.left + rect.width / 2;
      const originY = rect.top + rect.height / 2;
      await bloom({
        colour: section?.colour ?? "#84f5b8",
        originX,
        originY,
        direction: "exit",
      });
      router.push("/");
      navigatingRef.current = false;
    },
    [bloom, router, section?.colour],
  );

  if (!section) return null;

  const primary = section.subPages.filter((sp) => sp.primary);
  const secondary = section.subPages.filter((sp) => !sp.primary);

  return (
    <nav
      aria-label={`${section.label} navigation`}
      className="hidden lg:flex fixed left-0 top-0 h-full z-40 flex-col"
      style={{
        width: 88,
        background: "#0e1410",
        borderRight: "0.5px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Section name — horizontal */}
      <div
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          letterSpacing: 2,
          color: section.colour,
          opacity: 0.62,
          padding: "14px 10px 0",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {section.label}
      </div>

      {/* Node list */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          paddingTop: 20,
          gap: 2,
        }}
      >
        {primary.map((sp) => {
          const active = isActive(pathname, sp.href);
          return (
            <a
              key={sp.href}
              href={sp.href}
              onClick={(e) => {
                e.preventDefault();
                router.push(sp.href);
              }}
              style={{
                height: 26,
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
                gap: 8,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: active ? section.colour : "transparent",
                  border: `0.5px solid ${section.colour}`,
                  opacity: active ? 0.9 : 0.5,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: section.colour,
                  opacity: active ? 0.88 : 0.52,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 58,
                }}
              >
                {sp.label}
              </span>
            </a>
          );
        })}
        {secondary.map((sp) => {
          const active = isActive(pathname, sp.href);
          return (
            <a
              key={sp.href}
              href={sp.href}
              onClick={(e) => {
                e.preventDefault();
                router.push(sp.href);
              }}
              style={{
                height: 26,
                display: "flex",
                alignItems: "center",
                padding: "0 8px",
                gap: 8,
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flexShrink: 0,
                  marginLeft: 1.5,
                  background: active ? section.colour : "transparent",
                  border: `0.5px solid ${section.colour}`,
                  opacity: active ? 0.9 : 0.3,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "monospace",
                  color: section.colour,
                  opacity: active ? 0.88 : 0.28,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 58,
                }}
              >
                {sp.label}
              </span>
            </a>
          );
        })}
      </div>

      {/* Brain nucleus — return to hub */}
      <div
        onClick={returnToHub}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            returnToHub(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        style={{
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: "0.5px solid rgba(132,245,184,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#84f5b8",
              opacity: 0.85,
            }}
          />
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: "rgba(132,245,184,0.42)",
            letterSpacing: 1,
          }}
        >
          HUB
        </span>
      </div>
    </nav>
  );
}
