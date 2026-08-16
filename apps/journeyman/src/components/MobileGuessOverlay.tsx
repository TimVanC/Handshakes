import { useEffect, useRef, useState } from "react";
import { SPORT } from "../sports/active";

/**
 * Top-bar player search for touch screens — the Immaculate Grid / Poeltl
 * pattern. The input sits at the TOP of the screen (over the header), so
 * the iOS keyboard opening below it never needs to scroll anything into
 * view: the whole family of reveal-scroll glitches (page yanked down,
 * bars pinned and snapping, browser chrome frosting over the board) is
 * structurally impossible here. The board stays visible beneath — results
 * drop down under the bar only while there's a query, and a transparent
 * backdrop closes the search on any outside tap. Picking a result IS the
 * guess, same as the inline combobox.
 *
 * The input element must be focused by the CALLER inside the tap's own
 * event handler (see openSearch in App) — a focus from an effect after
 * mount loses the user-activation and iOS won't raise the keyboard.
 */
export default function MobileGuessOverlay({
  alreadyGuessed,
  onGuess,
  onClose,
  inputRef,
}: {
  alreadyGuessed: string[];
  onGuess: (name: string) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [indexReady, setIndexReady] = useState(false);

  useEffect(() => {
    let alive = true;
    SPORT.searchPlayers.load().then(() => alive && setIndexReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Chrome iOS's accessory-bar checkmark dismisses the keyboard WITHOUT
  // blurring the field, so the blur-close below can't catch it. The
  // keyboard's departure is still visible as the visual viewport growing
  // back to full height — once we've seen it open (height dropped) and
  // then close (height recovered), the search leaves with it, no matter
  // how the keyboard was dismissed. onClose rides a ref so this mounts
  // once and the baseline height (captured pre-keyboard) never resets.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const fullHeight = vv.height; // overlay mounts before the keyboard opens
    let sawKeyboard = false;
    const onResize = () => {
      if (vv.height < fullHeight - 100) sawKeyboard = true;
      else if (sawKeyboard && vv.height > fullHeight - 60) closeRef.current();
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const guessedLower = alreadyGuessed.map((g) => g.toLowerCase());
  const results = indexReady
    ? SPORT.searchPlayers
        .search(query)
        .filter((p) => !guessedLower.includes(p.name.toLowerCase()))
    : [];

  return (
    <>
      {/* invisible click-catcher: the board stays VISIBLE below the bar,
          but a stray tap on it dismisses the search instead of playing */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label="Guess the player"
        className="fixed inset-x-0 top-0 z-50 border-b-2 border-ink bg-paper"
      >
        <div className="flex items-stretch gap-2 px-4 pb-2.5 pt-[max(0.6rem,env(safe-area-inset-top))]">
          <div className="flex-1">
            <input
              ref={inputRef}
              type="search"
              name="player-search"
              aria-label="Guess the player"
              className="combo-input"
              placeholder="Type a player"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // Enter guesses the top match — same shortcut the desktop
              // combobox's highlighted row gives
              onKeyDown={(e) => {
                if (e.key === "Enter" && results.length > 0) {
                  e.preventDefault();
                  onGuess(results[0].name);
                }
              }}
              // the keyboard's Done/✓ dismisses the keyboard by blurring the
              // field — the search bar must leave with it, or it strands a
              // second "Type a player" at the top of the screen. Result rows
              // preventDefault their mousedown so picking one never blurs.
              onBlur={() => {
                setTimeout(() => {
                  if (document.activeElement !== inputRef.current) onClose();
                }, 100);
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
          <button type="button" className="btn shrink-0" onClick={onClose}>
            Cancel
          </button>
        </div>
        {results.length > 0 && (
          <ul
            className="max-h-[42vh] overflow-y-auto border-t border-line px-4 pb-1"
            aria-label="Matching players"
          >
            {results.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  className="flex w-full items-baseline justify-between gap-3 border-b border-line py-3 text-left"
                  // fires before the input's blur — keeping focus means the
                  // blur-close above can't unmount this row mid-tap
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onGuess(p.name)}
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs tabular-nums text-ink-soft">{p.yearsActive}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim() !== "" && indexReady && results.length === 0 && (
          <p className="border-t border-line py-3 text-center text-sm text-ink-soft">
            No matching players
          </p>
        )}
      </div>
    </>
  );
}
