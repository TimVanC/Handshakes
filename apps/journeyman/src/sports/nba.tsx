import JerseyRenderer, { type EraStyle } from "../components/JerseyRenderer";
import colorwaysJson from "../data/colorways.json";
import teamSeasonsJson from "../data/teamSeasons.json";
import { puzzles } from "../data/puzzles";
import { ROSTER } from "../data/roster";
import { createPlayerSearch } from "../data/playerSearch";
import { createSeasonDB, crossYearLabel, type SeasonJSON } from "../data/seasonDB";
import { createStorage } from "../game/storage";
import type { ColorwayDB, ColorwayEra } from "../game/colorways";
import type { Stint } from "../game/types";
import {
  BasketballIcon,
  CrownIcon,
  FirstTeamIcon,
  FmvpIcon,
  MedalIcon,
  RoyIcon,
  ShieldIcon,
  SixthManIcon,
  StarIcon,
  TrophyIcon,
} from "../components/Icons";
import type { SportConfig } from "./types";

const colorways = colorwaysJson as unknown as ColorwayDB;

/**
 * Era-correct city tricode for a colorway entry — a Vancouver-era stint
 * stamps "VAN", not the modern franchise's "MEM". (The NBA colorways JSON
 * predates the per-era `tricode` field the NFL/MLB files carry.)
 */
export function eraTricode(era: ColorwayEra, franchise: string): string {
  // ABA entries carry their own code (NYA, DAL, UTS…); the older NBA
  // entries predate that field and are mapped by identity below
  if (era.tricode) return era.tricode;
  const id = era.identity;
  if (id.startsWith("Vancouver")) return "VAN";
  if (id.startsWith("San Francisco")) return "SFW";
  if (id.startsWith("New Jersey")) return "NJ";
  if (id.startsWith("Seattle")) return "SEA";
  if (id.startsWith("Buffalo")) return "BUF";
  if (id.startsWith("San Diego")) return "SDC";
  if (id.startsWith("Kansas City")) return "KCK";
  if (id.startsWith("New Orleans Jazz")) return "NOJ";
  if (id.startsWith("New Orleans Hornets")) return "NOH";
  if (id.startsWith("Charlotte Hornets (original)")) return "CHH";
  if (id.startsWith("Washington Bullets")) return "WSB";
  return franchise;
}

export const nba: SportConfig = {
  sport: "nba",
  league: "NBA",
  ballIcon: BasketballIcon,
  brandTag: null, // the original — no suffix on the wordmark
  shareTag: "Journeyman NBA",
  shareEmoji: "🎽",
  tagline: "A mystery NBA journeyman, one jersey at a time.",

  puzzles,
  // the hand-curated schedule — basketball is the maintainer's home turf
  scheduling: "roster",
  /** Only the BR-verified puzzles rotate daily; 6+ are archetype test
   *  puzzles reachable through test mode. */
  dailyPool: 5,
  roster: ROSTER,
  searchPlayers: createPlayerSearch(
    () => import("../data/playerIndex.json").then((m) => m.default as [string, string][])
  ),

  colorways,
  eraTricode,
  Jersey: ({ era, number, size, label }) => (
    <JerseyRenderer
      primary={era.primary}
      secondary={era.secondary}
      trim={era.trim}
      number={number}
      eraStyle={era.eraStyle as EraStyle}
      size={size}
      label={label}
    />
  ),
  DeckJersey: ({ size }) => (
    <JerseyRenderer
      primary="#e8d3ad"
      secondary="#9c6b3a"
      trim="#5b3f27"
      number={null}
      eraStyle="nineties"
      size={size}
    />
  ),
  cardJerseySize: 70,
  jerseyAspect: 306 / 190, // JerseyRenderer viewBox

  // season START years: a 1996-2000 stint reads "1996–2001"
  stintYears: (s: Stint) => `${s.startYear}–${s.endYear + 1}`,

  cardStats: (s: Stint) => [
    { label: "GP", value: s.gp ?? 0 },
    { label: "MPG", value: (s.mpg ?? 0).toFixed(1) },
    { label: "PPG", value: (s.ppg ?? 0).toFixed(1) },
    { label: "RPG", value: (s.rpg ?? 0).toFixed(1) },
    { label: "APG", value: (s.apg ?? 0).toFixed(1) },
  ],
  stintSummary: (s: Stint) => `${s.gp} GP · ${(s.ppg ?? 0).toFixed(1)} PPG`,

  accoladeMeta: {
    all_star: { Icon: StarIcon, label: "All-Star" },
    champion: { Icon: TrophyIcon, label: "Champion" },
    mvp: { Icon: CrownIcon, label: "MVP" },
    fmvp: { Icon: FmvpIcon, label: "Finals MVP", wordmark: true },
    dpoy: { Icon: ShieldIcon, label: "DPOY" },
    sixth_man: { Icon: SixthManIcon, label: "6MOY", wordmark: true },
    roy: { Icon: RoyIcon, label: "ROY", wordmark: true },
    all_nba: { Icon: FirstTeamIcon, label: "All-NBA First Team", wordmark: true },
    all_defensive: { Icon: ShieldIcon, label: "All-Defensive Team" },
    all_rookie: { Icon: RoyIcon, label: "All-Rookie Team", wordmark: true },
    dunk_champion: { Icon: BasketballIcon, label: "Dunk Contest champion" },
    olympic_gold: { Icon: MedalIcon, label: "Olympic gold" },
  },

  hintLadder: [
    { key: "position", label: "Position" },
    { key: "height", label: "Height" },
    { key: "draftYear", label: "Draft year" },
    { key: "draftPick", label: "Draft pick" },
    { key: "college", label: "College" },
  ],

  gradeLabels: {
    lost: "Waived",
    allHints: "Buzzer Beater",
    // NOT "Journeyman" — that label collides with the game's own name in
    // the share line ("Journeyman #3 · Journeyman" reads like a stutter)
    someHints: "10-Day",
    one: "Hall of Fame",
    half: "All-NBA",
    most: "Starter",
    full: "6th Man",
  },

  getStintSeasons: createSeasonDB(teamSeasonsJson as unknown as SeasonJSON),
  seasonLabel: crossYearLabel,

  // bare legacy prefix: live players' NBA history predates multi-sport
  storage: createStorage("journeyman", "2026-07-15"),
};
