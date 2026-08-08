import { useEffect, useState } from "react";
import { SPORT } from "../sports/active";

/**
 * Full-screen player search for touch screens — the Immaculate Grid /
 * Poeltl pattern. The input lives at the TOP of the screen, so the iOS
 * keyboard opening below it never needs to scroll anything into view:
 * the whole family of reveal-scroll glitches (page yanked down, bars
 * pinned and snapping, browser chrome frosting over the board) is
 * structurally impossible here. Results fill the space between input
 * and keyboard; picking one IS the guess, same as the inline combobox.
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

  const guessedLower = alreadyGuessed.map((g) => g.toLowerCase());
  const results = indexReady
    ? SPORT.searchPlayers
        .search(query)
        .filter((p) => !guessedLower.includes(p.name.toLowerCase()))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-paper"
      role="dialog"
      aria-modal="true"
      aria-label="Guess the player"
    >
      <div className="flex items-stretch gap-2 border-b-2 border-ink px-4 pb-2.5 pt-[max(0.6rem,env(safe-area-inset-top))]">
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
      <ul className="min-h-0 flex-1 overflow-y-auto px-4 pb-10" aria-label="Matching players">
        {results.map((p) => (
          <li key={p.name}>
            <button
              type="button"
              className="flex w-full items-baseline justify-between gap-3 border-b border-line py-3 text-left"
              onClick={() => onGuess(p.name)}
            >
              <span className="font-semibold">{p.name}</span>
              <span className="text-xs tabular-nums text-ink-soft">{p.yearsActive}</span>
            </button>
          </li>
        ))}
        {query.trim() !== "" && indexReady && results.length === 0 && (
          <li className="py-4 text-center text-sm text-ink-soft">No matching players</li>
        )}
      </ul>
    </div>
  );
}
