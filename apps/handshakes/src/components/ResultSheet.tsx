import { useEffect, useState } from "react";
import { shareText as deliverShare } from "@handshakes/ui/share";
import type { GameData } from "../data/gameData";
import { mergedChain, resultLabel, type HsGameState } from "../game/engine";
import { buildShareText } from "../game/share";
import type { DailyPuzzle } from "../data/puzzles";
import HandshakeIcon from "./HandshakeIcon";
import LinkJersey from "./LinkJersey";

/** End-of-run sheet. Solved: the closed chain as a row of jerseys — the
 *  screenshot. Gave up: the canonical optimal path, because people who quit
 *  still want the answer, and seeing it is what brings them back. */
export default function ResultSheet({
  data,
  state,
  puzzle,
  shareDay,
  handshakes,
  streak,
  onClose,
}: {
  data: GameData;
  state: HsGameState;
  puzzle: DailyPuzzle;
  /** day number for the share header; null for demo/test slots */
  shareDay: number | null;
  handshakes: number;
  streak: number;
  onClose(): void;
}) {
  const [shareNote, setShareNote] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const solved = state.status === "solved";
  const chain = solved
    ? mergedChain(state)!
    : { players: puzzle.canonical_path, links: puzzle.canonical_links };
  const name = (id: string) => data.graph.players.get(id)?.full_name ?? id;
  const over = handshakes - puzzle.par;

  const doShare = async () => {
    const outcome = await deliverShare(
      buildShareText({
        day: shareDay ?? 0,
        handshakes,
        par: puzzle.par,
        status: solved ? "solved" : "gave_up",
      })
    );
    if (outcome === "copied") setShareNote("Copied to clipboard");
    else if (outcome === "failed") setShareNote("Couldn't share on this device");
  };

  return (
    <div className="hs-backdrop" onClick={onClose}>
      <div
        className="hs-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Result"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="hs-result-label">
          {solved ? resultLabel(handshakes, puzzle.par) : "Left hanging"}
        </h2>
        {solved ? (
          <>
            <div className="hs-tally-icons" aria-hidden>
              {Array.from({ length: Math.min(handshakes, 24) }, (_, i) => (
                <HandshakeIcon key={i} size={22} />
              ))}
            </div>
            <p className="hs-result-tally">
              {handshakes} handshake{handshakes === 1 ? "" : "s"} · Par {puzzle.par}
              {over > 0 && <> · {over} over</>}
            </p>
          </>
        ) : (
          <p className="hs-result-tally">Here's one clean route at par {puzzle.par}:</p>
        )}
        {streak > 0 && solved && (
          <p className="hs-streakline">
            <FlameGlyph /> {streak}-day streak
          </p>
        )}

        <div>
          {chain.players.map((pid, i) => (
            <div key={pid}>
              <div className="hs-node plain">
                <div className="who">
                  <div className="name">{name(pid)}</div>
                </div>
              </div>
              {i < chain.links.length && (
                <div className="hs-link plain">
                  <span className="shake">
                    <HandshakeIcon size={18} />
                  </span>
                  <LinkJersey data={data} teamSeasonId={chain.links[i]} size={46} />
                  <span className="team">
                    {data.graph.teamSeasons.get(chain.links[i])?.display_name}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            marginTop: "0.9rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {solved && (
            <button type="button" className="hs-btn" onClick={doShare}>
              Share <HandshakeIcon size={16} />
            </button>
          )}
          <button type="button" className="hs-btn secondary" onClick={onClose}>
            Back to the chain
          </button>
        </div>
        {shareNote && (
          <p className="hs-streakline" role="status" style={{ marginTop: "0.5rem" }}>
            {shareNote}
          </p>
        )}
        <p className="hs-streakline" style={{ marginTop: "1rem" }}>
          Like the jerseys? They star in our other daily —{" "}
          <a href="https://journeymanjersey.com" target="_blank" rel="noreferrer">
            Journeyman
          </a>
          : guess the player from their career, one jersey at a time.
        </p>
      </div>
    </div>
  );
}

function FlameGlyph() {
  return (
    <svg
      className="hs-flame"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-0.15em" }}
    >
      <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 1-3s0 3 2 3c1 0 2-1 2-3 0-3-3-4 0-8Z" />
    </svg>
  );
}
