import { SPORT } from "../sports/active";
import { sportHref } from "../sports";
import { ArchiveIcon, ChartIcon, GearIcon } from "./Icons";

interface Props {
  onHelp: () => void;
  onStats: () => void;
  onArchive: () => void;
  onSettings: () => void;
}

/** Lean header — just the wordmark and the same four controls `main`
 *  shipped. Sport is implied by the game you're in (switching happens on
 *  the home screen and the result card), so no league tag or switcher
 *  here: that overflowed the bar on phones. */
export default function Header({ onHelp, onStats, onArchive, onSettings }: Props) {
  return (
    <header className="baseline-rule relative z-10 bg-paper/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <a
          href={sportHref(SPORT.sport)}
          className="flex items-end gap-2"
          aria-label="Journeyman — today's puzzle"
        >
          <h1 className="font-display text-[1.65rem] leading-none tracking-wide">
            JOURNEYMAN
          </h1>
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chip cursor-pointer"
            onClick={onArchive}
            aria-label="Puzzle archive"
            title="Archive"
          >
            <ArchiveIcon />
          </button>
          <button
            type="button"
            className="chip cursor-pointer"
            onClick={onStats}
            aria-label="Your stats"
            title="Stats"
          >
            <ChartIcon />
          </button>
          <button
            type="button"
            className="chip cursor-pointer font-bold"
            onClick={onHelp}
            aria-label="How to play"
          >
            ?
          </button>
          <button
            type="button"
            className="chip cursor-pointer"
            onClick={onSettings}
            aria-label="Settings"
            title="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </div>
    </header>
  );
}
