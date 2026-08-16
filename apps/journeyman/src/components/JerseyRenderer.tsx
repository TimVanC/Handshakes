import { useId } from "react";
import { needsOutline } from "../game/colorways";
import {
  BODY_PATHS,
  SECONDARY_PATHS,
  TRIM_PATHS,
  OUTLINE_PATHS,
  OUTLINE_DX,
} from "./jerseyPaths";

/**
 * JerseyRenderer v3 — generic, era-styled NBA jersey as pure SVG.
 * No logos, no wordmarks, no team names: colorway + number + era cut only.
 *
 * Artwork: user-supplied "Basketball Jersey.svg" (BasketballJersey.zip),
 * front view, decomposed into three recolorable regions + line-art overlay:
 *   body   → primary
 *   inner collar/armhole stripe → secondary
 *   outer collar/armhole stripe → trim
 *
 * eraStyle keeps the decade readable without changing the artwork:
 *   classic   — 70s/80s: narrower cut, both stripes in secondary (one thick band)
 *   nineties  — 90s: full cut, full two-tone trim
 *   baggy     — 2000s: widest/longest cut, two-tone trim + hem band
 *   modern    — 2010s+: trim cut, outer stripe blends into body (thin trim look)
 */

export type EraStyle = "classic" | "nineties" | "baggy" | "modern";

export interface JerseyProps {
  primary: string;
  secondary: string;
  trim: string;
  number: number | null; // null → render "?" (unknown number)
  eraStyle: EraStyle;
  size?: number; // rendered width in px; height = (H/W) * size
  /** era tricode stamped above the number once the stint is "spent" */
  label?: string | null;
}

/** Front jersey bounding box on the source sheet, with a little margin. */
const VB = { x: 121, y: 92, w: 190, h: 306 };
const CX = VB.x + VB.w / 2; // chest centerline
const CY = VB.y + VB.h / 2;
const INK = "#1d1a13";

/** Cut + stripe treatment per era. Tuned by eye — tweak freely. */
const ERA = {
  classic: { sx: 0.91, sy: 0.96, outerStripe: "secondary", hem: 0 },
  nineties: { sx: 1.0, sy: 1.0, outerStripe: "trim", hem: 0 },
  baggy: { sx: 1.07, sy: 1.05, outerStripe: "trim", hem: 16 },
  modern: { sx: 0.95, sy: 1.0, outerStripe: "primary", hem: 0 },
} as const;

export default function JerseyRenderer({
  primary,
  secondary,
  trim,
  number,
  eraStyle,
  size = 160,
  label = null,
}: JerseyProps) {
  const uid = useId();
  const e = ERA[eraStyle];
  // unknown number → big double "?" reading like a mystery jersey number
  const numText = number === null ? "??" : String(number);
  const numFontSize = number === null ? 92 : numText.length > 1 ? 60 : 70;
  // two-letter codes (NJ, SEA…) get extra size — they have the room
  const labelFontSize = (label?.length ?? 3) <= 2 ? 52 : 44;
  // lettering sits on the body, so that's what it has to stand out against.
  // Silver on a black Spurs jersey already separates; the trim outline just
  // muddies it (same call as the football renderer).
  const outlined = needsOutline(secondary, primary);
  const clipId = `jbody-${uid}`;
  const shadeId = `jshade-${uid}`;

  const outerStripeFill =
    e.outerStripe === "secondary" ? secondary : e.outerStripe === "primary" ? primary : trim;

  return (
    <svg
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      width={size}
      height={size * (VB.h / VB.w)}
      role="img"
      aria-label={`${eraStyle} era jersey, number ${numText}`}
    >
      <defs>
        {/* subtle fabric shading so flat colors don't look like paint chips */}
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.13" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={BODY_PATHS[0]} />
        </clipPath>
      </defs>

      <g transform={`translate(${CX} ${CY}) scale(${e.sx} ${e.sy}) translate(${-CX} ${-CY})`}>
        {/* body + shoulder gap piece; same-color strokes close the hairline
            anti-aliasing seams between adjacent regions */}
        {BODY_PATHS.map((d, i) => (
          <path key={`b${i}`} d={d} fill={primary} stroke={primary} strokeWidth={1.5} />
        ))}

        {/* outer stripe (yellow in source) */}
        {TRIM_PATHS.map((d, i) => (
          <path key={`t${i}`} d={d} fill={outerStripeFill} stroke={outerStripeFill} strokeWidth={1.2} />
        ))}

        {/* inner stripe (red in source) */}
        {SECONDARY_PATHS.map((d, i) => (
          <path key={`s${i}`} d={d} fill={secondary} stroke={secondary} strokeWidth={1.2} />
        ))}

        {/* 2000s hem band, clipped to the body */}
        {e.hem > 0 && (
          <g clipPath={`url(#${clipId})`}>
            <rect x={VB.x} y={VB.y + VB.h - e.hem - 8} width={VB.w} height={e.hem} fill={secondary} />
          </g>
        )}

        {/* fabric shading over the body */}
        <g clipPath={`url(#${clipId})`}>
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={`url(#${shadeId})`} />
        </g>

        {/* line-art overlay (drawn beside the colored art on the source sheet) */}
        <g transform={`translate(${OUTLINE_DX} 0)`}>
          {OUTLINE_PATHS.map((d, i) => (
            <path key={`o${i}`} d={d} fill={INK} opacity={0.9} />
          ))}
        </g>
      </g>

      {/* era tricode, revealed once a newer jersey is on the table —
          sized like a chest wordmark, just under the number's scale */}
      {label && (
        <text
          x={CX}
          y={CY - 7}
          textAnchor="middle"
          fontFamily="'Archivo Black','Arial Black',sans-serif"
          fontSize={labelFontSize}
          fill={secondary}
          stroke={outlined ? trim : "none"}
          strokeWidth={outlined ? 2 : 0}
          paintOrder="stroke"
          style={{ letterSpacing: "0.05em" }}
          aria-label={`Team: ${label}`}
        >
          {label}
        </text>
      )}

      {/* number — block athletic style, centered on the chest */}
      <text
        x={CX}
        y={CY + 83}
        textAnchor="middle"
        fontFamily="'Archivo Black','Arial Black',sans-serif"
        fontWeight={900}
        fontSize={numFontSize}
        fill={secondary}
        stroke={outlined ? trim : "none"}
        strokeWidth={outlined ? 2.5 : 0}
        paintOrder="stroke"
        style={{ letterSpacing: "-0.02em" }}
      >
        {numText}
      </text>
    </svg>
  );
}

/* Colorway resolution lives in ../game/colorways (sport-agnostic);
   the NBA identity→tricode mapping lives in ../sports/nba. */
