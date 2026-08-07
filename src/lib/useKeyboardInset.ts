import { useEffect, useState } from "react";

/**
 * Distance (px) from the LAYOUT viewport's bottom edge up to the VISUAL
 * viewport's bottom edge — i.e. how far a position:fixed bottom bar must be
 * raised to sit at the bottom of what the user actually sees. 0 when they
 * coincide (no keyboard, no viewport shuffling).
 *
 * iOS pins fixed elements to the layout viewport, which the on-screen
 * keyboard covers. Worse, when the keyboard opens iOS reveals the focused
 * field by scrolling EITHER the document OR the visual viewport within the
 * layout viewport (offsetTop), depending on mood — a naive "keyboard
 * height" number computed once goes stale the moment it picks the second
 * option (the bar would lift, then snap back down). Recomputing this gap
 * from offsetTop+height on every visualViewport resize AND scroll keeps
 * the bar glued to the visible bottom through all of it.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const gap = Math.round(window.innerHeight - vv.height - vv.offsetTop);
      // <2px is layout rounding noise, not a keyboard
      setInset(gap > 2 ? gap : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
