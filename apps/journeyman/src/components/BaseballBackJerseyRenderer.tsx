import { useId } from "react";
import {
  BODY,
  COLLAR_TOP,
  HEM,
  OUTLINE,
  OUTLINE_DX,
  SLEEVE_BANDS,
  SLEEVE_STRIPES,
  SLEEVES,
} from "./baseballBackPaths";
/**
 * Era treatment for a baseball jersey:
 *   flannel  — pre-'72: chunky one-color bands
 *   pullover — '72-'86: sansabelt, waistband, no buttons
 *   buttoned — '87-'05: two-tone bands
 *   modern   — '06+: thinner accents
 */
export type BaseballEraStyle = "flannel" | "pullover" | "buttoned" | "modern";

/**
 * BaseballBackJerseyRenderer — the BACK of a generic MLB jersey, drawn
 * from the vendor sheet's own back view (bottom row of "Baseball Jersey
 * 1.svg"). Baseball numbers live on the back, so this is what the game
 * renders: no placket, no buttons, one clean torso panel.
 *
 * Regions: torso (primary, the pinstripe canvas), raglan sleeve/yoke arch
 * (secondary), cuff bands + their inner stripe, and a hem band for the
 * pullover era. The sheet's black line art is overlaid on top.
 *
 * The era tricode sits high on the back like a nameplate surname; the
 * number is large and centered below it.
 */

export interface BaseballBackJerseyProps {
  primary: string;
  secondary: string;
  trim: string;
  /** null = genuinely numberless (pre-1929, most Negro League clubs) —
   *  renders a blank back. The face-down deck passes "??" explicitly. */
  number: number | "??" | null;
  eraStyle: BaseballEraStyle;
  pinstripe?: boolean;
  size?: number;
  label?: string | null;
}

/** the back view's slot on the source sheet, with a little margin */
const VB = { x: 128, y: 494, w: 142.5, h: 166 };
const CX = 199.25; // chest/back centerline
const INK = "#1d1a13";

const ERA = {
  flannel: { hem: false, sleeveStripe: "secondary" },
  pullover: { hem: true, sleeveStripe: "trim" },
  buttoned: { hem: false, sleeveStripe: "trim" },
  modern: { hem: false, sleeveStripe: "primary" },
} as const;

export default function BaseballBackJerseyRenderer({
  primary,
  secondary,
  trim,
  number,
  eraStyle,
  pinstripe = false,
  size = 84,
  label = null,
}: BaseballBackJerseyProps) {
  const uid = useId();
  const e = ERA[eraStyle];
  const numText = number === null ? "" : String(number);
  // the torso panel runs y 510-652, so a baseline of 600 sits the number's
  // visual mass on the middle of the back rather than low on it
  const numFontSize = number === "??" ? 40 : numText.length > 1 ? 38 : 42;
  // two-letter codes (SD, KC, SF…) get extra size — they have the room
  const labelFontSize = (label?.length ?? 3) <= 2 ? 32 : 26;
  const shadeId = `bbksh-${uid}`;
  const pinId = `bbkpin-${uid}`;
  const clipId = `bbkclip-${uid}`;

  const pick = (which: "primary" | "secondary" | "trim") =>
    which === "primary" ? primary : which === "secondary" ? secondary : trim;

  return (
    <svg
      viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
      width={size}
      height={size * (VB.h / VB.w)}
      role="img"
      aria-label={
        number === null
          ? `${eraStyle} era baseball jersey back, no number`
          : `${eraStyle} era baseball jersey back, number ${numText}`
      }
    >
      <defs>
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.12" />
        </linearGradient>
        {/* pinstripes only ever run down the torso panel */}
        <clipPath id={pinId}>
          <path d={BODY} />
        </clipPath>
        <clipPath id={clipId}>
          <path d={BODY} />
          <path d={SLEEVES} />
        </clipPath>
      </defs>

      {/* torso */}
      <path d={BODY} fill={primary} stroke={primary} strokeWidth={0.6} />

      {pinstripe && (
        <g clipPath={`url(#${pinId})`}>
          {Array.from({ length: 15 }, (_, i) => {
            const x = 160 + i * 5.5;
            return (
              <rect key={i} x={x} y={VB.y} width={0.9} height={VB.h} fill={secondary} opacity={0.85} />
            );
          })}
        </g>
      )}

      {/* raglan sleeves + shoulder yoke (carries the collar band) */}
      <path d={SLEEVES} fill={secondary} stroke={secondary} strokeWidth={0.6} />
      <path d={COLLAR_TOP} fill={primary} stroke={primary} strokeWidth={0.4} />

      {/* cuff bands + their contrast stripe */}
      {SLEEVE_BANDS.map((d, i) => (
        <path key={`sb${i}`} d={d} fill={secondary} stroke={secondary} strokeWidth={0.4} />
      ))}
      {SLEEVE_STRIPES.map((d, i) => (
        <path key={`ss${i}`} d={d} fill={pick(e.sleeveStripe)} />
      ))}

      {/* pullover-era waistband */}
      {e.hem && <path d={HEM} fill={secondary} stroke={secondary} strokeWidth={0.4} />}

      {/* fabric shading */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill={`url(#${shadeId})`} />
      </g>

      {/* the sheet's own line art, shifted onto the colored art */}
      <g transform={`translate(${OUTLINE_DX} 0)`}>
        <path d={OUTLINE} fill={INK} opacity={0.9} />
      </g>

      {/* nameplate: era tricode across the upper back, like a surname */}
      {label && (
        <text
          x={CX}
          y={545}
          textAnchor="middle"
          fontFamily="'Archivo Black','Arial Black',sans-serif"
          fontSize={labelFontSize}
          fill={secondary}
          stroke={trim}
          strokeWidth={1}
          paintOrder="stroke"
          style={{ letterSpacing: "0.06em" }}
          aria-label={`Team: ${label}`}
        >
          {label}
        </text>
      )}

      {/* the big back number */}
      <text
        x={CX}
        y={label ? 600 : 592}
        textAnchor="middle"
        fontFamily="'Archivo Black','Arial Black',sans-serif"
        fontWeight={900}
        fontSize={numFontSize}
        fill={secondary}
        stroke={trim}
        strokeWidth={1.6}
        paintOrder="stroke"
        style={{ letterSpacing: "-0.02em" }}
      >
        {numText}
      </text>
    </svg>
  );
}
