import { useEffect, useMemo, useState } from "react";
import { loadGameData, type GameData } from "./data/gameData";
import { EXAMPLES } from "./data/puzzles";
import { resolveSport } from "./sports";
import { useGame, type Slot } from "./game/useGame";
import { head as chainHead } from "./game/engine";
import Board from "./components/Board";
import FlagIcon from "./components/FlagIcon";
import GuessDock from "./components/GuessDock";
import HandshakeIcon from "./components/HandshakeIcon";
import HelpModal from "./components/HelpModal";
import ResultSheet from "./components/ResultSheet";

const SEEN_HELP_KEY = "handshakes:seenHelp:v1";

/** The demo bar and example slots exist on dev and vercel.app hosts only —
 *  never on the real domain, where there is exactly one puzzle a day. */
const DEMO_HOST =
  typeof location !== "undefined" &&
  (location.hostname === "localhost" || location.hostname.endsWith(".vercel.app"));

function resolveSlot(): Slot {
  const q = new URLSearchParams(location.search);
  const x = Number(q.get("x"));
  if (DEMO_HOST && Number.isInteger(x) && x > 0) return { kind: "example", n: x };
  const p = Number(q.get("p"));
  if (import.meta.env.DEV && Number.isInteger(p) && p > 0) return { kind: "test", n: p };
  return { kind: "live" };
}

export default function App() {
  const sport = useMemo(() => resolveSport(location.pathname), []);
  const slot = useMemo(resolveSlot, []);
  const [data, setData] = useState<GameData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadGameData(sport).then(setData, () => setLoadError(true));
  }, [sport]);

  if (loadError) {
    return (
      <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
        <p>Couldn't load the league data. Check your connection and refresh.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div
        style={{
          padding: "4rem 1.5rem",
          textAlign: "center",
          fontFamily: "var(--font-display)",
          fontSize: "1.3rem",
          letterSpacing: "0.05em",
        }}
      >
        HANDSHAKES
        <div style={{ fontFamily: "var(--font-ui)", fontSize: "0.9rem", marginTop: "0.6rem" }}>
          warming up…
        </div>
      </div>
    );
  }
  return <Game data={data} slot={slot} />;
}

function Game({ data, slot }: { data: GameData; slot: Slot }) {
  const game = useGame(data, slot);
  const { state, puzzle } = game;
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return localStorage.getItem(SEEN_HELP_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [showResult, setShowResult] = useState(false);
  const [confirmFlag, setConfirmFlag] = useState(false);

  // the result sheet presents itself once the run ends (after the collision
  // animation has had its moment)
  useEffect(() => {
    if (state.status === "playing") return;
    const t = setTimeout(() => setShowResult(true), state.status === "solved" ? 1500 : 250);
    return () => clearTimeout(t);
  }, [state.status]);

  const dismissHelp = () => {
    setShowHelp(false);
    try {
      localStorage.setItem(SEEN_HELP_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  const playerName = (id: string) => data.graph.players.get(id)?.full_name ?? id;
  const over = game.handshakes - puzzle.par;
  const playing = state.status === "playing";
  const between = puzzle.par - 1;

  return (
    <>
      {DEMO_HOST && (
        <nav className="hs-examples" aria-label="Example puzzles">
          <span>Examples</span>
          {EXAMPLES.map((ex) => (
            <a
              key={ex.day}
              href={`?x=${ex.day}`}
              className={slot.kind === "example" && slot.n === ex.day ? "active" : ""}
              title={`${playerName(ex.start_id)} → ${playerName(ex.target_id)}`}
            >
              {ex.day}
            </a>
          ))}
          <a href="?" className={slot.kind === "live" ? "active" : ""}>
            Today
          </a>
        </nav>
      )}

      <header className="hs-header">
        <div className="hs-wordmark">
          <HandshakeIcon size={22} /> Handshakes <span className="day">{game.dayLabel}</span>
        </div>
        <div className="hs-header-actions">
          {game.profile.streak > 0 && (
            <span className="hs-count" title="Streak">
              🔥{game.profile.streak}
            </span>
          )}
          {playing && (
            <button
              type="button"
              className="hs-iconbtn flag"
              onClick={() => setConfirmFlag(true)}
              aria-label="Give up and show the solution"
              title="Show solution (ends the run)"
            >
              <FlagIcon size={16} />
            </button>
          )}
          <button
            type="button"
            className="hs-iconbtn"
            onClick={() => setShowHelp(true)}
            aria-label="How to play — what counts as a handshake?"
          >
            What counts?
          </button>
        </div>
      </header>

      <div className="hs-parstrip">
        <div className="row">
          <span className="hs-par">Par {puzzle.par}</span>
          <span className="hs-count">
            <strong>{game.handshakes}</strong> handshake{game.handshakes === 1 ? "" : "s"}
            {playing ? " so far" : ""}
            {over > 0 && <> <span className="over">+{over} over par</span></>}
          </span>
        </div>
        <span className="sub">
          Par is the shortest possible chain: {puzzle.par} handshakes, {between} player
          {between === 1 ? "" : "s"} in between.
        </span>
      </div>

      <Board
        data={data}
        state={state}
        puzzle={puzzle}
        justClosed={game.justClosed}
        onPlace={game.tryPlace}
        onUndo={game.undo}
        onPayRoster={game.payRosterReveal}
        onFranchiseHint={game.payFranchiseHint}
        onOpenResult={() => setShowResult(true)}
      />

      {playing && (
        <GuessDock
          data={data}
          startHeadName={playerName(chainHead(state, "start"))}
          targetHeadName={playerName(chainHead(state, "target"))}
          onPlace={game.tryPlace}
        />
      )}

      {confirmFlag && playing && (
        <div className="hs-backdrop" onClick={() => setConfirmFlag(false)}>
          <div
            className="hs-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Show the solution?"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>
              <FlagIcon size={20} /> Show the solution?
            </h2>
            <p>
              It's free, but it ends the run — today counts as played, not solved, and the
              streak resets. You'll see one optimal route with its jerseys.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="hs-btn"
                onClick={() => {
                  setConfirmFlag(false);
                  game.showSolution();
                }}
              >
                Show it
              </button>
              <button
                type="button"
                className="hs-btn secondary"
                onClick={() => setConfirmFlag(false)}
              >
                Keep playing
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelp && <HelpModal onClose={dismissHelp} />}
      {showResult && !playing && (
        <ResultSheet
          data={data}
          state={state}
          puzzle={puzzle}
          shareDay={slot.kind === "live" ? Number(game.dayLabel.slice(1)) : null}
          handshakes={game.handshakes}
          streak={slot.kind === "live" && state.status === "solved" ? game.profile.streak : 0}
          onClose={() => setShowResult(false)}
        />
      )}
    </>
  );
}
