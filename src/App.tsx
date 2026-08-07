import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import Header from "./components/Header";
import JerseyCard, { DeckCard, GhostCard, type CardRect } from "./components/JerseyCard";
import HintTray from "./components/HintTray";
import GuessInput from "./components/GuessInput";
import ResultModal from "./components/ResultModal";
import AccountSavePrompt from "./components/AccountSavePrompt";
import HelpModal from "./components/HelpModal";
import StartScreen from "./components/StartScreen";
import Confetti from "./components/Confetti";
import AccountModal from "./components/AccountModal";
import ArchiveModal from "./components/ArchiveModal";
import SettingsModal from "./components/SettingsModal";
import GiveUpModal from "./components/GiveUpModal";
import { FlagIcon, FlipIcon, LockIcon } from "./components/Icons";
import { usePasswordRecovery, useSession } from "./lib/useAuth";
import { logPlay, pushResult } from "./lib/cloud";
import { trackAccountCta, trackGameCompleted, trackGameStarted } from "./lib/analytics";
import type { AccountCtaSource } from "./lib/analytics";
import { computeScore } from "./game/score";
import { computeGrade } from "./game/grade";
import { SPORT } from "./sports/active";
import { SPORTS, SPORT_ORDER, sportFromPath, sportHref } from "./sports";
import type { Sport } from "./sports/types";
import { rosterKey } from "./data/roster";
import { warnPuzzleData, warnRosterGaps } from "./data/validatePuzzles";
import { eggFor } from "./game/easterEggs";
import { getPhase, initialState, reducer, HINT_COUNT } from "./game/state";
import type { Stint } from "./game/types";
import { loadMode, saveMode, hasSeenHelp, markSeenHelp, type GameMode } from "./game/storage";
import { getDbPuzzle } from "./lib/puzzleService";

const storage = SPORT.storage;
const puzzles = SPORT.puzzles;

// authoring guards: roster schedule health + stint/colorway integrity,
// for every sport (data bugs shouldn't hide behind the sport you test in)
if (import.meta.env.DEV) {
  for (const s of SPORT_ORDER) {
    warnRosterGaps(SPORTS[s]);
    warnPuzzleData(SPORTS[s]);
  }
}

/** Measure in document coordinates so FLIP math is scroll-independent —
 *  the deck's smooth scrollIntoView is often still mid-flight when a reveal
 *  commits, and mixing rects from different scroll positions used to send
 *  the whole spread flying sideways by the scroll delta before settling. */
function docRect(el: HTMLElement): CardRect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    top: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  };
}

/** The day's puzzle.
 *
 *  "release" sports (NFL/MLB): puzzles[day-1] in authoring order — every
 *  puzzle airs exactly once and a freshly authored one schedules itself
 *  for the next open day, no list curation needed. Once the pool runs dry
 *  the days cycle it again (the dev validator counts the runway), so
 *  authoring is what prevents repeats.
 *
 *  "roster" sports (NBA): ROSTER[day-1] names the answer and serves its
 *  authored puzzle. Roster names not built yet fall back to cycling the
 *  verified pool, so a daily never 404s — authoring a puzzle with a
 *  matching `answer` flips its day live, no other wiring needed. */
function puzzleForDay(day: number): (typeof puzzles)[number] {
  // Session 6: a DB-served puzzle (prefetched in main.tsx behind
  // VITE_SERVE_FROM_DB) wins for its exact day; everything else — flag off,
  // RPC miss, timeout, day mismatch — falls through to the bundled arrays.
  const db = getDbPuzzle(day);
  if (db) return db as (typeof puzzles)[number];
  if (SPORT.scheduling === "release") {
    return puzzles[(day - 1) % puzzles.length];
  }
  const name = SPORT.roster[day - 1];
  if (name) {
    const built = puzzles.find((p) => rosterKey(p.answer) === rosterKey(name));
    if (built) return built;
  }
  return puzzles[(day - 1) % SPORT.dailyPool];
}

/** Test mode: ?p=3 forces puzzle 3 (1-based) in its own save slot;
 *  ?test drops you at puzzle 1. DEV BUILDS ONLY — in production the params
 *  are ignored and everyone gets the daily/archive, so future answers can't
 *  be browsed by anyone who guesses the URL.
 *  Archive mode: ?d=12 replays past daily puzzle #12 (free account only). */
function resolveGame(): {
  day: number;
  puzzle: (typeof puzzles)[number];
  testIndex: number | null;
  /** set when replaying a past daily puzzle from the archive */
  archiveDay: number | null;
} {
  const realDay = storage.currentDayNumber();
  const params = new URLSearchParams(location.search);
  if (import.meta.env.DEV) {
    let forced = Number(params.get("p"));
    if (!forced && params.has("test")) forced = 1;
    if (forced >= 1 && forced <= puzzles.length) {
      return { day: 9000 + forced, puzzle: puzzles[forced - 1], testIndex: forced, archiveDay: null };
    }
  }
  const archive = Number(params.get("d"));
  if (Number.isInteger(archive) && archive >= 1 && archive < realDay) {
    return {
      day: archive,
      puzzle: puzzleForDay(archive),
      testIndex: null,
      archiveDay: archive,
    };
  }
  return {
    day: realDay,
    puzzle: puzzleForDay(realDay),
    testIndex: null,
    archiveDay: null,
  };
}

function resetTestSlots() {
  for (let i = 1; i <= puzzles.length; i++) {
    localStorage.removeItem(storage.gameKey(9000 + i));
  }
  // scrub any test-day records left in the profile by older builds
  try {
    const raw = localStorage.getItem(storage.profileKey);
    if (raw) {
      const prof = JSON.parse(raw);
      for (const k of Object.keys(prof.history ?? {})) {
        if (Number(k) >= 9000) delete prof.history[k];
      }
      if ((prof.lastSolvedDay ?? 0) >= 9000) {
        prof.lastSolvedDay = null;
        prof.streak = 0;
      }
      localStorage.setItem(storage.profileKey, JSON.stringify(prof));
    }
  } catch {
    /* fine */
  }
  location.reload();
}

/** `?play=1` (from a home sport-card or a result-card "Play NFL" link)
 *  drops you straight onto the board, skipping this sport's start screen.
 *  A `/nfl` share path means the same thing — someone arriving on a league's
 *  own URL asked for that league, not for the hub — which is what keeps the
 *  shared link bare instead of trailing a `?play=1`. */
const AUTO_PLAY =
  new URLSearchParams(location.search).has("play") || sportFromPath() !== null;

export default function App() {
  const { day, puzzle, testIndex, archiveDay } = resolveGame();
  const total = puzzle.stints.length;
  const session = useSession(); // undefined = loading, null = signed out
  const [showAccount, setShowAccount] = useState(false);
  // which league's stats to open the locker on: the current game, or "all"
  // when opened from the multi-sport home screen
  const [accountScope, setAccountScope] = useState<Sport | "all">(SPORT.sport);
  // where to send someone once they finish signing up/in — the archive if
  // that's what they were reaching for, otherwise just back to the page
  const [afterAuth, setAfterAuth] = useState<"archive" | null>(null);
  const [accountSource, setAccountSource] = useState<AccountCtaSource>("stats");
  // which auth form the modal opens on: the sign-in button opens "signin",
  // every other signed-out entry point pitches sign-up
  const [accountView, setAccountView] = useState<"signup" | "signin">("signup");
  const openAccount = (
    scope: Sport | "all",
    next: "archive" | null = null,
    source: AccountCtaSource = "stats",
    view: "signup" | "signin" = "signup"
  ) => {
    setAccountScope(scope);
    setAfterAuth(next);
    setAccountSource(source);
    setAccountView(view);
    if (!session) trackAccountCta({ source, action: "clicked" });
    setShowAccount(true);
  };
  const [showArchive, setShowArchive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // a password-reset link landed here — open the locker modal straight onto
  // the new-password form ("reset") or the request-a-new-link form ("expired")
  const [pwRecovery, clearPwRecovery] = usePasswordRecovery();
  useEffect(() => {
    if (!pwRecovery) return;
    setShowAccount(true);
    // scrub the dead link's error hash so a refresh doesn't replay it (a
    // live recovery hash is consumed and cleared by supabase-js itself)
    if (pwRecovery === "expired")
      history.replaceState(null, "", location.pathname + location.search);
  }, [pwRecovery]);

  // scrub ?play from the address bar so a refresh doesn't re-skip the
  // start screen and the URL stays clean; also log the started game (the
  // player never hit the start screen's Play button that normally logs it)
  useEffect(() => {
    if (!AUTO_PLAY) return;
    const url = new URL(location.href);
    url.searchParams.delete("play");
    history.replaceState(null, "", url);
    if (testIndex === null && archiveDay === null && state.status === "playing") {
      trackGameStarted({ sport: SPORT.sport, day });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  const puzzleKey = rosterKey(puzzle.answer);
  const [state, dispatch] = useReducer(reducer, day, (d) => {
    const saved = storage.loadGameState(d);
    const fresh = () => initialState(d, puzzleKey);
    if (!saved) return fresh();
    // the slot is keyed by day, but the day's ANSWER can be hot-swapped
    // (an easy pick replaced mid-day) — a save stamped for a different
    // answer belongs to a game that no longer exists on this day
    if (saved.puzzleId !== undefined && saved.puzzleId !== puzzleKey) return fresh();
    // amnesty for the one swap that predates the stamp: NBA day 8 went
    // LeBron → Horry mid-day on 2026-07-22, so an unstamped save in that
    // slot can't prove which game it was — discard it. (History/streak
    // entries are untouched; recordResult keeps the first result.)
    // Safe to delete once day 8 is deep in the archive.
    if (saved.puzzleId === undefined && SPORT.sport === "nba" && d === 8) return fresh();
    // test puzzles replay forever: resume mid-game, but a finished
    // slot starts fresh on the next visit
    if (testIndex !== null && saved.status !== "playing") return fresh();
    return saved;
  });
  const [profile, setProfile] = useState(storage.loadProfile);
  // difficulty: hard = no card backs, no accolade hardware anywhere
  const [mode, setMode] = useState<GameMode>(loadMode);
  const hard = mode === "hard";
  // test mode, archive replays, and ?play links go straight to the board
  const [showStart, setShowStart] = useState(
    testIndex === null && archiveDay === null && !AUTO_PLAY
  );
  const [showResult, setShowResult] = useState(false);
  const [offerAccountAfterResult, setOfferAccountAfterResult] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [seenHelp, setSeenHelp] = useState(hasSeenHelp);
  const [celebrate, setCelebrate] = useState(false);
  const [justLost, setJustLost] = useState(false);
  // a non-fatal wrong guess shakes the whole spread "no" (fatal ones use justLost)
  const [justMissed, setJustMissed] = useState(false);
  // "flip all" broadcast — `n` bumps per press so every revealed card obeys
  // even if it drifted out of sync from an individual tap
  const [flipAll, setFlipAll] = useState({ back: false, n: 0 });
  // the white flag asks "are you sure?" before it forfeits the puzzle
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);

  const phase = getPhase(state, puzzle);
  const over = state.status !== "playing";

  // persist every move so a refresh resumes mid-game
  useEffect(() => storage.saveGameState(state), [state]);

  // win/lose effects only when it happens live, not on reload of a done game
  const prevStatus = useRef(state.status);
  useEffect(() => {
    if (prevStatus.current === "playing" && state.status === "won") setCelebrate(true);
    if (prevStatus.current === "playing" && state.status === "lost") setJustLost(true);
    prevStatus.current = state.status;
  }, [state.status]);

  // a wrong guess that doesn't end the game shakes the spread "no" — the
  // fatal one is already covered by justLost, so this only fires while playing
  const prevWrong = useRef(state.wrongGuesses.length);
  useEffect(() => {
    const grew = state.wrongGuesses.length > prevWrong.current;
    prevWrong.current = state.wrongGuesses.length;
    if (!grew || state.status !== "playing") return;
    setJustMissed(true);
    const t = setTimeout(() => setJustMissed(false), 600);
    return () => clearTimeout(t);
  }, [state.wrongGuesses.length, state.status]);

  // first-timers get the rules the moment they hit the board — once. After
  // the first dismissal (here or from the menu) it never auto-opens again.
  useEffect(() => {
    if (showStart || over || seenHelp) return;
    setShowHelp(true);
  }, [showStart, over, seenHelp]);

  // record win/loss exactly once, then pop the result card.
  // test games never touch the real streak/history; archive replays record
  // to their own ledger (stats yes, daily streak no) and sync to the cloud.
  const recorded = useRef(false);
  useEffect(() => {
    if (!over || recorded.current) return;
    recorded.current = true;
    const result = state.status === "won" ? state.revealed : "DNF";
    const score = computeScore(state, hard);
    // reloading a finished game re-runs this effect — the local record is the
    // "already counted" source of truth, checked BEFORE we write it, so cloud
    // pushes (especially the append-only plays log) fire exactly once ever
    const firstRecording =
      archiveDay !== null
        ? storage.loadArchiveResults()[day] === undefined
        : storage.loadProfile().history[day] === undefined;
    if (archiveDay !== null) {
      storage.recordArchiveResult(day, result);
      storage.recordLocalScore(day, score);
      if (firstRecording) void pushResult(SPORT.sport, day, result, true, score);
    } else if (testIndex === null) {
      setProfile(storage.recordResult(day, result));
      storage.recordLocalScore(day, score);
      if (firstRecording) void pushResult(SPORT.sport, day, result, false, score);
    }
    // anonymous play pool — powers "better than X% of today's players"
    if (testIndex === null && firstRecording) {
      void logPlay({
        sport: SPORT.sport,
        day,
        won: state.status === "won",
        revealed: state.status === "won" ? state.revealed : null,
        score,
        hard,
        isArchive: archiveDay !== null,
      });
      // product analytics — the core completion funnel event
      trackGameCompleted({
        sport: SPORT.sport,
        day,
        won: state.status === "won",
        revealed: state.revealed,
        total,
        hints: state.hintsRevealed,
        score,
        grade: computeGrade(state, puzzle, SPORT.gradeLabels).label,
        hard,
        isArchive: archiveDay !== null,
      });
      if (!session && archiveDay === null) setOfferAccountAfterResult(true);
    }
    const t = setTimeout(() => setShowResult(true), state.status === "won" ? 1100 : 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires once via the
    // `recorded` ref the moment `over` flips; state is frozen from then on
  }, [over, day, state.status, state.revealed, testIndex, archiveDay, hard]);

  // Let the result card land first, then place the account ask over it as a
  // distinct second step. Recaps do not re-trigger an offer dismissed earlier.
  useEffect(() => {
    if (!showResult || !offerAccountAfterResult || session) return;
    const t = window.setTimeout(() => setShowSavePrompt(true), 650);
    return () => window.clearTimeout(t);
  }, [showResult, offerAccountAfterResult, session]);

  const DECK_KEY = -1;
  const cardEls = useRef(new Map<number, HTMLElement>());
  const prevRects = useRef(new Map<number, CardRect>());

  // ---- flip-the-top-card reveal ----
  // Tapping the deck (or the reveal button) first flips the deck's top
  // card face-up in place, showing the incoming jersey; after a beat a
  // GhostCard flies that same card from the deck to its chronological
  // slot in one continuous motion — the deck reverts to face-down and the
  // real JerseyCard mounts (invisible until the ghost lands) at the exact
  // same instant, both hidden underneath the ghost the whole flight.
  const FLIP_REVEAL_MS = 850; // squeeze flip (~350ms) + a beat to read it
  const [flipIdx, setFlipIdx] = useState<number | null>(null);
  const flipTimer = useRef<number | null>(null);
  const dealtFromFlip = useRef(false);
  // the deck's on-screen rect at the instant the flip ends, and the stint
  // it was showing — captured BEFORE the deck snaps back to face-down, so
  // the ghost's flight starts from exactly where the flipped card was
  const flipOriginRect = useRef<CardRect | null>(null);
  const pendingGhostStint = useRef<Stint | null>(null);
  // the stint index currently mid-flip — a ref, not just the flipIdx state,
  // because finishFlip is scheduled via setTimeout from the SAME render
  // that calls setFlipIdx: its closure would otherwise see the stale
  // pre-click flipIdx (null) instead of the value just set
  const flipTargetIdx = useRef<number | null>(null);
  const [ghost, setGhost] = useState<{
    key: number;
    stint: Stint;
    from: CardRect;
    to: CardRect;
  } | null>(null);
  // the card that's about to fly, hidden from the VERY render it appears in.
  // `ghost` only gets set a render later (in the layout effect), so relying on
  // it alone would flash the real card at its final slot for one frame before
  // the ghost covers it. This bridges that gap; the ghost takes over once set.
  const [flightIdx, setFlightIdx] = useState<number | null>(null);

  const finishFlip = () => {
    if (flipTimer.current === null) return;
    clearTimeout(flipTimer.current);
    flipTimer.current = null;
    const deckEl = cardEls.current.get(DECK_KEY);
    flipOriginRect.current = deckEl ? docRect(deckEl) : null;
    pendingGhostStint.current =
      flipTargetIdx.current !== null ? puzzle.stints[flipTargetIdx.current] : null;
    setFlipIdx(null);
    dealtFromFlip.current = true;
    setFlightIdx(flipTargetIdx.current); // hide the incoming card on this render
    dispatch({ type: "reveal", puzzle });
  };

  const revealNext = () => {
    if (over || flipTimer.current !== null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // hints and reduced-motion reveals stay instant — only jersey flips stage
    if (phase !== "jerseys" || reduce) {
      dispatch({ type: "reveal", puzzle });
      return;
    }
    const idx = puzzle.revealOrder[state.revealed];
    flipTargetIdx.current = idx;
    setFlipIdx(idx);
    flipTimer.current = window.setTimeout(finishFlip, FLIP_REVEAL_MS);
  };

  useEffect(
    () => () => {
      if (flipTimer.current !== null) clearTimeout(flipTimer.current);
    },
    []
  );

  // ---- chronological spread with FLIP slide-into-place ----
  // once the game ends, every remaining stint cascades onto the board
  const revealedSet = new Set(puzzle.revealOrder.slice(0, state.revealed));
  const shownIdxs = over
    ? puzzle.stints.map((_, i) => i)
    : puzzle.revealOrder.slice(0, state.revealed);
  const revealedChrono = shownIdxs
    .map((stintIdx) => ({ stintIdx, stint: puzzle.stints[stintIdx] }))
    .sort(
      (a, b) => a.stint.startYear - b.stint.startYear || a.stintIdx - b.stintIdx
    );
  const newestIdx = puzzle.revealOrder[state.revealed - 1];
  // stagger the end-of-game cascade in career order
  const cascadeDelays = new Map<number, number>();
  if (over) {
    let n = 0;
    for (const { stintIdx } of revealedChrono) {
      if (!revealedSet.has(stintIdx)) cascadeDelays.set(stintIdx, 150 + n++ * 130);
    }
  }

  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // a reorder changes every card's --nudge, and the CSS translate
    // transition would wobble the cards during the slide's delay. Suppress
    // it for this frame so each card snaps to its final nudge before we
    // measure — the delta then rides along inside the slide instead.
    cardEls.current.forEach((el) => {
      el.style.transition = "none";
    });
    cardEls.current.forEach((el, key) => {
      const now = docRect(el);
      const last = prevRects.current.get(key);
      // brand-new in-game card
      if (!last && !reduce && !over && key === newestIdx && key !== DECK_KEY) {
        if (dealtFromFlip.current) {
          // the GhostCard flies from the deck to exactly this spot; this
          // real card stays invisible (see its `hidden` prop) until it
          // lands, so nothing here animates on its own
          if (flipOriginRect.current && pendingGhostStint.current) {
            setGhost({
              key: newestIdx,
              stint: pendingGhostStint.current,
              from: flipOriginRect.current,
              to: now,
            });
          }
        } else {
          // penalty reveal (wrong guess): dealt from under the deck
          const deckPrev = prevRects.current.get(DECK_KEY);
          if (deckPrev) {
            const dx = deckPrev.left - now.left;
            const dy = deckPrev.top - now.top;
            const clearZ = () => {
              el.style.zIndex = "";
            };
            el.style.zIndex = "1"; // beneath the deck (z 3) while emerging
            el.animate(
              [
                { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 0.9 },
                { transform: "translate(0, 0) scale(1)", opacity: 1 },
              ],
              { duration: 750, easing: "cubic-bezier(0.25, 0.9, 0.3, 1)", fill: "backwards" }
            ).finished.then(clearZ, clearZ);
          }
        }
      }
      if (last && !reduce && key !== newestIdx) {
        const dx = last.left - now.left;
        const dy = last.top - now.top;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          // NO delay: the displaced cards start clearing the insertion slot
          // immediately so it's empty before the ghost flies in (which is
          // itself held back ~140ms). Otherwise the old occupant sits in the
          // new card's slot and crosses the incoming ghost. Still slow enough
          // to watch the career re-order; the card lifts as it travels.
          el.style.zIndex = "5";
          const slide = el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) scale(1)` },
              {
                transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 12}px) scale(1.05)`,
                offset: 0.5,
              },
              { transform: "translate(0, 0) scale(1)" },
            ],
            {
              duration: 900,
              fill: "backwards",
              easing: "cubic-bezier(0.3, 0.8, 0.3, 1)",
            }
          );
          slide.finished
            .then(() => {
              el.style.zIndex = "";
            })
            .catch(() => {
              el.style.zIndex = "";
            });
        }
      }
      prevRects.current.set(key, now);
    });
    dealtFromFlip.current = false;
    flipOriginRect.current = null;
    pendingGhostStint.current = null;
    // hand off hiding to the ghost (now set) — or, if no ghost was created
    // (game-over cascade, missing rects), let the card show. Both updates
    // batch with setGhost into the next render, so hiding never lapses.
    setFlightIdx(null);
    // safe to restore immediately: the nudge has already snapped, so no
    // transition retriggers, and hover lifts keep animating afterwards
    cardEls.current.forEach((el) => {
      el.style.transition = "";
    });
  }, [state.revealed, newestIdx, over]);

  const remaining = total - state.revealed;

  // player profile: full reveal once the game ends; on mobile it fills the
  // leftover columns of the spread's last row when the count isn't a
  // multiple of 3, otherwise it sits above the spread
  const showProfile = over || phase === "hints" || phase === "final";
  const profileRevealed = over ? HINT_COUNT : state.hintsRevealed;
  const profileInGrid = total % 3 !== 0;

  const revealLabel =
    phase === "jerseys"
      ? `Flip jersey (+1)`
      : phase === "hints"
        ? "Take a hint"
        : phase === "final"
          ? "Give up"
          : "See result";

  // the archive is a free-account perk — anonymous visitors get today's
  // puzzle only, plus a friendly pitch instead of a wall
  if (archiveDay !== null && !session) {
    return (
      <div className="start-screen" role="dialog" aria-label="Archive — members only">
        <div className="my-auto flex w-full max-w-sm flex-col items-center px-6 py-6 text-center">
          <LockIcon size={34} className="text-wood-deep" />
          <h1 className="font-display mt-4 text-3xl tracking-wide">THE ARCHIVE</h1>
          {session === undefined ? (
            <p className="mt-3 text-sm text-ink-soft">Checking your locker…</p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                Past puzzles are a perk for members — and membership is{" "}
                <strong className="text-ink">100% free</strong>. Sign up to
                replay every previous Journeyman and keep your streaks and
                stats safe across devices.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-5 w-full py-3"
                onClick={() => setShowAccount(true)}
              >
                Create a free account
              </button>
              <a className="btn mt-2.5 w-full" href={sportHref(SPORT.sport)}>
                Back to today's puzzle
              </a>
            </>
          )}
        </div>
        {showAccount && (
          <AccountModal
            session={session ?? null}
            defaultScope={accountScope}
            signupContext="archive"
            onClose={() => setShowAccount(false)}
            // signing up here unlocks the archive replay behind this gate —
            // drop the form and let the board show, no stats detour
            onAuthed={() => setShowAccount(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh pb-40">
      <div className="court-arc" aria-hidden="true" />
      <Header
        onHelp={() => setShowHelp(true)}
        onStats={() => openAccount(SPORT.sport)}
        onArchive={() => setShowArchive(true)}
        onSettings={() => setShowSettings(true)}
      />

      {/* dev builds always show the picker; production only via ?p / ?test */}
      {(testIndex !== null || import.meta.env.DEV) && (
        <div className="test-bar" role="navigation" aria-label="Test mode puzzle picker">
          <span className="test-bar-tag">Test</span>
          <a
            href={sportHref(SPORT.sport)}
            className={`test-bar-slot ${testIndex === null ? "is-active" : ""}`}
            aria-current={testIndex === null ? "page" : undefined}
          >
            daily
          </a>
          {puzzles.map((pz, i) => (
            <a
              key={pz.id}
              href={sportHref(SPORT.sport, { p: i + 1 })}
              className={`test-bar-slot ${i + 1 === testIndex ? "is-active" : ""}`}
              aria-current={i + 1 === testIndex ? "page" : undefined}
            >
              {i + 1}
            </a>
          ))}
          <button type="button" className="test-bar-slot" onClick={resetTestSlots}>
            reset
          </button>
        </div>
      )}

      <main className="relative z-0">
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 text-center text-[0.7rem] font-bold uppercase tracking-[0.2em] text-ink-soft">
          {/* white flag — forfeit the whole puzzle from anywhere in the game,
              mirroring the flip-all control on the other side of the counter.
              It only opens the confirm; the actual give_up is dispatched from
              the modal so a stray tap can't end the game. */}
          {!over && (
            <button
              type="button"
              className="flip-all"
              aria-label="Give up on this puzzle"
              title="Give up"
              onClick={() => setConfirmGiveUp(true)}
            >
              <FlagIcon size={16} />
            </button>
          )}
          <span>
            Puzzle #{day} · jersey {state.revealed} of {total}
          </span>
          {/* reading every card back one tap at a time is the tedious part —
              this turns the whole spread over at once. Two cards minimum:
              below that it's the same work as tapping the card.
              Icon only, deliberately: the "Show backs"/"Show fronts" label
              pair is parked, not lost — see _brief/flip-all-control.md. */}
          {!hard && state.revealed > 1 && (
            <button
              type="button"
              className="flip-all"
              aria-pressed={flipAll.back}
              aria-label={flipAll.back ? "Turn all cards face up" : "Turn all cards over"}
              title={flipAll.back ? "Turn all cards face up" : "Turn all cards over"}
              onClick={() => setFlipAll((f) => ({ back: !f.back, n: f.n + 1 }))}
            >
              <FlipIcon size={16} />
            </button>
          )}
        </p>
        {archiveDay !== null && (
          <p className="mt-1 text-center text-[0.65rem] text-ink-soft">
            Archive replay — counts in stats, not your streak ·{" "}
            <a className="underline" href={sportHref(SPORT.sport)}>
              back to today
            </a>
          </p>
        )}

        {showProfile && (
          <HintTray
            variant="strip"
            hints={puzzle.hints}
            revealedCount={profileRevealed}
            className={profileInGrid ? "max-md:hidden" : ""}
          />
        )}

        {/* the collector spread — always in career order */}
        <div className="card-spread">
          <div className={`card-row ${justLost || justMissed ? "shake" : ""}`}>
            {revealedChrono.map(({ stintIdx, stint }, i) => (
              <JerseyCard
                key={stintIdx}
                stint={stint}
                spreadIndex={i}
                isNewest={
                  over
                    ? cascadeDelays.has(stintIdx)
                    : stintIdx === newestIdx && state.revealed > 1
                }
                showLabel
                dealDelay={cascadeDelays.get(stintIdx) ?? 0}
                hidden={ghost?.key === stintIdx || flightIdx === stintIdx}
                hard={hard}
                flipAll={flipAll}
                cardRef={(el) => {
                  if (el) cardEls.current.set(stintIdx, el);
                  else cardEls.current.delete(stintIdx);
                }}
              />
            ))}
            {!over && remaining > 0 && (
              <DeckCard
                remaining={remaining}
                tiltIndex={state.revealed}
                flipStint={flipIdx !== null ? puzzle.stints[flipIdx] : null}
                sizerStint={puzzle.stints[puzzle.revealOrder[0]]}
                hard={hard}
                onReveal={revealNext}
                cardRef={(el) => {
                  if (el) cardEls.current.set(-1, el);
                  else cardEls.current.delete(-1);
                }}
              />
            )}
            {showProfile && profileInGrid && (
              <HintTray
                variant="cell"
                hints={puzzle.hints}
                revealedCount={profileRevealed}
                span={3 - (total % 3)}
                className="md:hidden"
              />
            )}
          </div>
        </div>

        {phase === "final" && (
          <p className="px-4 pb-2 text-center text-sm font-bold text-[#a13333]">
            The player profile is wide open. One final guess.
          </p>
        )}
      </main>

      {/* guess bar — thumb zone on mobile */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-paper/95 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 backdrop-blur-sm">
        {state.wrongGuesses.length > 0 && (
          <div className="mx-auto max-w-xl px-4 pb-2" aria-label="Wrong guesses">
            <ul className="flex flex-wrap justify-center gap-1.5">
              {state.wrongGuesses.map((g) => (
                <li key={g} className="chip chip-miss text-xs">
                  {g}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mx-auto flex max-w-xl items-stretch gap-2 px-4">
          <GuessInput
            disabled={over}
            alreadyGuessed={state.wrongGuesses}
            onGuess={(name) => {
              finishFlip(); // a guess mid-flip settles the pending reveal first
              dispatch({ type: "guess", puzzle, name });
            }}
          />
          <button
            type="button"
            className="btn shrink-0"
            onClick={() =>
              over
                ? setShowResult(true)
                : phase === "final"
                  ? dispatch({ type: "give_up" })
                  : revealNext()
            }
          >
            {revealLabel}
          </button>
        </div>
        {phase === "hints" && (
          <p className="mt-1.5 text-center text-[0.68rem] text-ink-soft">
            All jerseys are out — hints left: {HINT_COUNT - state.hintsRevealed}
          </p>
        )}
      </div>

      {ghost && (
        <GhostCard
          key={ghost.key}
          stint={ghost.stint}
          from={ghost.from}
          to={ghost.to}
          hard={hard}
          onArrived={() => {
            setGhost(null);
            setFlightIdx(null);
          }}
        />
      )}

      {celebrate && <Confetti egg={eggFor(puzzle.answer)} />}

      {confirmGiveUp && !over && (
        <GiveUpModal
          onClose={() => setConfirmGiveUp(false)}
          onGiveUp={() => {
            setConfirmGiveUp(false);
            finishFlip(); // a surrender mid-flip settles the pending reveal first
            dispatch({ type: "give_up" });
          }}
        />
      )}

      {showStart && (
        <StartScreen
          onPlay={() => {
            setShowStart(false);
            if (over) setShowResult(true);
            else trackGameStarted({ sport: SPORT.sport, day });
          }}
          onRules={() => setShowHelp(true)}
          onSettings={() => setShowSettings(true)}
          onArchive={() => setShowArchive(true)}
          onStats={() => openAccount("all")}
          onAccount={() => openAccount("all", null, "home")}
          onSignIn={() => openAccount("all", null, "home", "signin")}
          signedIn={!!session}
        />
      )}
      {showHelp && (
        <HelpModal
          home={showStart}
          onClose={() => {
            setShowHelp(false);
            if (!seenHelp) {
              markSeenHelp();
              setSeenHelp(true);
            }
          }}
        />
      )}
      {showSettings && (
        <SettingsModal
          mode={mode}
          onMode={(m) => {
            setMode(m);
            saveMode(m);
          }}
          signedIn={!!session}
          onArchive={() => {
            setShowSettings(false);
            setShowArchive(true);
          }}
          onAccount={() => {
            setShowSettings(false);
            openAccount(SPORT.sport);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showResult && over && (
        <ResultModal
          puzzle={puzzle}
          state={state}
          streak={profile.streak}
          hard={hard}
          canRank={testIndex === null && archiveDay === null}
          onClose={() => setShowResult(false)}
          onStats={() => openAccount(SPORT.sport)}
          onArchive={() => setShowArchive(true)}
          onNext={
            testIndex !== null
              ? () => {
                  location.href = sportHref(SPORT.sport, {
                    p: (testIndex % puzzles.length) + 1,
                  });
                }
              : undefined
          }
          onReplay={
            testIndex !== null
              ? () => {
                  localStorage.removeItem(storage.gameKey(day));
                  location.reload();
                }
              : undefined
          }
        />
      )}
      {showSavePrompt && (
        <AccountSavePrompt
          onClose={() => {
            setShowSavePrompt(false);
            setOfferAccountAfterResult(false);
          }}
          onSignUp={() => {
            setShowSavePrompt(false);
            setOfferAccountAfterResult(false);
            openAccount(SPORT.sport, null, "result");
          }}
        />
      )}
      {/* archive and locker render after the result card so the buttons on
          it open them on TOP rather than underneath */}
      {showArchive && (
        <ArchiveModal
          session={session ?? null}
          onClose={() => setShowArchive(false)}
          onSignUp={() => {
            setShowArchive(false);
            openAccount("all", "archive", "archive"); // come back here once they're in
          }}
        />
      )}
      {showAccount && (
        <AccountModal
          session={session ?? null}
          defaultScope={accountScope}
          signupContext={accountSource}
          initialView={accountView}
          recovery={pwRecovery}
          onClose={() => {
            setShowAccount(false);
            // reopening the locker later shouldn't re-enter the reset flow
            clearPwRecovery();
          }}
          onAuthed={() => {
            // finishing sign-up drops the form, never the stats panel
            setShowAccount(false);
            if (afterAuth === "archive") setShowArchive(true);
            setAfterAuth(null);
          }}
        />
      )}
    </div>
  );
}
