"use client";

const FRONT_MUSCLES: Record<string, string> = {
  chest: "M 38,28 Q 50,25 62,28 L 62,38 Q 50,42 38,38 Z",
  abs: "M 42,40 L 58,40 L 58,60 L 42,60 Z",
  obliques: "M 36,40 L 42,40 L 42,60 L 36,55 Z M 58,40 L 64,40 L 64,55 L 58,60 Z",
  quads: "M 38,62 L 48,62 L 46,82 L 36,82 Z M 52,62 L 62,62 L 64,82 L 54,82 Z",
  "shoulders-front": "M 30,24 Q 36,22 38,28 L 34,32 Q 30,28 30,24 Z M 62,28 Q 64,22 70,24 L 70,28 Q 66,32 62,28 Z",
  biceps: "M 28,32 L 34,32 L 34,46 L 28,46 Z M 66,32 L 72,32 L 72,46 L 66,46 Z",
  forearms: "M 26,48 L 34,48 L 32,60 L 24,60 Z M 66,48 L 74,48 L 76,60 L 68,60 Z",
  calves: "M 38,84 L 46,84 L 46,96 L 40,96 Z M 54,84 L 62,84 L 60,96 L 54,96 Z",
};

const BACK_MUSCLES: Record<string, string> = {
  "back-upper": "M 38,28 Q 50,24 62,28 L 62,42 Q 50,38 38,42 Z",
  "back-lower": "M 42,44 L 58,44 L 58,58 L 42,58 Z",
  "shoulders-rear": "M 30,24 Q 36,22 38,28 L 34,32 Q 30,28 30,24 Z M 62,28 Q 64,22 70,24 L 70,28 Q 66,32 62,28 Z",
  "shoulders-side": "M 28,26 L 32,26 L 34,34 L 28,34 Z M 68,26 L 72,26 L 72,34 L 66,34 Z",
  triceps: "M 28,34 L 34,34 L 34,46 L 28,46 Z M 66,34 L 72,34 L 72,46 L 66,46 Z",
  hamstrings: "M 38,62 L 48,62 L 46,80 L 36,80 Z M 52,62 L 62,62 L 64,80 L 54,80 Z",
  glutes: "M 38,55 Q 50,50 62,55 L 62,62 Q 50,58 38,62 Z",
};

export function MuscleMapSvg({
  primaryMuscles,
  secondaryMuscles,
  accentColour = "#84f5b8",
  height = 200,
}: {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  accentColour?: string;
  height?: number;
}) {
  const primarySet = new Set(primaryMuscles);
  const secondarySet = new Set(secondaryMuscles ?? []);

  function getFill(muscle: string): string {
    if (primarySet.has(muscle)) return accentColour;
    if (secondarySet.has(muscle)) return `${accentColour}40`;
    return "var(--ink-2)";
  }

  function getOpacity(muscle: string): number {
    if (primarySet.has(muscle)) return 0.85;
    if (secondarySet.has(muscle)) return 0.4;
    return 0.25;
  }

  return (
    <div className="flex items-center justify-center gap-4" style={{ height }}>
      {/* Front view */}
      <div className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 100 100" className="w-auto" style={{ height: height - 20 }}>
          {/* Body outline */}
          <ellipse cx="50" cy="14" rx="10" ry="12" fill="var(--ink-2)" opacity="0.3" />
          <path
            d="M 38,24 Q 28,22 26,30 L 24,60 L 32,60 L 34,48 L 34,62 L 36,82 L 36,98 L 46,98 L 48,82 L 48,62 L 52,62 L 52,82 L 54,98 L 64,98 L 64,82 L 66,62 L 66,48 L 68,60 L 76,60 L 74,30 Q 72,22 62,24 Z"
            fill="var(--ink-2)"
            opacity="0.15"
          />
          {Object.entries(FRONT_MUSCLES).map(([name, path]) => (
            <path
              key={name}
              d={path}
              fill={getFill(name)}
              opacity={getOpacity(name)}
              rx="2"
            />
          ))}
        </svg>
        <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)] uppercase">
          Front
        </span>
      </div>

      {/* Back view */}
      <div className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 100 100" className="w-auto" style={{ height: height - 20 }}>
          <ellipse cx="50" cy="14" rx="10" ry="12" fill="var(--ink-2)" opacity="0.3" />
          <path
            d="M 38,24 Q 28,22 26,30 L 24,60 L 32,60 L 34,48 L 34,62 L 36,82 L 36,98 L 46,98 L 48,82 L 48,62 L 52,62 L 52,82 L 54,98 L 64,98 L 64,82 L 66,62 L 66,48 L 68,60 L 76,60 L 74,30 Q 72,22 62,24 Z"
            fill="var(--ink-2)"
            opacity="0.15"
          />
          {Object.entries(BACK_MUSCLES).map(([name, path]) => (
            <path
              key={name}
              d={path}
              fill={getFill(name)}
              opacity={getOpacity(name)}
              rx="2"
            />
          ))}
        </svg>
        <span className="text-[9px] text-ink-3 font-[family-name:var(--font-mono)] uppercase">
          Back
        </span>
      </div>
    </div>
  );
}
