import { useEffect, useMemo, useState } from "react";
import { loadGameData, type GameData } from "./data/gameData";
import { resolveSport } from "./sports";
import { useGame } from "./game/useGame";
import { head as chainHead } from "./game/engine";
import Board from "./components/Board";
import GuessDock from "./components/GuessDock";
import HelpModal from "./components/HelpModal";
import ResultSheet from "./components/ResultSheet";

const SEEN_HELP_KEY = "handshakes:seenHelp:v1";

export default function App() {
  const sport = useMemo(() => resolveSport(location.pathname), []);
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
  return <Game data={data} />;
}

function Game({ data }: { data: GameData }) {
  const game = useGame(data);
  const { state, puzzle } = game;
  const [showHelp, setShowHelp] = useState(() => {
    try {
      return localStorage.getItem(SEEN_HELP_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [showResult, setShowResult] = useState(false);

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
  const streak = game.profile ? (state.status === "solved" ? game.profile.streak : 0) : 0;

  return (
    <>
      <header className="hs-header">
        <div className="hs-wordmark">
          🤝 Handshakes <span className="day">#{game.day}</span>
        </div>
        <div className="hs-header-actions">
          {game.profile.streak > 0 && (
            <span className="hs-count" title="Streak">
              🔥{game.profile.streak}
            </span>
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
        <span className="hs-par">Par {puzzle.par}</span>
        <span className="hs-count">
          <strong>{game.handshakes}</strong> handshake{game.handshakes === 1 ? "" : "s"} so far
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
        onShowSolution={game.showSolution}
        onOpenResult={() => setShowResult(true)}
      />

      {state.status === "playing" && (
        <GuessDock
          data={data}
          startHeadName={playerName(chainHead(state, "start"))}
          targetHeadName={playerName(chainHead(state, "target"))}
          onPlace={game.tryPlace}
        />
      )}

      {showHelp && <HelpModal onClose={dismissHelp} />}
      {showResult && state.status !== "playing" && (
        <ResultSheet
          data={data}
          state={state}
          puzzle={puzzle}
          day={game.day}
          handshakes={game.handshakes}
          streak={streak}
          onClose={() => setShowResult(false)}
        />
      )}
    </>
  );
}
