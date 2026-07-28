/**
 * Sport-agnostic colorway resolution. Each sport ships a colorways JSON in
 * the same shape: franchises keyed by MODERN tricode, each an array of era
 * entries. `eraStyle` is an opaque string here — each sport's jersey
 * renderer narrows it to its own era set (NBA cut eras, NFL stripe eras,
 * MLB placket/pullover eras).
 */

export interface ColorwayEra {
  key: string;
  /** season START years covered, inclusive */
  years: [number, number];
  /** era-correct identity label ("Vancouver Grizzlies", "Houston Oilers") */
  identity: string;
  primary: string;
  secondary: string;
  trim: string;
  eraStyle: string;
  /** era-correct city code when it differs from the modern franchise key
   *  (relocations/rebrands); NBA predates this field and maps identities
   *  in its config instead */
  tricode?: string;
  /** MLB: pinstriped body */
  pattern?: "pinstripe";
  confidence: "high" | "medium" | "low";
  /** Verification workflow (Session 5). `verified` is set ONLY by the owner
   *  from the review queue — never programmatically. Scheduling (Session 6)
   *  hard-gates on it. Default is `unverified`; `probable` was seeded from
   *  confidence:"high" entries, which is an opinion, not a verification. */
  status?: "verified" | "probable" | "unverified";
  verified_by?: string;
  verified_on?: string;
  source_note?: string;
}

export type ColorwayDB = { franchises: Record<string, ColorwayEra[]> };

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio: 1 = identical, 21 = black on white. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Should lettering in `ink` be outlined to stay legible on `body`?
 * A bright number on a dark jersey (Bengals orange on black) already
 * separates cleanly — outlining it just wraps it in a hard halo. Only
 * jerseys where the lettering would otherwise sink into the body need one.
 */
export function needsOutline(ink: string, body: string): boolean {
  return contrastRatio(ink, body) < 3;
}

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
