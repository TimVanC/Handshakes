import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import App from "./App";
import { initAnalytics } from "./lib/analytics";

// dev-only QA pages:
//   ?jerseys — every renderer × era × colorway, plus the icon sets
//   ?cards   — a real JerseyCard carrying every accolade for the league
//   ?inspect&p=N — a real puzzle, fully revealed with fronts + backs
// Available on localhost AND on Vercel preview builds (so branches can be
// reviewed on staging), but never on the live domain — these pages reveal
// artwork and card internals that would spoil the daily.
const qaAllowed =
  import.meta.env.DEV ||
  /(^localhost$|\.vercel\.app$)/.test(location.hostname);
const qaParams = new URLSearchParams(location.search);
const qa = !qaAllowed
  ? null
  : qaParams.has("jerseys")
    ? "jerseys"
    : qaParams.has("cards")
      ? "cards"
      : qaParams.has("playercards")
        ? "playercards"
        : qaParams.has("inspect")
          ? "inspect"
        : null;
const JerseyGallery = lazy(() => import("./components/JerseyGallery"));
const CardPreview = lazy(() => import("./components/CardPreview"));
const PlayerCardsPreview = lazy(() => import("./components/PlayerCardsPreview"));
const PuzzleInspectPreview = lazy(() => import("./components/PuzzleInspectPreview"));

initAnalytics();

// Session 6: DB-backed serving, flag-gated (VITE_SERVE_FROM_DB=1). With the
// flag off (the default) prefetch resolves immediately and mount timing is
// unchanged. With it on, one RPC (raced against a 1.5s timeout inside
// puzzleService) runs before mount; any failure falls back to the bundled
// arrays. No top-level await — a plain promise chain keeps this module
// synchronous for HMR and older targets.
const prefetch = (async () => {
  const { SERVE_FROM_DB, prefetchDbPuzzle } = await import("./lib/puzzleService");
  if (!SERVE_FROM_DB || qa) return;
  const { SPORT } = await import("./sports/active");
  const d = Number(qaParams.get("d"));
  await prefetchDbPuzzle(SPORT.sport, Number.isInteger(d) && d >= 1 ? d : null);
})();

prefetch.then(() =>
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {qa ? (
      <Suspense>
        {qa === "jerseys" ? (
          <JerseyGallery />
        ) : qa === "playercards" ? (
          <PlayerCardsPreview />
        ) : qa === "inspect" ? (
          <PuzzleInspectPreview />
        ) : (
          <CardPreview />
        )}
      </Suspense>
    ) : (
      <App />
    )}
    <Analytics />
  </StrictMode>
)
);
