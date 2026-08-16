import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { SPORTS, SPORT_ORDER, sportHref } from "../sports";
import type { Sport } from "../sports/types";
import { fetchAllResults, type CloudResult } from "../lib/cloud";
import { todayET } from "../game/storage";
import { LockIcon } from "./Icons";

interface Props {
  session: Session | null;
  onClose: () => void;
  /** logged-out CTA routes here to create the free account */
  onSignUp: () => void;
}

/** One archive for all three games. Days are colored by how the whole
 *  slate went, and tapping one opens that date's three puzzles. */
export default function ArchiveModal({ session, onClose, onSignUp }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label="Puzzle archive" className="modal-panel p-5">
        {session ? (
          <ArchiveCalendar onClose={onClose} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-2xl">Archive</h2>
              <button type="button" className="chip cursor-pointer" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="mt-4 flex flex-col items-center gap-3 text-center text-sm">
              <LockIcon size={28} className="text-wood-deep" />
              <p className="leading-relaxed">
                Every past puzzle — all three leagues — lives here, and it's
                yours with a <strong>free account</strong>. No card, no catch:
                just sign up and replay the whole back catalog.
              </p>
              <button type="button" className="btn btn-primary w-full py-2.5" onClick={onSignUp}>
                Create a free account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const ym = (y: number, m: number) => y * 12 + m;

/** how a single date's slate went, across every league live that day */
interface DaySlate {
  /** leagues that had a puzzle on this date */
  available: Array<{ sport: Sport; day: number; won?: boolean }>;
  played: number;
  wins: number;
}

type SlateColor = "none" | "partial" | "mixed" | "all-won" | "all-lost";

function slateColor(s: DaySlate): SlateColor {
  if (s.available.length === 0 || s.played === 0) return "none";
  if (s.played < s.available.length) return "partial";
  if (s.wins === s.played) return "all-won";
  if (s.wins === 0) return "all-lost";
  return "mixed";
}

const SWATCH: Record<Exclude<SlateColor, "none">, string> = {
  "all-won": "bg-[#2e7d43] text-[#faf6ec]",
  mixed: "bg-[#d97a2b] text-[#faf6ec]",
  partial: "bg-[#e3b23c] text-ink",
  "all-lost": "bg-[#b3362a] text-[#faf6ec]",
};

function ArchiveCalendar({ onClose }: { onClose: () => void }) {
  const [cloud, setCloud] = useState<CloudResult[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetchAllResults().then(setCloud);
  }, []);

  const todayStr = todayET();
  const [view, setView] = useState(() => ({
    y: Number(todayStr.slice(0, 4)),
    m: Number(todayStr.slice(5, 7)) - 1, // 0-based month
  }));

  // per-sport day → won?, from local ledgers first then the cloud
  const outcomes: Record<Sport, Map<number, boolean>> = {
    nba: new Map(),
    nfl: new Map(),
    mlb: new Map(),
  };
  for (const s of SPORT_ORDER) {
    const st = SPORTS[s].storage;
    for (const [d, res] of Object.entries({
      ...st.loadProfile().history,
      ...st.loadArchiveResults(),
    })) {
      outcomes[s].set(Number(d), res !== "DNF");
    }
  }
  for (const r of cloud ?? []) {
    if (r.sport && outcomes[r.sport]) outcomes[r.sport].set(r.day, r.won);
  }

  /** which leagues were live on a date, and how each went */
  const slateFor = (ds: string): DaySlate => {
    const available: DaySlate["available"] = [];
    let played = 0;
    let wins = 0;
    for (const s of SPORT_ORDER) {
      const day = SPORTS[s].storage.dayNumberForDate(ds);
      if (day < 1) continue; // that league hadn't launched yet
      const won = outcomes[s].get(day);
      available.push({ sport: s, day, won });
      if (won !== undefined) {
        played++;
        if (won) wins++;
      }
    }
    return { available, played, wins };
  };

  // the calendar starts the month the first league launched
  const firstLaunch = SPORT_ORDER.map((s) => SPORTS[s].storage.launchDate).sort()[0];
  const launchYm = ym(Number(firstLaunch.slice(0, 4)), Number(firstLaunch.slice(5, 7)) - 1);
  const todayYm = ym(Number(todayStr.slice(0, 4)), Number(todayStr.slice(5, 7)) - 1);
  const viewYm = ym(view.y, view.m);

  const first = new Date(Date.UTC(view.y, view.m, 1));
  const leadingBlanks = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const monthLabel = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dateStr = (d: number) =>
    `${view.y}-${String(view.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const move = (dir: -1 | 1) =>
    setView((v) => {
      const next = ym(v.y, v.m) + dir;
      return { y: Math.floor(next / 12), m: ((next % 12) + 12) % 12 };
    });

  const cellBase =
    "flex h-9 w-full items-center justify-center rounded-full text-sm tabular-nums";

  // ---- a single date's three puzzles ----
  if (selected) {
    const slate = slateFor(selected);
    const pretty = new Date(`${selected}T12:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return (
      <>
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              type="button"
              className="text-xs font-bold text-wood-deep underline underline-offset-2"
              onClick={() => setSelected(null)}
            >
              ‹ Back to archive
            </button>
            <h2 className="font-display mt-1 text-2xl leading-none">{pretty}</h2>
          </div>
          <button type="button" className="chip cursor-pointer" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {SPORT_ORDER.map((s) => {
            const entry = slate.available.find((a) => a.sport === s);
            if (!entry) {
              return (
                <div
                  key={s}
                  className="flex items-center justify-between rounded-xl border-2 border-dashed border-line px-3 py-3 text-sm text-ink-soft"
                >
                  <span className="font-display text-lg tracking-wide">{SPORTS[s].league}</span>
                  <span className="text-xs">Not launched yet</span>
                </div>
              );
            }
            const status =
              entry.won === true ? "Solved" : entry.won === false ? "Missed" : "Not played";
            return (
              <a
                key={s}
                href={sportHref(s, { d: entry.day })}
                className="home-card flex items-center gap-3 px-3 py-3"
              >
                <span className="flex-1 text-left">
                  <span className="font-display block text-lg leading-none tracking-wide">
                    {SPORTS[s].league}
                  </span>
                  <span className="mt-1 block text-[0.7rem] leading-none text-ink-soft">
                    No. {entry.day} ·{" "}
                    <span
                      className={
                        entry.won === true
                          ? "font-bold text-[#2e7d43]"
                          : entry.won === false
                            ? "font-bold text-[#b3362a]"
                            : ""
                      }
                    >
                      {status}
                    </span>
                  </span>
                </span>
                <span className="home-card-cta shrink-0">
                  {entry.won === undefined ? "Play" : "Replay"}
                </span>
              </a>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-ink-soft">
          Archive games count in your stats but not your daily streak.
        </p>
      </>
    );
  }

  // ---- the month grid ----
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-2xl">Archive</h2>
        <button type="button" className="chip cursor-pointer" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          className="chip cursor-pointer font-bold disabled:opacity-30"
          onClick={() => move(-1)}
          disabled={viewYm <= launchYm}
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="font-display text-lg tracking-wide">{monthLabel}</p>
        <button
          type="button"
          className="chip cursor-pointer font-bold disabled:opacity-30"
          onClick={() => move(1)}
          disabled={viewYm >= todayYm}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-[0.6rem] font-bold uppercase text-ink-soft">
            {w}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const ds = dateStr(d);
          const isToday = ds === todayStr;
          const slate = slateFor(ds);
          const playable = slate.available.length > 0 && ds < todayStr;

          if (isToday) {
            return (
              <button
                key={d}
                type="button"
                className={`${cellBase} border-2 border-ink font-bold`}
                title="Today"
                onClick={() => setSelected(ds)}
              >
                {d}
              </button>
            );
          }
          if (playable) {
            const color = slateColor(slate);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(ds)}
                title={`${slate.played}/${slate.available.length} played · ${slate.wins} solved`}
                className={`${cellBase} ${
                  color === "none"
                    ? "border border-line font-medium hover:border-ink"
                    : `${SWATCH[color]} font-bold`
                }`}
              >
                {d}
              </button>
            );
          }
          return (
            <span key={d} className={`${cellBase} text-ink-soft/40`}>
              {d}
            </span>
          );
        })}
      </div>

      {/* key */}
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.68rem] text-ink-soft">
        <Key className="bg-[#2e7d43]" label="Solved all 3" />
        <Key className="bg-[#d97a2b]" label="Won some, lost some" />
        <Key className="bg-[#e3b23c]" label="Played 1–2 of 3" />
        <Key className="bg-[#b3362a]" label="Lost every game" />
      </ul>
      <p className="mt-2 text-[0.68rem] text-ink-soft">
        Tap a day to pick a league. Archive games count in your stats but not
        your daily streak.
      </p>
    </>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />
      {label}
    </li>
  );
}
