import { SPORT } from "../sports/active";
import { SPORTS, SPORT_ORDER, sportHref } from "../sports";
import type { Sport } from "../sports/types";
import { ChartIcon, FlameIcon, LockIcon, UserIcon } from "./Icons";
import HomeMenu from "./HomeMenu";
import HeroCards from "./HeroCards";

interface Props {
  /** enter the current league's board (or its recap if already done) */
  onPlay: () => void;
  onRules: () => void;
  onSettings: () => void;
  onArchive: () => void;
  onStats: () => void;
  onAccount: () => void;
  /** opens the account modal straight on the sign-in form */
  onSignIn: () => void;
  signedIn: boolean;
}

/** every league's jersey is drawn to the same height on the hub, so the
 *  rows line up no matter how differently the silhouettes are proportioned */
const ICON_H = 46;

/** Today's standing for one league, read straight from its own storage —
 *  so the hub shows Play / Continue / Recap per sport at a glance. */
function homeStatus(s: Sport) {
  const st = SPORTS[s].storage;
  const day = st.currentDayNumber();
  const saved = st.loadGameState(day);
  const done = !!saved && saved.status !== "playing";
  const inProgress =
    !!saved &&
    saved.status === "playing" &&
    (saved.revealed > 1 || saved.wrongGuesses.length > 0);
  const won = saved?.status === "won";
  const streak = st.displayStreak(st.loadProfile(), day);
  const cta = done ? "Recap" : inProgress ? "Continue" : "Play";
  return { day, done, won, streak, cta };
}

export default function StartScreen({
  onPlay,
  onRules,
  onSettings,
  onArchive,
  onStats,
  onAccount,
  onSignIn,
  signedIn,
}: Props) {
  return (
    <div className="start-screen" role="dialog" aria-label="Journeyman — pick a league">
      {/* returning players with an account but no session need a plain
          sign-in door — everything else on this screen pitches sign-UP */}
      {!signedIn && (
        <button
          type="button"
          className="chip absolute left-4 top-4 cursor-pointer"
          aria-label="Sign in"
          title="Sign in"
          onClick={onSignIn}
        >
          <UserIcon size={18} />
        </button>
      )}

      {/* stats + how-to-play + settings, tucked into the hamburger */}
      <HomeMenu
        onStats={onStats}
        onRules={onRules}
        onSettings={onSettings}
        onAccount={onAccount}
        signedIn={signedIn}
      />

      <div className="my-auto flex w-full max-w-sm flex-col items-center px-6 py-4 text-center">
        {/* three journeymen fanned out, gently floating — the game's own cards */}
        <HeroCards />

        <h1 className="font-display mt-1 text-[2.7rem] leading-none tracking-wide">
          JOURNEYMAN
        </h1>
        <p className="mt-1 text-sm font-medium text-ink-soft">
          A mystery journeyman's career, one jersey at a time.
        </p>

        {/* the rules are also in the menu, but a first-time visitor shouldn't
            have to go looking — this is the one thing they might need before
            picking a league */}
        <button type="button" className="btn btn-sm mt-2.5" onClick={onRules}>
          How to play
        </button>

        {/* the three daily games — one tap each, straight into play */}
        <div className="mt-3.5 w-full space-y-2">
          {SPORT_ORDER.map((s) => {
            const info = homeStatus(s);
            const isCurrent = s === SPORT.sport;
            const Jersey = SPORTS[s].DeckJersey;
            const inner = (
              <>
                <span
                  className="flex shrink-0 items-end justify-center"
                  style={{ width: 52, height: ICON_H }}
                  aria-hidden="true"
                >
                  <Jersey size={ICON_H / SPORTS[s].jerseyAspect} />
                </span>
                <span className="flex-1 text-left">
                  <span className="font-display block text-lg leading-none tracking-wide">
                    {SPORTS[s].league}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[0.7rem] leading-none text-ink-soft">
                    No. {info.day}
                    {info.done && (
                      <span className={info.won ? "font-bold text-[#2e7d43]" : ""}>
                        · {info.won ? "Solved" : "Done"}
                      </span>
                    )}
                    {info.streak > 0 && (
                      <span className="flex items-center gap-0.5 font-bold text-ink">
                        <FlameIcon size={11} className="text-wood-deep" />
                        {info.streak}
                      </span>
                    )}
                  </span>
                </span>
                <span className="home-card-cta shrink-0">{info.cta}</span>
              </>
            );
            const cls = "home-card flex w-full items-center gap-3 px-3 py-2.5 text-left";
            return isCurrent ? (
              <button key={s} type="button" className={cls} onClick={onPlay}>
                {inner}
              </button>
            ) : (
              <a key={s} className={cls} href={sportHref(s, { play: 1 })}>
                {inner}
              </a>
            );
          })}
        </div>

        <button type="button" className="btn mt-2.5 w-full py-2" onClick={onArchive}>
          Archive
        </button>

        {!signedIn && (
          <button
            type="button"
            className="account-home-card mt-2.5 w-full text-left"
            onClick={onAccount}
          >
            <span className="flex items-center gap-2">
              <ChartIcon size={18} className="text-wood-deep" />
              <span className="font-display text-lg tracking-wide">KEEP EVERY RESULT</span>
              <span className="account-save-badge ml-auto">FREE</span>
            </span>
            <span className="mt-1 block text-xs leading-snug text-ink-soft">
              Build your lifetime stats, sync your streaks, and replay every
              missed puzzle in the archive.
            </span>
            <span className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-wood-deep">
              <LockIcon size={13} /> Create account to unlock →
            </span>
          </button>
        )}

        <p className="mt-3 text-[0.65rem] text-ink-soft">
          New puzzles at midnight ET · Not affiliated with the NBA/NFL/MLB
        </p>
      </div>
    </div>
  );
}
