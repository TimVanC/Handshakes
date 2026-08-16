import { useEffect, useId, useRef, useState } from "react";
import { SPORT } from "../sports/active";
import type { IndexedPlayer } from "../data/playerSearch";

interface Props {
  disabled: boolean;
  alreadyGuessed: string[];
  onGuess: (name: string) => void;
}

/**
 * Keyboard-navigable combobox (brief quality floor). Selecting a name
 * IS the guess — guessing is never free, so there is no separate submit.
 */
export default function GuessInput({ disabled, alreadyGuessed, onGuess }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // the league's player index is a separate chunk — pull it in as soon as
  // the board mounts, well before anyone finishes typing a name
  const [indexReady, setIndexReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  useEffect(() => {
    let alive = true;
    SPORT.searchPlayers.load().then(() => alive && setIndexReady(true));
    return () => {
      alive = false;
    };
  }, []);

  const guessedLower = alreadyGuessed.map((g) => g.toLowerCase());
  const results =
    open && indexReady
      ? SPORT.searchPlayers
          .search(query)
          .filter((p) => !guessedLower.includes(p.name.toLowerCase()))
      : [];

  const commit = (player: IndexedPlayer) => {
    setQuery("");
    setOpen(false);
    setHighlight(0);
    onGuess(player.name);
    // on a touch screen the keyboard covers half the board — drop it so the
    // penalty card being dealt (or the win) plays out in full view. Desktop
    // keeps focus for rapid follow-up typing.
    if (window.matchMedia("(pointer: coarse)").matches) {
      inputRef.current?.blur();
    } else {
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
        break;
      case "Enter":
        e.preventDefault();
        commit(results[highlight]);
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  };

  return (
    <div className="relative flex-1">
      {/* type="search" + the attribute battery below keeps iOS AutoFill out
          of the way: Safari classifies fields by heuristics (placeholder and
          label text included — the word "name" alone offers up YOUR contact
          card), and a search field with autocomplete/correct off is the one
          shape it leaves alone. The QuickType bar itself is OS territory a
          page can't remove outright; this strips everything it feeds on. */}
      <input
        ref={inputRef}
        type="search"
        name="player-search"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={
          results.length ? `${listboxId}-${highlight}` : undefined
        }
        aria-autocomplete="list"
        aria-label="Guess the player"
        className="combo-input"
        placeholder={disabled ? "Puzzle finished" : "Type a player"}
        disabled={disabled}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="go"
      />
      {results.length > 0 && (
        <ul id={listboxId} role="listbox" className="combo-list">
          {results.map((p, i) => (
            <li
              key={p.name}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className="combo-option"
              onMouseEnter={() => setHighlight(i)}
              // mousedown so it fires before the input's blur
              onMouseDown={(e) => {
                e.preventDefault();
                commit(p);
              }}
            >
              <span>{p.name}</span>
              <span className="years tabular-nums">{p.yearsActive}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
