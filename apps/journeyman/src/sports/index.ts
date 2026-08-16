import { nba } from "./nba";
import { nfl } from "./nfl";
import { mlb } from "./mlb";
import type { Sport, SportConfig } from "./types";

export const SPORTS: Record<Sport, SportConfig> = { nba, nfl, mlb };

export const SPORT_ORDER: Sport[] = ["nba", "nfl", "mlb"];

/** the other two leagues, in display order — for "play another game" links */
export function otherSports(sport: Sport): Sport[] {
  return SPORT_ORDER.filter((s) => s !== sport);
}

const LAST_SPORT_KEY = "journeyman:sport:v1";

function isSport(s: string | null): s is Sport {
  return s === "nba" || s === "nfl" || s === "mlb";
}

/** `/nfl` — the share-link shape. One path segment, nothing else; a
 *  deeper or unknown path is not a sport and falls through to the normal
 *  resolution order. Vercel rewrites every unmatched path to index.html
 *  (see vercel.json), so these never 404. */
export function sportFromPath(): Sport | null {
  const seg = location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  return isSport(seg) ? seg : null;
}

/** Which game this page-load is: `?s=nfl` wins, then a `/nfl` path, then
 *  the last sport played on this device, then NBA (the original).
 *
 *  `?s=` stays ahead of the path deliberately — every link that existed
 *  before paths did keeps resolving exactly as it used to, including the
 *  ones live NBA players have bookmarked. The bare domain is untouched:
 *  no path segment means no path match, and `/` falls through to
 *  last-played as it always has. */
export function resolveSport(): SportConfig {
  const param = new URLSearchParams(location.search).get("s");
  const fromPath = sportFromPath();
  const explicit = isSport(param) ? param : fromPath;
  if (explicit) {
    try {
      localStorage.setItem(LAST_SPORT_KEY, explicit);
    } catch {
      /* fine */
    }
    return SPORTS[explicit];
  }
  try {
    const last = localStorage.getItem(LAST_SPORT_KEY);
    if (isSport(last)) return SPORTS[last];
  } catch {
    /* fine */
  }
  return SPORTS.nba;
}

/** href into a sport's game, always explicit (`?s=nba` too — a bare path
 *  would fall back to the last-played sport and bounce the switch).
 *  Extra params (archive `d`, test `p`) ride along.
 *
 *  Rooted at `/`, not at the current pathname: navigating from `/nfl`
 *  would otherwise mint `/nfl?s=nba`, which resolves correctly (the param
 *  outranks the path) but reads like a bug in the address bar. */
export function sportHref(
  sport: Sport,
  extra?: Record<string, string | number>
): string {
  const q = new URLSearchParams();
  q.set("s", sport);
  for (const [k, v] of Object.entries(extra ?? {})) q.set(k, String(v));
  return `/?${q.toString()}`;
}
