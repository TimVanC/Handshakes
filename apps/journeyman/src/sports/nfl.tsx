import FootballJerseyRenderer, { type FootballEraStyle } from "../components/FootballJerseyRenderer";
import colorwaysJson from "@handshakes/jerseys/data/nfl/colorways.json";
import teamSeasonsJson from "../data/nfl/teamSeasons.json";
import { nflPuzzles } from "../data/nfl/puzzles";
import { NFL_ROSTER } from "../data/nfl/roster";
import { createPlayerSearch } from "../data/playerSearch";
import { createSeasonDB, plainYearLabel, type SeasonJSON } from "../data/seasonDB";
import { createStorage } from "../game/storage";
import type { ColorwayDB } from "../game/colorways";
import type { StatCell, Stint } from "../game/types";
import {
  ComebackIcon,
  CrownIcon,
  FirstTeamIcon,
  FootballIcon,
  LombardiIcon,
  MedalIcon,
  OpoyIcon,
  OroyIcon,
  DroyIcon,
  SbMvpIcon,
  StarIcon,
  TrophyIcon,
} from "../components/Icons";
import type { SportConfig } from "./types";

const colorways = colorwaysJson as unknown as ColorwayDB;

const cells = (s: Stint): StatCell[] => s.statLine ?? [];

export const nfl: SportConfig = {
  sport: "nfl",
  league: "NFL",
  ballIcon: FootballIcon,
  brandTag: "NFL",
  shareTag: "Journeyman NFL",
  shareEmoji: "🏈",
  tagline: "A mystery NFL journeyman, one jersey at a time.",

  puzzles: nflPuzzles,
  // authoring order IS the schedule: each puzzle airs once, new ones
  // queue for the next open day, nothing repeats until the pool runs dry
  scheduling: "release",
  dailyPool: 5, // unused in release mode
  roster: NFL_ROSTER,
  searchPlayers: createPlayerSearch(
    () => import("../data/nfl/playerIndex.json").then((m) => m.default as [string, string][])
  ),

  colorways,
  // NFL colorways carry per-era tricodes (OAK, SD, STL...) directly
  eraTricode: (era, franchise) => era.tricode ?? franchise,
  Jersey: ({ era, number, size, label }) => (
    <FootballJerseyRenderer
      primary={era.primary}
      secondary={era.secondary}
      trim={era.trim}
      number={number}
      eraStyle={era.eraStyle as FootballEraStyle}
      size={size}
      label={label}
    />
  ),
  DeckJersey: ({ size }) => (
    <FootballJerseyRenderer
      primary="#e8d3ad"
      secondary="#9c6b3a"
      trim="#5b3f27"
      number={null}
      eraStyle="stripes"
      size={size}
    />
  ),
  cardJerseySize: 96,
  jerseyAspect: 428 / 430, // FootballJerseyRenderer viewBox

  // NFL seasons are single calendar years
  stintYears: (s: Stint) =>
    s.startYear === s.endYear ? `${s.startYear}` : `${s.startYear}–${s.endYear}`,

  // puzzles author position-shaped 5-cell lines directly
  cardStats: cells,
  stintSummary: (s) => {
    const c = cells(s);
    // "57 GP · 11,654 Yds" — GP plus the yardage cell every position has
    const gp = c.find((x) => x.label === "GP");
    const yds = c.find((x) => x.label === "Yds");
    return [gp && `${gp.value} GP`, yds && `${Number(yds.value).toLocaleString()} Yds`]
      .filter(Boolean)
      .join(" · ");
  },

  accoladeMeta: {
    pro_bowl: { Icon: StarIcon, label: "Pro Bowl" },
    champion: { Icon: LombardiIcon, label: "Super Bowl champ" },
    mvp: { Icon: CrownIcon, label: "MVP" },
    sb_mvp: { Icon: SbMvpIcon, label: "Super Bowl MVP", wordmark: true },
    all_pro: { Icon: FirstTeamIcon, label: "First-Team All-Pro", wordmark: true },
    roy: { Icon: OroyIcon, label: "Off. Rookie of the Year", wordmark: true },
    droy: { Icon: DroyIcon, label: "Def. Rookie of the Year", wordmark: true },
    opoy: { Icon: OpoyIcon, label: "Off. Player of the Year", wordmark: true },
    comeback: { Icon: ComebackIcon, label: "Comeback Player", wordmark: true },
    // the Lombardi covers the ring, so the plain trophy is free for
    // the two statistical crowns
    rushing_title: { Icon: TrophyIcon, label: "Rushing title" },
    receiving_title: { Icon: TrophyIcon, label: "Receiving title" },
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
    lost: "Cut",
    allHints: "Hail Mary",
    someHints: "Practice Squad",
    one: "Hall of Fame",
    half: "All-Pro",
    most: "Starter",
    full: "Backup",
  },

  getStintSeasons: createSeasonDB(teamSeasonsJson as unknown as SeasonJSON),
  seasonLabel: plainYearLabel,

  // public launch day: puzzle #1 (Fitzpatrick) lands here
  storage: createStorage("journeyman:nfl", "2026-07-22"),
};
