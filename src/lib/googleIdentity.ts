import { supabase } from "./supabase";

/** The same Google OAuth client id configured on the Supabase Google provider,
 *  so tokens minted here resolve to the same accounts as the old redirect
 *  flow. Public by design — it ships in every OAuth URL. */
const GOOGLE_CLIENT_ID =
  "16593515496-mjpjg6q5r87k59sv0dcgdv82u3emmb5q.apps.googleusercontent.com";

/* Minimal typings for the slice of Google Identity Services we use. */
interface CredentialResponse {
  credential: string;
}
interface GoogleId {
  initialize(cfg: {
    client_id: string;
    callback: (resp: CredentialResponse) => void;
    nonce?: string;
  }): void;
  renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

function loadGis(): Promise<GoogleId> {
  return new Promise<GoogleId>((resolve, reject) => {
    const already = window.google?.accounts?.id;
    if (already) {
      resolve(already);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error("Google Identity Services loaded without accounts.id"));
    };
    s.onerror = () => reject(new Error("Couldn't load Google Identity Services"));
    document.head.appendChild(s);
  });
}

/** Google receives the SHA-256 hash and echoes it inside the ID token;
 *  Supabase gets the raw value and checks the hash matches — proving the
 *  token was minted for this page load and not replayed. */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return {
    raw,
    hashed: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join(""),
  };
}

/** Errors surface in whichever modal most recently asked for the button. */
let reportError: (message: string) => void = () => {};

/** initialize() must run exactly once per page load — calling it again while
 *  a button iframe is mid-handshake resets GSI's state and strands the
 *  iframe at 0×0 (which React StrictMode's double-effect does in dev). */
let gisInit: Promise<GoogleId> | null = null;
function initGis(): Promise<GoogleId> {
  gisInit ??= (async () => {
    const [gis, { raw, hashed }] = await Promise.all([loadGis(), makeNonce()]);
    gis.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashed,
      callback: async ({ credential }) => {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: credential,
          nonce: raw,
        });
        if (error) reportError(error.message);
        // success needs no handler — onAuthStateChange re-renders the modal
      },
    });
    return gis;
  })();
  gisInit.catch(() => {
    gisInit = null; // allow a retry (e.g. flaky network on first load)
  });
  return gisInit;
}

const renderedInto = new WeakSet<HTMLElement>();

/** Render Google's own sign-in button into `el`. The whole exchange runs on
 *  our origin (ID token → signInWithIdToken), so Google's popup shows
 *  journeymanjersey.com instead of the Supabase project URL. Rejects when the
 *  button can't load — callers should fall back to the redirect flow. */
export async function renderGoogleButton(
  el: HTMLElement,
  onError: (message: string) => void
): Promise<void> {
  reportError = onError;
  const gis = await initGis();
  if (!renderedInto.has(el)) {
    renderedInto.add(el);
    gis.renderButton(el, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      width: Math.max(200, Math.min(400, el.offsetWidth)),
    });
  }

  // GSI has no error callback for renderButton: on failure (origin not
  // authorized, iframe blocked) it just leaves a 0×0 iframe. Treat "no
  // visible button within 5s" as failure so the caller can fall back
  // rather than show nothing.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const iframe = el.querySelector("iframe");
    if (iframe && iframe.offsetHeight > 0) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Google button did not render (origin not authorized?)");
}
