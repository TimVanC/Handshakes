/**
 * JerseyRenderer — generic, era-styled NBA jersey as pure SVG.
 * No logos, no wordmarks, no team names: colorway + number + era cut only.
 *
 * eraStyle changes the silhouette + trim treatment so the decade reads visually:
 *   classic   — 70s/80s: narrow cut, thin single trim, high armholes
 *   nineties  — 90s: wider cut, thick double trim, side panel stripe
 *   baggy     — 2000s: longest/widest cut, heavy contrast piping
 *   modern    — 2010s+: clean minimal, thin trim, subtle side accent
 *
 * Usage:
 *   <JerseyRenderer primary="#552583" secondary="#FDB927" trim="#FFFFFF"
 *                   number={21} eraStyle="classic" size={160} />
 */

export type EraStyle = "classic" | "nineties" | "baggy" | "modern";

export interface JerseyProps {
  primary: string;
  secondary: string;
  trim: string;
  number: number | null; // null → render "?" (unknown number)
  eraStyle: EraStyle;
  size?: number; // rendered width in px; height = 1.15 * size
}

/** Silhouette + trim parameters per era. Tuned by eye — tweak freely. */
const ERA = {
  classic: { shoulderW: 34, bodyW: 72, bodyH: 88, neckW: 22, neckD: 14, trimW: 2.5, sidePanel: false, doubleTrim: false },
  nineties: { shoulderW: 40, bodyW: 82, bodyH: 92, neckW: 24, neckD: 15, trimW: 4, sidePanel: true, doubleTrim: true },
  baggy: { shoulderW: 44, bodyW: 90, bodyH: 100, neckW: 26, neckD: 16, trimW: 5, sidePanel: true, doubleTrim: false },
  modern: { shoulderW: 38, bodyW: 78, bodyH: 94, neckW: 24, neckD: 13, trimW: 2, sidePanel: true, doubleTrim: false },
} as const;

export default function JerseyRenderer({
  primary,
  secondary,
  trim,
  number,
  eraStyle,
  size = 160,
}: JerseyProps) {
  const e = ERA[eraStyle];
  const W = 100; // viewBox units
  const H = 115;
  const cx = W / 2;

  const top = 6;
  const shoulderHalf = e.shoulderW / 2;
  const bodyHalf = e.bodyW / 2;
  const armDepth = 26; // how far down the armhole cuts
  const bottom = top + e.bodyH;

  // Jersey body outline (tank silhouette)
  const bodyPath = [
    `M ${cx - shoulderHalf} ${top}`,
    // left shoulder strap outer edge → armhole curve → body side
    `C ${cx - shoulderHalf - 4} ${top + 8}, ${cx - bodyHalf} ${top + armDepth - 8}, ${cx - bodyHalf} ${top + armDepth}`,
    `L ${cx - bodyHalf} ${bottom - 4}`,
    `Q ${cx - bodyHalf} ${bottom}, ${cx - bodyHalf + 4} ${bottom}`,
    `L ${cx + bodyHalf - 4} ${bottom}`,
    `Q ${cx + bodyHalf} ${bottom}, ${cx + bodyHalf} ${bottom - 4}`,
    `L ${cx + bodyHalf} ${top + armDepth}`,
    `C ${cx + bodyHalf} ${top + armDepth - 8}, ${cx + shoulderHalf + 4} ${top + 8}, ${cx + shoulderHalf} ${top}`,
    // neckline (scoop)
    `L ${cx + e.neckW / 2} ${top}`,
    `Q ${cx} ${top + e.neckD * 1.6}, ${cx - e.neckW / 2} ${top}`,
    `Z`,
  ].join(" ");

  // Armhole trim arcs (drawn as strokes along the armhole curves)
  const leftArm = `M ${cx - shoulderHalf} ${top} C ${cx - shoulderHalf - 4} ${top + 8}, ${cx - bodyHalf} ${top + armDepth - 8}, ${cx - bodyHalf} ${top + armDepth}`;
  const rightArm = `M ${cx + shoulderHalf} ${top} C ${cx + shoulderHalf + 4} ${top + 8}, ${cx + bodyHalf} ${top + armDepth - 8}, ${cx + bodyHalf} ${top + armDepth}`;
  const neck = `M ${cx - e.neckW / 2} ${top} Q ${cx} ${top + e.neckD * 1.6}, ${cx + e.neckW / 2} ${top}`;

  const numText = number === null ? "?" : String(number);
  // Number sizing: single digits bigger
  const numFontSize = numText.length > 1 ? 34 : 40;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={size * (H / W)}
      role="img"
      aria-label={`${eraStyle} era jersey, number ${numText}`}
    >
      <defs>
        {/* subtle fabric shading so flat colors don't look like paint chips */}
        <linearGradient id={`shade-${eraStyle}-${primary}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
        <clipPath id={`bodyclip-${eraStyle}-${primary}-${numText}`}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      {/* body fill */}
      <path d={bodyPath} fill={primary} stroke={trim} strokeWidth={1} />

      {/* era details, clipped to body */}
      <g clipPath={`url(#bodyclip-${eraStyle}-${primary}-${numText})`}>
        {/* side panels (90s/2000s/modern) */}
        {e.sidePanel && (
          <>
            <rect x={cx - bodyHalf} y={top + armDepth} width={7} height={e.bodyH} fill={secondary} opacity={eraStyle === "modern" ? 0.85 : 1} />
            <rect x={cx + bodyHalf - 7} y={top + armDepth} width={7} height={e.bodyH} fill={secondary} opacity={eraStyle === "modern" ? 0.85 : 1} />
          </>
        )}
        {/* bottom hem trim */}
        <rect x={0} y={bottom - e.trimW * 1.6} width={W} height={e.trimW * 1.6} fill={secondary} />
        {e.doubleTrim && (
          <rect x={0} y={bottom - e.trimW * 3.4} width={W} height={e.trimW * 0.9} fill={trim} />
        )}
        {/* shading */}
        <path d={bodyPath} fill={`url(#shade-${eraStyle}-${primary})`} />
      </g>

      {/* neck + armhole trim */}
      {[neck, leftArm, rightArm].map((d, i) => (
        <g key={i}>
          <path d={d} fill="none" stroke={secondary} strokeWidth={e.trimW} />
          {e.doubleTrim && (
            <path d={d} fill="none" stroke={trim} strokeWidth={e.trimW * 0.4} />
          )}
        </g>
      ))}

      {/* number — block athletic style. For production, load a true varsity
          block font (e.g. via @font-face) and set fontFamily to it. */}
      <text
        x={cx}
        y={top + e.bodyH * 0.56}
        textAnchor="middle"
        fontFamily="'Archivo Black','Arial Black',sans-serif"
        fontWeight={900}
        fontSize={numFontSize}
        fill={secondary}
        stroke={trim}
        strokeWidth={1.4}
        paintOrder="stroke"
        style={{ letterSpacing: "-0.02em" }}
      >
        {numText}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Helper: resolve a stint to its colorway entry from colorways.json   */
/* ------------------------------------------------------------------ */

export interface ColorwayEra {
  key: string;
  years: [number, number];
  identity: string;
  primary: string;
  secondary: string;
  trim: string;
  eraStyle: EraStyle;
  confidence: "high" | "medium" | "low";
}

export type ColorwayDB = { franchises: Record<string, ColorwayEra[]> };

/**
 * Pick the era covering the majority of a stint. startYear/endYear are
 * season START years. Falls back to nearest era if there's a data gap.
 */
export function resolveColorway(
  db: ColorwayDB,
  franchise: string,
  startYear: number,
  endYear: number
): ColorwayEra | null {
  const eras = db.franchises[franchise];
  if (!eras?.length) return null;

  let best: ColorwayEra | null = null;
  let bestOverlap = -1;
  for (const era of eras) {
    const overlap =
      Math.min(endYear, era.years[1]) - Math.max(startYear, era.years[0]) + 1;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = era;
    }
  }
  return best;
}
