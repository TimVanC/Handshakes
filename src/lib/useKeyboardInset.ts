import { useEffect, useState } from "react";

/**
 * How much of the layout viewport's bottom the on-screen keyboard covers,
 * in px (0 when closed).
 *
 * iOS Safari pins position:fixed elements to the LAYOUT viewport, which the
 * keyboard overlays — so a fixed bottom bar simply vanishes behind it. The
 * only reliable signal is the visualViewport shrinking; whoever renders the
 * bar lifts it by this amount so it rides on top of the keyboard.
 *
 * The 100px floor filters out the small visual-viewport wobbles Safari
 * emits when the address bar collapses/expands — no keyboard is that short,
 * and treating a wobble as a keyboard would bounce the bar around.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setInset(kb > 100 ? Math.round(kb) : 0);
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
