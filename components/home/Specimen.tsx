/**
 * One specimen, drawn. Everything about how a specimen looks is here and in
 * lib/home/specimen.ts; the plate's layout only says which item, how big,
 * and whether it is done. Replace the artwork (engravings, generated art)
 * by changing these two files and nothing else.
 *
 * Unfinished, a specimen is an ink drawing. Done, colour floods in.
 */
import { specimen, SPECIMEN_VIEWBOX } from "@/lib/home/specimen";

const INK = "#ece6d2";
const SHADE = "#10120e";

export function Specimen({
  species,
  seed,
  done,
  size = "main",
  title,
  draw = true,
}: {
  species: number;
  seed: number;
  done: boolean;
  /** main: the large annotated figure, with the fine work. small: a margin figure, outline only. */
  size?: "main" | "small";
  /** Named for a screen reader; decorative when omitted. */
  title?: string;
  /** Draw the ink in on arrival (the large figure). */
  draw?: boolean;
}) {
  const main = size === "main";
  const p = specimen(species, seed, { detail: main });
  const ink = main && draw ? "plate-ink" : undefined;
  const capFill = done ? p.cap : "#181a16";
  const stemFill = done ? "#e9dfc4" : "#181a16";
  const clip = `cap-${species}-${seed}`;
  const w = main ? 2 : 6;
  return (
    <svg
      viewBox={`0 0 ${SPECIMEN_VIEWBOX.width} ${SPECIMEN_VIEWBOX.height}`}
      className={main ? "h-full w-full" : "h-[91px] w-[62px] flex-none"}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-done={done ? "true" : "false"}
      data-testid={main ? "specimen-main" : "specimen-small"}
    >
      {main ? (
        <defs>
          <clipPath id={clip}>
            <path d={p.capD} />
          </clipPath>
        </defs>
      ) : null}
      <path className={ink} pathLength={1} d={p.roots} stroke={INK} strokeOpacity={main ? 0.62 : 0.5} strokeWidth={main ? 1.2 : 3} strokeLinecap="round" fill="none" />
      {main ? <path d={p.ground} stroke={INK} strokeOpacity={0.5} strokeWidth={1} strokeLinecap="round" fill="none" /> : null}
      <path className="plate-paint" d={p.stemD} stroke={INK} strokeWidth={main ? 2 : 5} style={{ fill: stemFill }} />
      {main && p.stria ? <path className={ink} pathLength={1} d={p.stria} stroke={INK} strokeOpacity={0.4} strokeWidth={1} fill="none" /> : null}
      {main && p.ring ? <path className="plate-paint" d={p.ring} stroke={INK} strokeWidth={1.6} style={{ fill: stemFill }} /> : null}
      {p.underA ? <path d={p.underA} fill={SHADE} stroke={INK} strokeWidth={main ? 1.6 : 4} /> : null}
      {main && p.gills ? <path className={ink} pathLength={1} d={p.gills} stroke={INK} strokeOpacity={0.5} strokeWidth={1} fill="none" /> : null}
      <path className="plate-paint" d={p.capD} stroke={INK} strokeWidth={main ? 2.2 : w} style={{ fill: capFill }} />
      {main ? (
        <g clipPath={`url(#${clip})`}>
          <path className={ink} pathLength={1} d={p.hatch} stroke={INK} strokeOpacity={done ? 0.22 : 0.36} strokeWidth={1} fill="none" />
          <path d={p.stipple} stroke={INK} strokeOpacity={0.5} strokeWidth={1.7} strokeLinecap="round" fill="none" />
        </g>
      ) : null}
      {p.underB ? <path d={p.underB} fill={SHADE} fillOpacity={0.55} stroke={INK} strokeWidth={main ? 1.4 : 4} /> : null}
      {main && p.capLines ? <path d={p.capLines} stroke={INK} strokeOpacity={0.4} strokeWidth={1} fill="none" /> : null}
      {main && p.spots ? <path d={p.spots} stroke={INK} strokeOpacity={0.65} strokeWidth={1.4} fill="none" /> : null}
    </svg>
  );
}
