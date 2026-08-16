/**
 * Sport registry. Launch is NBA-only, but nothing outside this file may
 * assume that: the graph, solver, engine, and UI all take the sport from
 * here. Adding a league = one entry + its data artifacts.
 *
 * URL shape is /hoops today, /pitch /ice /diamond when their day comes.
 */

export interface SportEntry {
  /** dataset sport key, e.g. "nba" */
  sport: string;
  /** URL path segment, e.g. "hoops" */
  slug: string;
  displayName: string;
  /** storage namespace — fully separate per sport (own streaks, own reset) */
  storagePrefix: string;
  /** colorways franchise key from a franchise id ("nba-okc" → "OKC") */
  colorwayKey(franchiseId: string): string;
  loadDataset(): Promise<unknown>;
  loadColorways(): Promise<unknown>;
}

export const SPORTS: SportEntry[] = [
  {
    sport: "nba",
    slug: "hoops",
    displayName: "Hoops",
    storagePrefix: "handshakes:hoops",
    colorwayKey: (franchiseId) => franchiseId.split("-").pop()!.toUpperCase(),
    loadDataset: () => import("@handshakes/sport-data/data/nba.json").then((m) => m.default),
    loadColorways: () =>
      import("@handshakes/jerseys/data/nba/colorways.json").then((m) => m.default),
  },
];

/** /hoops picks the sport; bare / falls through to the first (only) league. */
export function resolveSport(pathname: string): SportEntry {
  const seg = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return SPORTS.find((s) => s.slug === seg) ?? SPORTS[0];
}
