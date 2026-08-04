import JerseyCard from "./JerseyCard";
import { SPORT } from "../sports/active";
import { sportHref } from "../sports";

/**
 * Dev/Vercel-preview-only real-puzzle inspector (`?inspect&p=N`). It keeps
 * spoilers out of production while giving editorial review one page with the
 * answer, full profile, every jersey front, and every statistical back.
 */
export default function PuzzleInspectPreview() {
  const requested = Number(new URLSearchParams(location.search).get("p"));
  const index = Number.isInteger(requested) && requested >= 1 ? requested - 1 : 0;
  const puzzle = SPORT.puzzles[index];

  if (!puzzle) {
    return (
      <main className="min-h-dvh p-6">
        <h1 className="font-display text-2xl">Puzzle not found</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Choose a puzzle from 1 through {SPORT.puzzles.length}.
        </p>
      </main>
    );
  }

  const href = (p: number) => `${sportHref(SPORT.sport, { p })}&inspect`;

  return (
    <main className="min-h-dvh px-4 py-6 md:px-8">
      <header className="mx-auto max-w-5xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">
          {SPORT.league} puzzle {index + 1} of {SPORT.puzzles.length} · fully revealed
        </p>
        <h1 className="font-display mt-1 text-3xl tracking-wide">{puzzle.answer}</h1>
        {puzzle.accolades?.length ? (
          <p className="mt-1 text-sm text-ink-soft">{puzzle.accolades.join(" · ")}</p>
        ) : null}

        <nav className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Puzzle inspector navigation">
          {index > 0 ? <a className="chip px-3 py-1 text-xs font-bold" href={href(index)}>← Previous</a> : null}
          {index + 1 < SPORT.puzzles.length ? (
            <a className="chip px-3 py-1 text-xs font-bold" href={href(index + 2)}>Next →</a>
          ) : null}
        </nav>

        <dl className="mx-auto mt-5 grid max-w-3xl grid-cols-2 gap-2 sm:grid-cols-5">
          {SPORT.hintLadder.map(({ key, label }) => (
            <div className="rounded-lg border border-line bg-card px-2 py-2" key={key}>
              <dt className="text-[0.6rem] font-bold uppercase tracking-wide text-ink-soft">{label}</dt>
              <dd className="mt-0.5 text-sm font-bold">{puzzle.hints[key]}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="mt-7" aria-labelledby="jersey-fronts">
        <h2 id="jersey-fronts" className="text-center font-display text-xl">All jersey fronts</h2>
        <div className="card-spread">
          <div className="card-row">
            {puzzle.stints.map((stint, i) => (
              <JerseyCard key={`front-${i}`} stint={stint} spreadIndex={i} isNewest={false} showLabel />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-4" aria-labelledby="jersey-backs">
        <h2 id="jersey-backs" className="text-center font-display text-xl">All flipped statistical backs</h2>
        <div className="card-spread">
          <div className="card-row">
            {puzzle.stints.map((stint, i) => (
              <JerseyCard
                key={`back-${i}`}
                stint={stint}
                spreadIndex={i}
                isNewest={false}
                showLabel
                initialBack
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
