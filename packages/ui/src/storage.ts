/**
 * Sport-agnostic daily-game storage. Each game/sport combination gets its own
 * prefix (its own launch date, day numbering, saves, streak, scores, archive).
 * The saved game state is app-specific, so the factory is generic over it —
 * the only thing storage needs to know is which day a save belongs to.
 */

/** Calendar date in America/New_York, as YYYY-MM-DD.
 *  Uses the client clock; server-side rollover is a later phase. */
export function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateToUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — game still works, just won't persist */
  }
}

export interface Profile {
  streak: number;
  lastSolvedDay: number | null;
  /** day number → result summary number, or "DNF" */
  history: Record<string, number | "DNF">;
}

export interface SportStorage<TGame extends { day: number }> {
  /** Puzzle #1 lands on this ET calendar date. */
  launchDate: string;
  /** Daily puzzle number: #1 on launch day, +1 per ET midnight. */
  currentDayNumber(): number;
  /** Puzzle day number for any YYYY-MM-DD date (may be < 1 pre-launch). */
  dayNumberForDate(dateStr: string): number;
  /** The ET calendar date a puzzle number fell on (inverse of the above) */
  dateForDay(day: number): string;
  /** localStorage key for a day's save slot (test-mode resets need it) */
  gameKey(day: number): string;
  profileKey: string;
  loadGameState(day: number): TGame | null;
  saveGameState(state: TGame): void;
  loadProfile(): Profile;
  /** Record a finished game exactly once; returns the updated profile. */
  recordResult(day: number, result: number | "DNF"): Profile;
  /** Streak shown in the header — stale streaks (missed a day) read as 0. */
  displayStreak(profile: Profile, today: number): number;
  loadLocalScores(): Record<string, number>;
  /** Record a game's score exactly once (first result stands). */
  recordLocalScore(day: number, score: number): void;
  loadArchiveResults(): Record<string, number | "DNF">;
  /** Record an archive game exactly once (first result stands). */
  recordArchiveResult(day: number, result: number | "DNF"): void;
}

export function createStorage<TGame extends { day: number }>(
  prefix: string,
  launchDate: string
): SportStorage<TGame> {
  const profileKey = `${prefix}:profile:v1`;
  const scoresKey = `${prefix}:scores:v1`;
  const archiveKey = `${prefix}:archive:v1`;
  const gameKey = (day: number) => `${prefix}:game:v1:${day}`;

  const dayNumberForDate = (dateStr: string) => {
    const diff = dateToUTC(dateStr) - dateToUTC(launchDate);
    return Math.round(diff / 86_400_000) + 1;
  };

  // plain closures (no `this`) so callers can freely destructure methods
  const loadProfile = () =>
    read<Profile>(profileKey) ?? { streak: 0, lastSolvedDay: null, history: {} };

  /* Local score ledger (day → points). The profile history only keeps
     a result summary, so this is what lets a later sign-in sync full scores
     up to the cloud instead of scoreless rows. */
  const loadLocalScores = () => read<Record<string, number>>(scoresKey) ?? {};

  /* Archive plays — kept OUT of the daily profile so replaying past
     puzzles never touches the live streak. */
  const loadArchiveResults = () =>
    read<Record<string, number | "DNF">>(archiveKey) ?? {};

  return {
    launchDate,
    dayNumberForDate,
    dateForDay: (day: number) =>
      new Date(dateToUTC(launchDate) + (day - 1) * 86_400_000)
        .toISOString()
        .slice(0, 10),
    currentDayNumber: () => Math.max(1, dayNumberForDate(todayET())),
    gameKey,
    profileKey,

    loadGameState(day) {
      const s = read<TGame>(gameKey(day));
      return s && s.day === day ? s : null;
    },
    saveGameState(state) {
      write(gameKey(state.day), state);
    },

    loadProfile,
    recordResult(day, result) {
      const profile = loadProfile();
      if (profile.history[day] !== undefined) return profile;

      profile.history[day] = result;
      if (result === "DNF") {
        profile.streak = 0;
      } else {
        profile.streak = profile.lastSolvedDay === day - 1 ? profile.streak + 1 : 1;
        profile.lastSolvedDay = day;
      }
      write(profileKey, profile);
      return profile;
    },
    displayStreak(profile, today) {
      if (profile.lastSolvedDay === null) return 0;
      return profile.lastSolvedDay >= today - 1 ? profile.streak : 0;
    },

    loadLocalScores,
    recordLocalScore(day, score) {
      const all = loadLocalScores();
      if (all[day] !== undefined) return;
      all[day] = score;
      write(scoresKey, all);
    },

    loadArchiveResults,
    recordArchiveResult(day, result) {
      const all = loadArchiveResults();
      if (all[day] !== undefined) return;
      all[day] = result;
      write(archiveKey, all);
    },
  };
}
