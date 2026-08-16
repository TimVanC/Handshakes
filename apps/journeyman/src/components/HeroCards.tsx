import { SPORTS } from "../sports";
import { resolveColorway } from "../game/colorways";
import type { Sport } from "../sports/types";

/**
 * Home-screen hero: three real journeyman jerseys — one per league, at each
 * player's most notable stop — fanned like a hand of cards and gently
 * floating. Purely decorative (aria-hidden); replaces the old lone swaying
 * "??" jersey. Each jersey is the real per-sport renderer + colorway, so the
 * fan matches exactly what the game deals.
 */

/** target jersey HEIGHT in px; per-card width derives from each sport's
 *  aspect so all three read at the same height despite different cuts */
const JERSEY_H = 62;

type HeroCard = {
  sport: Sport;
  franchise: string;
  start: number;
  end: number;
  number: number;
  year: string;
  slot: "left" | "center" | "right";
};

const CARDS: HeroCard[] = [
  { sport: "nba", franchise: "DET", start: 2016, end: 2018, number: 14, year: "2016–2019", slot: "left" },
  { sport: "mlb", franchise: "OAK", start: 1979, end: 1984, number: 24, year: "1979–1984", slot: "center" },
  { sport: "nfl", franchise: "BUF", start: 2009, end: 2012, number: 14, year: "2009–2012", slot: "right" },
];

export default function HeroCards() {
  return (
    <div className="hero-fan" aria-hidden="true">
      {CARDS.map((c) => {
        const cfg = SPORTS[c.sport];
        const era = resolveColorway(cfg.colorways, c.franchise, c.start, c.end);
        if (!era) return null;
        const Jersey = cfg.Jersey;
        return (
          <div key={c.sport} className={`hero-slot hero-slot-${c.slot}`}>
            <div className="hero-card">
              <p className="hero-card-year">{c.year}</p>
              <Jersey
                era={era}
                number={c.number}
                size={Math.round(JERSEY_H / cfg.jerseyAspect)}
                label={cfg.eraTricode(era, c.franchise)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
