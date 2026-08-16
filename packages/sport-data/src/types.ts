/** Sport-agnostic dataset schema. Every table carries `sport`; nothing in the
 *  graph, solver, or generator may contain league-specific logic. */

export interface Player {
  /** stable slug, e.g. "nash-steve-01" */
  id: string;
  sport: string;
  full_name: string;
  /** season END years (2004-05 → 2005) */
  first_season: number;
  last_season: number;
  career_games: number;
  /** 0-100 percentile of casual-fan recognizability; endpoint eligibility only */
  notability: number;
  /** source-system id (stats.nba.com person id for sport="nba") */
  nba_person_id?: number;
}

export interface Franchise {
  /** franchise-level id, follows relocations, e.g. "nba-okc" */
  id: string;
  sport: string;
  name: string;
}

export interface TeamSeason {
  /** era tricode + season end year, e.g. "PHX-2005" */
  id: string;
  sport: string;
  franchise_id: string;
  /** season END year: 2004-05 → 2005 */
  season: number;
  /** era-correct, e.g. "2004-05 Phoenix Suns" */
  display_name: string;
}

export interface Appearance {
  player_id: string;
  team_season_id: string;
  games_played: number;
}

export interface SportDataset {
  players: Player[];
  franchises: Franchise[];
  team_seasons: TeamSeason[];
  appearances: Appearance[];
}
