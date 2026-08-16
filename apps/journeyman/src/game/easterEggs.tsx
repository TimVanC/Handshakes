import { CrownIcon } from "../components/Icons";

/** Solve-celebration easter eggs for the most special answers: instead of
 *  generic confetti, themed shapes rain down (crowns for LeBron, unibrows
 *  for AD...). Pure SVG glyphs — no emoji anywhere. Matching is by
 *  normalized answer name, so accents and casing don't matter. */

interface GlyphProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export interface EasterEgg {
  Icon: (p: GlyphProps) => React.ReactNode;
  /** tint palette the falling pieces cycle through */
  colors: string[];
  /** what's raining, for the curious */
  label: string;
}

/* ---- glyphs (simple silhouettes that read at ~16-22px) ---- */

function Glyph({
  size = 18,
  className,
  style,
  filled = false,
  children,
}: GlyphProps & { filled?: boolean; children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The Brow — two eyes under one continuous eyebrow */
function UnibrowGlyph(p: GlyphProps) {
  return (
    <Glyph {...p} filled>
      <path d="M3.5 10.5 Q12 6 20.5 10.5 L20.5 13 Q12 8.5 3.5 13 Z" />
      <circle cx="7.5" cy="16.5" r="2" />
      <circle cx="16.5" cy="16.5" r="2" />
    </Glyph>
  );
}

/** Black Mamba — an S-curved snake */
function SnakeGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M5.5 19.5c4 1.5 5.5-2.5 3-4C5 13.5 6 9.5 10 10.5c4 1 6.5-.5 6-3.5-.4-2-2.8-2.6-4-1.5" />
      <circle cx="11.2" cy="4.6" r="1.4" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** the true Journeyman — a packed suitcase, always on the move */
function SuitcaseGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <rect x="3" y="7.5" width="18" height="12.5" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M8 7.5v12.5M16 7.5v12.5" />
    </Glyph>
  );
}

/** Slim Reaper — a scythe */
function ScytheGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M9 21 15 4" />
      <path d="M15 4c3.5.2 6.5 2 8 4.5-3.5-1.2-6.5-1-9 .5" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Superman — a flowing cape */
function CapeGlyph(p: GlyphProps) {
  return (
    <Glyph {...p} filled>
      <path d="M8 3h8l3 14.5c-2.5-1.8-4.2-1.2-5.2.8-1-1.5-2.6-1.5-3.6 0-1-2-2.7-2.6-5.2-.8L8 3z" />
    </Glyph>
  );
}

/* ---- the registry: only the most special of players ---- */

const EGGS: Record<string, EasterEgg> = {
  "lebron james": {
    Icon: CrownIcon,
    colors: ["#c9a227", "#e5c453", "#8c6239", "#1d1a13", "#b3852a"],
    label: "crowns for the King",
  },
  "anthony davis": {
    Icon: UnibrowGlyph,
    colors: ["#1d1a13", "#3a2c1c", "#55432c", "#6b6353"],
    label: "unibrows for The Brow",
  },
  "kobe bryant": {
    Icon: SnakeGlyph,
    colors: ["#552583", "#fdb927", "#1d1a13", "#7a5fa0"],
    label: "snakes for the Black Mamba",
  },
  "kevin durant": {
    Icon: ScytheGlyph,
    colors: ["#1d1a13", "#4a4a4a", "#007ac1", "#6b6353"],
    label: "scythes for the Slim Reaper",
  },
  "dwight howard": {
    Icon: CapeGlyph,
    colors: ["#c8102e", "#0057b8", "#e5c453", "#8f0f24"],
    label: "capes for Superman",
  },
  "ish smith": {
    Icon: SuitcaseGlyph,
    colors: ["#8c6239", "#b3855a", "#55432c", "#1d1a13"],
    label: "suitcases for the truest Journeyman of all",
  },
};

/** case/accent-insensitive lookup: "Manu Ginóbili" matches "manu ginobili" */
export function eggFor(answer: string): EasterEgg | null {
  const key = answer
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  return EGGS[key] ?? null;
}
