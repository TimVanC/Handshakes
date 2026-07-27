import { HINT_COUNT } from "./state";
import type { Sport } from "../sports/types";

/** 🔍 reads as a clue pulled from the player profile ladder. The jersey
 *  emoji is per sport: 🎽 for NBA (closest thing to a singlet in the
 *  emoji set), 🏈 / ⚾ for the others — the ball reads instantly. */
const HINT = "🔍";

const ORIGIN = "https://journeymanjersey.com";

/** The link a share lands on: `https://journeymanjersey.com/nfl`.
 *
 *  A share sits in a message body next to links from every other daily
 *  game, and those are bare domains. A query string of tracking params
 *  reads as spam there, so the sport rides in the path and the URL
 *  carries nothing a human wouldn't want to see. Absolute and https so it
 *  autolinks reliably in SMS and Android clients.
 *
 *  Attribution comes from the path itself rather than from utm params:
 *  Vercel Analytics breaks down by page path natively, and PostHog gets
 *  `$pathname` on every `$pageview`, so "/nfl" separates league share
 *  traffic in both tools with nothing in the URL. The tradeoff is that a
 *  landing on /nfl can't be told apart from someone typing or bookmarking
 *  it — in practice that's noise, and if it ever needs to be airtight the
 *  answer is a share-only prefix like /g/nfl, not a param.
 *
 *  Landing on a sport path implies "play now" — see AUTO_PLAY in App.tsx.
 *  It skips the start screen but NOT the rules: the board auto-opens
 *  HelpModal for anyone who has never dismissed it, so a first-timer
 *  still gets the how-to-play, over a board with the first jersey already
 *  dealt rather than in front of one.
 *
 *  `day` is set ONLY for an archive replay, and is the one case that
 *  still takes a query param. A share of the *live* day deliberately
 *  omits it so the link never goes stale: these get opened the next
 *  morning as a matter of course, and a day-stamped link read a day late
 *  resolves to an archive replay — which, for the signed-out first-time
 *  visitor a share is meant to win, is the members-only archive gate
 *  rather than a puzzle. */
export function buildShareUrl(sport: Sport, day: number | null): string {
  return `${ORIGIN}/${sport}${day !== null ? `?d=${day}` : ""}`;
}

/** Share text. One idea per line, score on its own line under the rank:
 *
 *    Journeyman NFL #12 · All-Pro
 *    375 pts
 *    🏈🏈🏈🏈🏈🏈🏈 7/7
 *    🔍🔍🔍 3/5
 *    https://journeymanjersey.com/nfl
 *
 *  Each jersey emoji is a jersey you had to flip and each 🔍 a hint you
 *  had to burn — the icons carry the meaning, no words needed. Wrong
 *  guesses aren't listed: a miss auto-burns the next jersey or hint, so
 *  it's already counted in the rows above. The daily percentile stays an
 *  in-app stat only; it doesn't travel in the share.
 *
 *  Four short lines and a bare link — it has to sit in a message body
 *  next to shares from every other daily game without looking like spam. */
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
