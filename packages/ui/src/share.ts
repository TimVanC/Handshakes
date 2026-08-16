/** Shared share-sheet plumbing: native share on mobile, clipboard fallback.
 *  Each game builds its own share text; only the delivery is shared. */

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // legacy fallback for older mobile browsers / http contexts
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Try the native share sheet; fall back to clipboard.
 *  Returns "shared" | "copied" | "failed" so the caller can word the toast. */
export async function shareText(text: string): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      // AbortError = user closed the sheet; not a failure worth a fallback
      if ((err as DOMException)?.name === "AbortError") return "failed";
    }
  }
  return (await copyToClipboard(text)) ? "copied" : "failed";
}
