/** The 🤝 share — the emoji IS the scoring unit. One 🤝 per handshake in the
 *  final chain, hint penalties included (they're handshakes too). No player
 *  names: the share must never spoil the day's puzzle. */

export const SHARE_ORIGIN = "https://handshakes.game";

export function buildShareText(opts: {
  day: number;
  handshakes: number;
  par: number;
  status: "solved" | "gave_up";
}): string {
  const { day, handshakes, par, status } = opts;
  if (status === "gave_up") {
    return [`Handshakes #${day}`, `Par ${par} — left hanging`, SHARE_ORIGIN].join("\n");
  }
  const over = handshakes - par;
  const verdict =
    over <= 0
      ? "clean sweep"
      : over === 1
        ? "one extra"
        : over === 2
          ? "two extra"
          : "the long way around";
  return [
    `Handshakes #${day}`,
    "🤝".repeat(handshakes),
    "",
    `Par ${par} — ${verdict}`,
    SHARE_ORIGIN,
  ].join("\n");
}
