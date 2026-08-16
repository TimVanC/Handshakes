import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { trackAccountCta } from "../lib/analytics";
import { SCORE_BUCKETS } from "../lib/cloud";
import { SPORTS, SPORT_ORDER } from "../sports";
import { todayET } from "../game/storage";

interface Props {
  onSignUp: () => void;
  onClose: () => void;
}

function loadLocalPreview() {
  let played = 0;
  let wins = 0;
  let dnf = 0;
  const scores: number[] = [];

  for (const sport of SPORT_ORDER) {
    const storage = SPORTS[sport].storage;
    const scoreLedger = storage.loadLocalScores();
    for (const [day, result] of Object.entries(storage.loadProfile().history)) {
      played++;
      if (result === "DNF") {
        dnf++;
        continue;
      }
      wins++;
      const score = scoreLedger[day];
      if (score !== undefined) scores.push(score);
    }
  }

  const scoreDist = SCORE_BUCKETS.map((bucket) => scores.filter(bucket.test).length);
  return {
    played,
    winPct: played > 0 ? Math.round((wins / played) * 100) : 0,
    perfect: scores.filter((score) => score === 1000).length,
    avgScore:
      scores.length > 0
        ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length)
        : null,
    distribution: [
      ...SCORE_BUCKETS.map((bucket, i) => ({ label: bucket.label, count: scoreDist[i] })),
      { label: "0", count: dnf },
    ],
  };
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function loadArchivePreview() {
  const today = todayET();
  // Today's slate is the first date where all three launch-day leagues are
  // guaranteed to exist, so the preview never demonstrates locked rows.
  const selected = today;
  const selectedDate = new Date(`${selected}T12:00:00Z`);
  const year = selectedDate.getUTCFullYear();
  const month = selectedDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const monthLabel = selectedDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const selectedLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const dateString = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const slateFor = (date: string) => {
    let available = 0;
    let played = 0;
    let wins = 0;
    for (const sport of SPORT_ORDER) {
      const storage = SPORTS[sport].storage;
      const day = storage.dayNumberForDate(date);
      if (day < 1) continue;
      available++;
      const result = storage.loadProfile().history[day];
      if (result !== undefined) {
        played++;
        if (result !== "DNF") wins++;
      }
    }
    if (available === 0 || played === 0) return "none";
    if (played < available) return "partial";
    if (wins === played) return "all-won";
    if (wins === 0) return "all-lost";
    return "mixed";
  };

  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = dateString(day);
    return {
      day,
      isToday: date === today,
      isSelected: date === selected,
      isFuture: date > today,
      state: slateFor(date),
    };
  });

  const leagues = SPORT_ORDER.map((sport) => {
    const storage = SPORTS[sport].storage;
    const day = storage.dayNumberForDate(selected);
    if (day < 1) return { sport, day, status: "Not launched yet", playable: false };
    const result = storage.loadProfile().history[day];
    return {
      sport,
      day,
      status: result === undefined ? "Not played" : result === "DNF" ? "Missed" : "Solved",
      playable: true,
    };
  });

  return { selected, selectedDate, selectedLabel, monthLabel, leading, days, leagues };
}

/** A focused second step over the result card: show the value of an account
 *  while the completed game remains visible underneath. */
export default function AccountSavePrompt({ onSignUp, onClose }: Props) {
  const preview = useMemo(loadLocalPreview, []);
  const archive = useMemo(loadArchivePreview, []);
  const maxBar = Math.max(1, ...preview.distribution.map((row) => row.count));
  const [phase, setPhase] = useState<"stats" | "calendar" | "day">("stats");
  const [autoPlay, setAutoPlay] = useState(true);
  const [animatedMetrics, setAnimatedMetrics] = useState({
    played: 0,
    winPct: 0,
    perfect: 0,
    avgScore: preview.avgScore === null ? null : 0,
  });

  useEffect(() => {
    trackAccountCta({ source: "result", action: "viewed" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!autoPlay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const delay = phase === "stats" ? 1600 : phase === "calendar" ? 1900 : 2600;
    const timer = window.setTimeout(
      () => setPhase(phase === "stats" ? "calendar" : phase === "calendar" ? "day" : "stats"),
      delay
    );
    return () => window.clearTimeout(timer);
  }, [phase, autoPlay]);

  useEffect(() => {
    const targets = {
      played: preview.played,
      winPct: preview.winPct,
      perfect: preview.perfect,
      avgScore: preview.avgScore,
    };
    const zero = {
      played: 0,
      winPct: 0,
      perfect: 0,
      avgScore: preview.avgScore === null ? null : 0,
    };

    if (phase !== "stats") {
      setAnimatedMetrics(zero);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnimatedMetrics(targets);
      return;
    }

    setAnimatedMetrics(zero);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedMetrics({
        played: Math.round(targets.played * eased),
        winPct: Math.round(targets.winPct * eased),
        perfect: Math.round(targets.perfect * eased),
        avgScore: targets.avgScore === null ? null : Math.round(targets.avgScore * eased),
      });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, preview.avgScore, preview.perfect, preview.played, preview.winPct]);

  const pickSlide = (next: "stats" | "calendar") => {
    setAutoPlay(false);
    setPhase(next === "stats" ? "stats" : phase === "calendar" ? "day" : "calendar");
  };

  return (
    <div
      className="modal-backdrop account-prompt-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-game-title"
        className="modal-panel account-prompt-panel p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="account-save-eyebrow">Free account preview</p>
            <h2 id="save-game-title" className="font-display mt-0.5 text-2xl tracking-wide">
              KEEP YOUR GAMES
            </h2>
          </div>
          <button type="button" className="chip account-prompt-close cursor-pointer" onClick={onClose} aria-label="Not now">
            ✕
          </button>
        </div>

        <div className="account-preview-stage mt-4">
          <div className={`account-preview-carousel${phase === "stats" ? "" : " is-archive"}`}>
            <article
              className={`account-preview-face account-locker-preview${phase === "stats" ? " is-stats-active" : ""}`}
              aria-hidden={phase !== "stats"}
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-lg tracking-wide">YOUR LOCKER</p>
                <span className="account-save-badge">LIVE STATS</span>
              </div>

              <div className="account-preview-tabs mt-2" aria-hidden="true">
                {["All", "NBA", "NFL", "MLB"].map((label, i) => (
                  <span key={label} className={i === 0 ? "is-active" : ""}>{label}</span>
                ))}
              </div>

              <div className="account-preview-metrics mt-3">
                <span><strong>{animatedMetrics.played}</strong><small>Played</small></span>
                <span><strong>{animatedMetrics.winPct}</strong><small>Win %</small></span>
                <span><strong>{animatedMetrics.perfect}</strong><small>Perfect</small></span>
                <span><strong>{animatedMetrics.avgScore ?? "—"}</strong><small>Avg score</small></span>
              </div>

              <p className="account-preview-heading mt-3">Score distribution</p>
              <div className="mt-1.5 space-y-1">
                {preview.distribution.map((row, i) => (
                  <div className="account-preview-bar-row" key={row.label}>
                    <span>{row.label}</span>
                    <div className="account-preview-bar-track">
                      <i
                        className={`account-preview-bar-fill${i === preview.distribution.length - 1 ? " is-dnf" : ""}`}
                        style={{ "--preview-fill": row.count / maxBar } as CSSProperties}
                      />
                      <b>{row.count}</b>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article
              className={`account-preview-face account-preview-archive${phase === "calendar" ? " is-calendar-active" : ""}`}
              aria-hidden={phase === "stats"}
            >
              {phase === "calendar" && <div className="account-archive-view is-active">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg tracking-wide">ARCHIVE</p>
                  <span className="account-save-badge">EVERY GAME</span>
                </div>
                <p className="account-archive-month">{archive.monthLabel}</p>
                <div className="account-calendar-grid mt-1">
                  {WEEKDAYS.map((weekday, i) => <b key={`${weekday}${i}`}>{weekday}</b>)}
                  {Array.from({ length: archive.leading }, (_, i) => <span key={`blank${i}`} />)}
                  {archive.days.map((day) => (
                    <span
                      key={day.day}
                      className={[
                        day.state !== "none" ? `is-${day.state}` : "",
                        day.isToday ? "is-today" : "",
                        day.isSelected ? "is-selected" : "",
                        day.isFuture ? "is-future" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      {day.day}
                    </span>
                  ))}
                </div>
                <div className="account-calendar-key mt-2">
                  <span><i className="is-all-won" /> Solved all</span>
                  <span><i className="is-partial" /> Played some</span>
                  <span><i className="is-all-lost" /> Missed</span>
                </div>
              </div>}

              {phase === "day" && <div className="account-archive-view account-archive-day is-active">
                <p className="text-[0.58rem] font-bold text-wood-deep underline">‹ Back to archive</p>
                <h3 className="font-display mt-1 text-lg leading-none">{archive.selectedLabel}</h3>
                <div className="mt-3 space-y-1.5">
                  {archive.leagues.map((league) => (
                    <div
                      key={league.sport}
                      className={`account-archive-league${league.playable ? " is-playable" : ""}`}
                    >
                      <span>
                        <strong>{SPORTS[league.sport].league}</strong>
                        <small>{league.playable ? `No. ${league.day} · ${league.status}` : league.status}</small>
                      </span>
                      {league.playable && <b>{league.status === "Not played" ? "Play" : "Replay"}</b>}
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[0.55rem] leading-relaxed text-ink-soft">
                  Archive games count in your stats but not your daily streak.
                </p>
              </div>}
            </article>
          </div>
        </div>

        <div className="account-preview-dots mt-2" role="tablist" aria-label="Account benefit preview">
          <button
            type="button"
            className={phase === "stats" ? "is-active" : ""}
            aria-label="Show stats preview"
            aria-selected={phase === "stats"}
            role="tab"
            onClick={() => pickSlide("stats")}
          />
          <button
            type="button"
            className={phase !== "stats" ? "is-active" : ""}
            aria-label={phase === "calendar" ? "Expand the highlighted archive day" : "Show archive preview"}
            aria-selected={phase !== "stats"}
            role="tab"
            onClick={() => pickSlide("calendar")}
          />
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Keep building your real stats, sync them across devices, and open any
          day in the NBA, NFL, and MLB archive.
        </p>

        <button type="button" className="btn account-cta mt-4 w-full py-3.5 text-sm" onClick={onSignUp}>
          Save this game to my stats
        </button>
        <button type="button" className="mt-3 w-full text-center text-xs font-bold text-ink-soft underline underline-offset-2" onClick={onClose}>
          Not now
        </button>
        <p className="mt-3 text-center text-[0.65rem] font-semibold text-ink-soft">
          Free forever · Your existing games come with you
        </p>
      </section>
    </div>
  );
}
