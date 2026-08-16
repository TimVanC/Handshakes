import { useEffect } from "react";
import { SPORT } from "../sports/active";
import { FlameIcon } from "./Icons";

// "position → height → draft year → draft pick → college", per sport
const ladderLine = SPORT.hintLadder.map((h) => h.label.toLowerCase()).join(" → ");

interface Props {
  /** opened from the home hub, where all three leagues are on offer — the
   *  copy stays league-neutral there instead of claiming the current one */
  home?: boolean;
  onClose: () => void;
}

export default function HelpModal({ home = false, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How to play"
        className="modal-panel p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-2xl">How to play</h2>
          <button type="button" className="chip cursor-pointer" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-3 text-sm leading-relaxed">
          <p>
            Guess <strong>one mystery {home ? "NBA, NFL, or MLB" : SPORT.league}{" "}
            player</strong> from the teams he played for. Every jersey is the{" "}
            <strong>same player</strong> — just a different stop in his career.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              No logos or names — just each team's <strong>colors</strong>,{" "}
              <strong>city</strong>, his <strong>number</strong>, and his{" "}
              <strong>stats there</strong>.
            </li>
            <li>
              You start at his <em>least</em> famous stop. Name the player, or{" "}
              flip the next jersey for another clue.
            </li>
            <li>
              <strong>Fewer jerseys = better score</strong> — golf rules, lower
              wins.
            </li>
            <li>
              A wrong guess flips the next jersey for you (never free).
            </li>
            <li>
              Tap a jersey to flip it: awards and season records at that stop.
            </li>
            <li>
              Out of jerseys? Guesses reveal his profile{" "}
              {home ? "— position, height, and more" : `(${ladderLine})`}, then
              one last guess.
            </li>
          </ul>
          {home && (
            <p className="text-ink-soft">
              Three puzzles a day, one per league — each with its own{" "}
              <FlameIcon size={13} className="text-wood-deep" /> streak.
            </p>
          )}
          <p className="border-t border-line pt-3 text-xs text-ink-soft">
            New puzzles at midnight ET. Not affiliated with the NBA/NFL/MLB.
          </p>
        </div>
      </div>
    </div>
  );
}
