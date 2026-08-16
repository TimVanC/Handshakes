import type { EasterEgg } from "../game/easterEggs";

const COLORS = ["#E03A3E", "#FDB927", "#007A33", "#1D428A", "#b3855a", "#1d1a13"];

/** Small one-shot confetti burst on solve. For the most special answers an
 *  EasterEgg swaps the paper bits for themed glyphs (crowns, unibrows...).
 *  Skipped for reduced motion. */
export default function Confetti({ egg = null }: { egg?: EasterEgg | null }) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  const colors = egg?.colors ?? COLORS;
  const pieces = Array.from({ length: 42 }, (_, i) => ({
    left: (i * 137.5) % 100, // golden-angle spread
    delay: (i % 7) * 0.09,
    duration: 2.1 + ((i * 53) % 100) / 90,
    color: colors[i % colors.length],
    drift: ((i * 29) % 60) - 30,
    spin: 420 + ((i * 71) % 480),
    size: 15 + ((i * 31) % 9), // glyph pieces vary a touch for depth
  }));
  return (
    <div className="confetti" aria-hidden="true" title={egg?.label}>
      {pieces.map((p, i) => (
        <i
          key={i}
          className={egg ? "shape" : undefined}
          style={
            {
              left: `${p.left}%`,
              background: egg ? undefined : p.color,
              color: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
              "--spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        >
          {egg && <egg.Icon size={p.size} />}
        </i>
      ))}
    </div>
  );
}
