import BaseballBackJerseyRenderer, {
  type BaseballEraStyle,
} from "../components/BaseballBackJerseyRenderer";
import colorwaysJson from "../data/mlb/colorways.json";
import teamSeasonsJson from "../data/mlb/teamSeasons.json";
import { mlbPuzzles } from "../data/mlb/puzzles";
import { MLB_ROSTER } from "../data/mlb/roster";
import { createPlayerSearch } from "../data/playerSearch";
import { createSeasonDB, plainYearLabel, type SeasonJSON } from "../data/seasonDB";
import { createStorage } from "../game/storage";
import type { ColorwayDB } from "../game/colorways";
import type { StatCell, Stint } from "../game/types";
import {
  BaseballIcon,
  BatIcon,
  BattingTitleIcon,
  CommissionersTrophyIcon,
  CrownIcon,
  CyYoungIcon,
  GloveIcon,
  MedalIcon,
  RelieverIcon,
  RoyIcon,
  StarIcon,
  WsMvpIcon,
} from "../components/Icons";
import type { SportConfig } from "./types";

const colorways = colorwaysJson as unknown as ColorwayDB;

const cells = (s: Stint): StatCell[] => s.statLine ?? [];

export const mlb: SportConfig = {
  sport: "mlb",
  league: "MLB",
  ballIcon: BaseballIcon,
  brandTag: "MLB",
  shareTag: "Journeyman MLB",
  shareEmoji: "⚾",
  tagline: "A mystery MLB journeyman, one jersey at a time.",

  puzzles: mlbPuzzles,
  // authoring order IS the schedule: each puzzle airs once, new ones
  // queue for the next open day, nothing repeats until the pool runs dry
  scheduling: "release",
  dailyPool: 5, // unused in release mode

  roster: MLB_ROSTER,
  searchPlayers: createPlayerSearch(
    () => import("../data/mlb/playerIndex.json").then((m) => m.default as [string, string][])
  ),

  colorways,
  // MLB colorways carry per-era tricodes (MON, FLA, CAL...) directly
  eraTricode: (era, franchise) => era.tricode ?? franchise,
  Jersey: ({ era, number, size, label }) => (
    <BaseballBackJerseyRenderer
      primary={era.primary}
      secondary={era.secondary}
      trim={era.trim}
      number={number}
      eraStyle={era.eraStyle as BaseballEraStyle}
      pinstripe={era.pattern === "pinstripe"}
      size={size}
      label={label}
    />
  ),
  DeckJersey: ({ size }) => (
    <BaseballBackJerseyRenderer
      primary="#e8d3ad"
      secondary="#9c6b3a"
      trim="#5b3f27"
      number="??" // the mystery mark; null now means "genuinely numberless"
      eraStyle="buttoned"
      size={size}
    />
  ),
  cardJerseySize: 82,
  jerseyAspect: 166 / 142.5, // BaseballBackJerseyRenderer viewBox

  // MLB seasons are single calendar years
  stintYears: (s: Stint) =>
    s.startYear === s.endYear ? `${s.startYear}` : `${s.startYear}–${s.endYear}`,

  // puzzles author batter/pitcher-shaped 5-cell lines directly
  cardStats: cells,
  stintSummary: (s) => {
    const c = cells(s);
    const g = c.find((x) => x.label === "G");
    // batters show AVG, pitchers ERA — whichever the line carries
    const key = c.find((x) => x.label === "AVG") ?? c.find((x) => x.label === "ERA");
    return [g && `${g.value} G`, key && `${key.value} ${key.label}`]
      .filter(Boolean)
      .join(" · ");
  },

  accoladeMeta: {
    all_star: { Icon: StarIcon, label: "All-Star" },
    champion: { Icon: CommissionersTrophyIcon, label: "WS champion" },
    mvp: { Icon: CrownIcon, label: "MVP" },
    ws_mvp: { Icon: WsMvpIcon, label: "World Series MVP", wordmark: true },
    cy_young: { Icon: CyYoungIcon, label: "Cy Young", wordmark: true },
    roy: { Icon: RoyIcon, label: "Rookie of the Year", wordmark: true },
    gold_glove: { Icon: GloveIcon, label: "Gold Glove" },
    silver_slugger: { Icon: BatIcon, label: "Silver Slugger" },
    batting_title: { Icon: BattingTitleIcon, label: "Batting title" },
    reliever_award: { Icon: RelieverIcon, label: "Reliever of the Year" },
    olympic_gold: { Icon: MedalIcon, label: "Olympic gold" },
  },

  hintLadder: [
    { key: "position", label: "Position" },
    { key: "batsThrows", label: "Bats / Throws" },
    { key: "height", label: "Height" },
    { key: "debutYear", label: "MLB debut" },
    { key: "born", label: "Born" },
  ],

  gradeLabels: {
    lost: "Released",
    allHints: "Walk-Off",
    someHints: "September Call-Up",
    one: "Cooperstown",
    half: "All-Star",
    most: "Everyday Starter",
    full: "Utility Man",
  },

  getStintSeasons: createSeasonDB(teamSeasonsJson as unknown as SeasonJSON),
  seasonLabel: plainYearLabel,

  // public launch day: puzzle #1 (Soriano) lands here
  storage: createStorage("journeyman:mlb", "2026-07-22"),
};
