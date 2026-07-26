import { HINT_COUNT } from "./state";
import type { Sport } from "../sports/types";

/** 🔍 reads as a clue pulled from the player profile ladder. The jersey
 *  emoji is per sport: 🎽 for NBA (closest thing to a singlet in the
 *  emoji set), 🏈 / ⚾ for the others — the ball reads instantly. */
const HINT = "🔍";

const ORIGIN = "https://journeymanjersey.com";

/** The link a share lands on. Absolute and https — a bare domain followed
 *  by a query string doesn't reliably autolink in SMS or some Android
 *  clients, and an unlinked share is a dead share.
 *
 *  Params are the ones the app already routes on (`sports/index.ts` for
 *  `s`, `App.tsx` for `d` and `play`) — no new routing, no router.
 *
 *  `day` is set ONLY for an archive replay. A share of the *live* day
 *  deliberately omits it so the link never goes stale: these get opened
 *  the next morning as a matter of course, and a day-stamped link read a
 *  day late resolves to an archive replay — which, for the signed-out
 *  first-time visitor a share is meant to win, is the members-only
 *  archive gate rather than a puzzle. Omitting `d` means "this sport,
 *  whatever's live", which is what a recipient wants in every case except
 *  the one where the sharer explicitly played an old day.
 *
 *  `play=1` skips the start screen. It does not skip the rules: the board
 *  auto-opens HelpModal for anyone who has never dismissed it, so a
 *  first-timer still gets the how-to-play — over a board with the first
 *  jersey already dealt, rather than in front of one.
 *
 *  utm_medium carries the sport so share traffic separates by league in
 *  PostHog and Vercel Analytics. PostHog reads utm_* off `$pageview`
 *  already; this needs no bespoke event. */
export function buildShareUrl(sport: Sport, day: number | null): string {
  const q = [`s=${sport}`];
  if (day !== null) q.push(`d=${day}`);
  q.push("play=1", "utm_source=share", `utm_medium=${sport}`);
  return `${ORIGIN}/?${q.join("&")}`;
}

/** Share text. One idea per line, score on its own line under the rank:
 *
 *    Journeyman NFL #12 · All-Pro
 *    375 pts
 *    🏈🏈🏈🏈🏈🏈🏈 7/7
 *    🔍🔍🔍 3/5
 *    https://journeymanjersey.com/?s=nfl&play=1&utm_source=share&utm_medium=nfl
 *
 *  Each jersey emoji is a jersey you had to flip and each 🔍 a hint you
 *  had to burn — the icons carry the meaning, no words needed. Wrong
 *  guesses aren't listed: a miss auto-burns the next jersey or hint, so
 *  it's already counted in the rows above. The daily percentile stays an
 *  in-app stat only; it doesn't travel in the share.
 *
 *  The link line is the only one allowed to grow — the rows above it are
 *  what keeps this inside one iMessage bubble. */
export function buildShareText(opts: {
  /** "Journeyman" / "Journeyman NFL" / "Journeyman MLB" */
  shareTag: string;
  /** the sport's flipped-jersey emoji */
  jerseyEmoji: string;
  /** which league's deep link the share should carry */
  sport: Sport;
  day: number;
  /** the day to deep-link to, or null for "whatever's live" — see
   *  buildShareUrl. NOT the same as `day`, which is the boast above. */
  linkDay: number | null;
  grade: string;
  score: number;
  /** jerseys on the table when it ended */
  revealed: number;
  total: number;
  hints: number;
  hard: boolean;
}): string {
  const { shareTag, jerseyEmoji: JERSEY, sport, day, linkDay, grade, score, revealed, total, hints, hard } =
    opts;

  const lines = [
    `${shareTag} #${day} · ${grade}${hard ? " · HARD" : ""}`,
    `${score} pts`,
    `${JERSEY.repeat(revealed)} ${revealed}/${total}`,
  ];
  if (hints > 0) {
    lines.push(`${HINT.repeat(hints)} ${hints}/${HINT_COUNT}`);
  }

  lines.push(buildShareUrl(sport, linkDay));
  return lines.join("\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback for older mobile browsers
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
