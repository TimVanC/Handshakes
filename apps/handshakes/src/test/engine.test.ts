import { describe, expect, it } from "vitest";
import { buildGraph } from "@handshakes/sport-data";
import type { SportDataset } from "@handshakes/sport-data";
import {
  giveUp,
  handshakeCount,
  initialState,
  linksFormed,
  mergedChain,
  place,
  resultLabel,
  revealRoster,
  undo,
  useFranchiseHint,
} from "../game/engine";
import { buildShareText } from "../game/share";

/** Tiny synthetic league. Roster cliques:
 *    TS1 {A,B}  TS2 {B,C}  TS3 {C,D}  TS4 {D,E}  TS5 {A,E}
 *  So A—B—C—D is par 3, with an alternate A—E—D par 2… no: A-E (TS5), E-D (TS4)
 *  gives par 2 A→D. To keep par(A,D)=3 the fixture drops TS5 below. */
const fixture: SportDataset = {
  players: ["A", "B", "C", "D", "E"].map((id, i) => ({
    id,
    sport: "test",
    full_name: `Player ${id}`,
    first_season: 2000 + i,
    last_season: 2010 + i,
    career_games: 500,
    notability: 90,
  })),
  franchises: [{ id: "test-x", sport: "test", name: "Testers" }],
  team_seasons: ["TS1", "TS2", "TS3", "TS4"].map((id, i) => ({
    id,
    sport: "test",
    franchise_id: "test-x",
    season: 2001 + i,
    display_name: `Season ${id}`,
  })),
  appearances: [
    { player_id: "A", team_season_id: "TS1", games_played: 50 },
    { player_id: "B", team_season_id: "TS1", games_played: 50 },
    { player_id: "B", team_season_id: "TS2", games_played: 50 },
    { player_id: "C", team_season_id: "TS2", games_played: 50 },
    { player_id: "C", team_season_id: "TS3", games_played: 50 },
    { player_id: "D", team_season_id: "TS3", games_played: 50 },
    { player_id: "D", team_season_id: "TS4", games_played: 50 },
    { player_id: "E", team_season_id: "TS4", games_played: 50 },
  ],
};

const graph = buildGraph(fixture);
const fresh = () => initialState(1, "test", "A", "D");

describe("placement validation", () => {
  it("accepts a real teammate of the start head and reveals the link jersey", () => {
    const r = place(graph, fresh(), "start", "B");
    if (!r.ok) throw new Error("expected ok");
    expect(r.teamSeasonId).toBe("TS1");
    expect(r.closedWith).toBeNull();
    expect(r.state.fromStart).toEqual(["A", "B"]);
  });

  it("rejects a never-teammate with no penalty", () => {
    const r = place(graph, fresh(), "start", "C"); // A and C never shared a roster
    expect(r).toMatchObject({ ok: false, reason: "not-teammate", headId: "A" });
  });

  it("rejects players already in either chain", () => {
    const r1 = place(graph, fresh(), "start", "B");
    if (!r1.ok) throw new Error();
    expect(place(graph, r1.state, "target", "B")).toMatchObject({
      ok: false,
      reason: "already-in-chain",
    });
    expect(place(graph, r1.state, "start", "A")).toMatchObject({
      ok: false,
      reason: "already-in-chain",
    });
  });

  it("rejects unknown players", () => {
    expect(place(graph, fresh(), "start", "ZZ")).toMatchObject({
      ok: false,
      reason: "unknown-player",
    });
  });
});

describe("the teeter-totter and auto-close", () => {
  it("builds from both ends and closes automatically when heads collide", () => {
    let s = fresh();
    const r1 = place(graph, s, "start", "B"); // A—B
    if (!r1.ok) throw new Error();
    s = r1.state;
    const r2 = place(graph, s, "target", "C"); // D end grows: D—C; heads B & C share TS2
    if (!r2.ok) throw new Error();
    expect(r2.closedWith).toBe("TS2");
    expect(r2.state.status).toBe("solved");
    expect(linksFormed(r2.state)).toBe(3); // 4 players placed = 3 handshakes
    expect(handshakeCount(r2.state)).toBe(3);

    const chain = mergedChain(r2.state)!;
    expect(chain.players).toEqual(["A", "B", "C", "D"]);
    expect(chain.links).toEqual(["TS1", "TS2", "TS3"]);
  });

  it("can be solved entirely from one end", () => {
    let s = fresh();
    for (const p of ["B", "C"]) {
      const r = place(graph, s, "start", p);
      if (!r.ok) throw new Error(`placing ${p}`);
      s = r.state;
    }
    // heads are C and D — they share TS3, so placing C already closed it
    expect(s.status).toBe("solved");
    expect(handshakeCount(s)).toBe(3);
  });

  it("no placements after solve", () => {
    let s = fresh();
    for (const p of ["B", "C"]) {
      const r = place(graph, s, "start", p);
      if (!r.ok) throw new Error();
      s = r.state;
    }
    expect(place(graph, s, "target", "E")).toMatchObject({ ok: false, reason: "not-playing" });
  });
});

describe("undo", () => {
  it("removes the newest player and refunds the handshake", () => {
    const r = place(graph, fresh(), "start", "B");
    if (!r.ok) throw new Error();
    expect(handshakeCount(r.state)).toBe(1);
    const undone = undo(r.state, "start");
    expect(undone.fromStart).toEqual(["A"]);
    expect(handshakeCount(undone)).toBe(0);
  });

  it("never removes the puzzle endpoints", () => {
    const s = undo(fresh(), "start");
    expect(s.fromStart).toEqual(["A"]);
  });
});

describe("hints", () => {
  it("roster reveal costs +1 once; reopening is free", () => {
    let s = revealRoster(fresh(), "TS2");
    expect(s.hintPenalties).toBe(1);
    s = revealRoster(s, "TS2");
    expect(s.hintPenalties).toBe(1);
    expect(s.revealedRosters).toEqual(["TS2"]);
  });

  it("franchise hints cost +1 each and exhaust at the canonical path length", () => {
    let s = useFranchiseHint(fresh(), 3);
    s = useFranchiseHint(s, 3);
    s = useFranchiseHint(s, 3);
    s = useFranchiseHint(s, 3); // exhausted — no charge
    expect(s.franchiseHintsUsed).toBe(3);
    expect(s.hintPenalties).toBe(3);
  });

  it("hint penalties count as handshakes in the score", () => {
    let s = fresh();
    s = revealRoster(s, "TS1");
    const r = place(graph, s, "start", "B");
    if (!r.ok) throw new Error();
    expect(handshakeCount(r.state)).toBe(2); // 1 link + 1 penalty
  });

  it("show solution is free and ends the run", () => {
    const s = giveUp(fresh());
    expect(s.status).toBe("gave_up");
    expect(handshakeCount(s)).toBe(0);
  });
});

describe("result copy (no golf language)", () => {
  it.each([
    [3, 3, "Clean sweep"],
    [4, 3, "One extra handshake"],
    [5, 3, "Two extra handshakes"],
    [7, 3, "The long way around"],
  ])("%i handshakes at par %i → %s", (hs, par, label) => {
    expect(resultLabel(hs, par)).toBe(label);
  });
});

describe("share text", () => {
  it("one 🤝 per handshake, no player names, spoiler-free", () => {
    const text = buildShareText({ day: 142, handshakes: 4, par: 3, status: "solved" });
    expect(text).toBe(
      ["Handshakes #142", "🤝🤝🤝🤝", "", "Par 3 — one extra", "https://handshakes.game"].join("\n")
    );
    expect(text).not.toMatch(/Player/);
  });

  it("gave-up share names no score", () => {
    const text = buildShareText({ day: 7, handshakes: 2, par: 3, status: "gave_up" });
    expect(text).toContain("left hanging");
    expect(text).not.toContain("🤝");
  });
});
