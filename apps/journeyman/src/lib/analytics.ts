import posthog from "posthog-js";
import { SPORT } from "../sports/active";
import type { Sport } from "../sports/types";

/** Single home for all product analytics. Components never touch PostHog
 *  directly — they call the typed helpers below, so every event stays
 *  consistent and swapping providers is a one-file change.
 *
 *  PostHog keys are read from Vite env (VITE_ prefix = shipped to the
 *  client, which is fine: the project key is public by design). If the
 *  key is absent the whole module no-ops, so local dev and preview builds
 *  without env vars run clean and never spam a real project. */

const KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let ready = false;

/** Boot PostHog once at app start. Safe to call when the key is missing —
 *  it simply does nothing and every track() below becomes a no-op. */
export function initAnalytics(): void {
  if (ready || !KEY) return;
  posthog.init(KEY, {
    api_host: HOST,
    // anonymous players — don't create a person profile until (if ever)
    // we identify someone; keeps this within PostHog's free anonymous tier
    person_profiles: "identified_only",
    // switching sports is a real navigation, so default pageview capture
    // already breaks traffic down by sport via the ?s= URL
    capture_pageview: true,
    // session replay records full sessions and eats the free tier fast on a
    // public game — we only want events + pageviews, not recordings
    disable_session_recording: true,
  });
  // every event from this page-load carries which game it was
  posthog.register({ sport: SPORT.sport });
  ready = true;
}

function track(event: string, props?: Record<string, unknown>): void {
  if (!ready) return;
  posthog.capture(event, props);
}

/** Player left the start screen and began today's puzzle. */
export function trackGameStarted(p: { sport: Sport; day: number }): void {
  track("game_started", p);
}

/** Fires exactly once when a game ends — the core funnel event. */
export function trackGameCompleted(p: {
  sport: Sport;
  day: number;
  won: boolean;
  /** jerseys on the table when it ended */
  revealed: number;
  total: number;
  hints: number;
  score: number;
  grade: string;
  hard: boolean;
  isArchive: boolean;
}): void {
  track("game_completed", p);
}

/** Player tapped share on the result card. */
export function trackShare(p: {
  sport: Sport;
  day: number;
  won: boolean;
  score: number;
}): void {
  track("share_clicked", p);
}

export type AccountCtaSource = "result" | "home" | "archive" | "stats";

/** Measures which account prompt gets anonymous players to open auth. */
export function trackAccountCta(p: {
  source: AccountCtaSource;
  action: "viewed" | "clicked";
}): void {
  track("account_cta", p);
}
