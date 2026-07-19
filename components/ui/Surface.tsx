import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type SurfaceLevel = 0 | 1 | 2 | 3;

const LEVEL_BG: Record<SurfaceLevel, string> = {
  0: "bg-surface-0",
  1: "bg-surface-1",
  2: "bg-surface-2",
  3: "bg-surface-3",
};

// interactive hover steps one level up, capped at 3.
const LEVEL_HOVER: Record<SurfaceLevel, string> = {
  0: "hover:bg-surface-1 active:bg-surface-0",
  1: "hover:bg-surface-2 active:bg-surface-1",
  2: "hover:bg-surface-3 active:bg-surface-2",
  3: "hover:bg-surface-3 active:bg-surface-3",
};

type Radius = "sm" | "md" | "lg" | "xl" | false;

const RADIUS: Record<Exclude<Radius, false>, string> = {
  sm: "rounded-v2-sm",
  md: "rounded-v2-md",
  lg: "rounded-v2-lg",
  xl: "rounded-v2-xl",
};

export type SurfaceProps<T extends ElementType = "div"> = {
  level?: SurfaceLevel;
  interactive?: boolean;
  border?: boolean;
  radius?: Radius;
  as?: T;
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, "className" | "children">;

export function Surface<T extends ElementType = "div">({
  level = 1,
  interactive = false,
  border = true,
  radius = "lg",
  as,
  className = "",
  children,
  ...rest
}: SurfaceProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const cls = [
    LEVEL_BG[level],
    border ? "border border-hairline" : "",
    radius ? RADIUS[radius] : "",
    interactive
      ? `${LEVEL_HOVER[level]} cursor-pointer transition-[background-color] duration-[var(--dur-fast)] [transition-timing-function:var(--ease-out)]`
      : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
