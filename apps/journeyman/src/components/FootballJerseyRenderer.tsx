import { useId } from "react";
import { needsOutline } from "../game/colorways";
import {
  BASE,
  BODY,
  COLLAR,
  COLLAR_INNER,
  STRIPE_INNER,
  STRIPE_OUTER,
  YOKE,
} from "./footballJerseyPaths";

/**
 * FootballJerseyRenderer — generic, era-styled NFL jersey as pure SVG.
 * No logos, no wordmarks, no team names: colorway + number + era cut only.
 *
 * Artwork: user-supplied "Football_Jersey_NovaeMakersMart" SVG, front view
 * (V-neck), decomposed into recolorable regions:
 *   BODY   → primary (jersey body + sleeves)
 *   BASE   → depth layer peeking past the body at cuffs/hem (auto-darkened primary)
 *   YOKE   → shoulder yoke (subtle shade, or color-blocked in the modern era)
 *   STRIPE_OUTER/INNER → sleeve-cap stripe bands
 *   COLLAR → neck band
 *
 * eraStyle keeps the decade readable without changing the artwork:
 *   classic   — pre-'78: chunky single-color sleeve stripes, secondary collar
 *   stripes   — '78-'95: classic two-tone sleeve stripes
 *   nineties  — '96-'11: piping era — thin two-tone stripes, trim collar
 *   modern    — 2012+: no sleeve stripes, color-blocked shoulder yoke
 */

export type FootballEraStyle = "classic" | "stripes" | "nineties" | "modern";

export interface FootballJerseyProps {
  primary: string;
  secondary: string;
  trim: string;
  number: number | null; // null → render "?" (unknown number)
  eraStyle: FootballEraStyle;
  size?: number; // rendered width in px; height = (H/W) * size
  /** era tricode stamped above the number once the stint is "spent" */
  label?: string | null;
}

/** Front jersey bounding box on the source sheet, with a little margin. */
const VB = { x: 655, y: 310, w: 430, h: 428 };
const CX = 870; // chest centerline of the front view
const INK = "#1d1a13";

/** Stripe + yoke treatment per era. Tuned by eye — tweak freely.
 *  `labelY` drops the city code clear of the shoulder yoke: the
 *  color-blocked eras put a contrasting inverted-V across the shoulders,
 *  and a tricode sitting in it disappears into the secondary color. */
const ERA = {
  classic: { stripes: true, outerAs: "secondary", innerAs: "secondary", yokeBlock: false, collarAs: "secondary", sx: 0.95, labelY: 470 },
  stripes: { stripes: true, outerAs: "secondary", innerAs: "trim", yokeBlock: false, collarAs: "secondary", sx: 1.0, labelY: 470 },
  nineties: { stripes: true, outerAs: "trim", innerAs: "primary", yokeBlock: false, collarAs: "trim", sx: 1.0, labelY: 470 },
  // the yoke bottoms out at y=431.6, so the tricode has to start below it
  modern: { stripes: false, outerAs: "trim", innerAs: "trim", yokeBlock: true, collarAs: "secondary", sx: 0.97, labelY: 508 },
} as const;

export default function FootballJerseyRenderer({
  primary,
  secondary,
  trim,
  number,
  eraStyle,
  size = 96,
  label = null,
}: FootballJerseyProps) {
  const uid = useId();
  const e = ERA[eraStyle];
  const numText = number === null ? "??" : String(number);
  const numFontSize = number === null ? 96 : numText.length > 1 ? 88 : 96;
  // two-letter codes (GB, KC, SD…) get extra size — they have the room
  const labelFontSize = (label?.length ?? 3) <= 2 ? 66 : 54;
  // lettering sits on the body, so that's what it has to stand out against
  const outlined = needsOutline(secondary, primary);
  const clipId = `fbody-${uid}`;
  const shadeId = `fshade-${uid}`;

  const pick = (which: "primary" | "secondary" | "trim") =>
    which === "primary" ? primary : which === "secondary" ? secondary : trim;

  return (
    <svg
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      width={size}
      height={size * (VB.h / VB.w)}
      role="img"
      aria-label={`${eraStyle} era football jersey, number ${numText}`}
    >
      <defs>
        {/* subtle fabric shading so flat colors don't look like paint chips */}
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.13" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={BODY} />
        </clipPath>
      </defs>

      <g transform={`translate(${CX} 0) scale(${e.sx} 1) translate(${-CX} 0)`}>
        {/* depth layer: cuffs + lower hem peeking past the body — primary,
            then a black wash for an automatic darker shade of any colorway */}
        <path d={BASE} fill={primary} />
        <path d={BASE} fill="#000000" opacity={0.32} />

        {/* main body */}
        <path d={BODY} fill={primary} stroke={INK} strokeWidth={2.5} />

        {/* shoulder yoke: modern era color-blocks it; older eras keep it as
            a quiet fabric shade */}
        {e.yokeBlock ? (
          <path d={YOKE} fill={secondary} stroke={secondary} strokeWidth={1} />
        ) : (
          <path d={YOKE} fill="#000000" opacity={0.1} />
        )}

        {/* sleeve-cap stripes */}
        {e.stripes &&
          STRIPE_OUTER.map((d, i) => (
            <path key={`so${i}`} d={d} fill={pick(e.outerAs)} stroke={pick(e.outerAs)} strokeWidth={1} />
          ))}
        {e.stripes &&
          STRIPE_INNER.map((d, i) => (
            <path key={`si${i}`} d={d} fill={pick(e.innerAs)} stroke={pick(e.innerAs)} strokeWidth={1} />
          ))}

        {/* neckline: inner area + collar band */}
        <path d={COLLAR_INNER} fill={primary} />
        <path d={COLLAR} fill={pick(e.collarAs)} stroke={INK} strokeWidth={1.5} />

        {/* fabric shading over the body */}
        <g clipPath={`url(#${clipId})`}>
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={`url(#${shadeId})`} />
        </g>
      </g>

      {/* era tricode — sits between collar and number like a nameplate patch */}
      {label && (
        <text
          x={CX}
          y={e.labelY}
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

      {/* chest number — sits below the tricode, clear of the shoulder yoke */}
      <text
        x={CX}
        y={640}
        textAnchor="middle"
        fontFamily="'Archivo Black','Arial Black',sans-serif"
        fontWeight={900}
        fontSize={numFontSize}
        fill={secondary}
        stroke={outlined ? trim : "none"}
        strokeWidth={outlined ? 3 : 0}
        paintOrder="stroke"
        style={{ letterSpacing: "-0.02em" }}
      >
        {numText}
      </text>
    </svg>
  );
}
