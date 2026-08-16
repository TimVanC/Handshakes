import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * SESSION_6 bundle trim: production builds must not ship unaired answers.
 * `vite build` remaps the authored data modules to the aired-only files
 * that pipeline/trim-unaired.mjs generates (wired into `npm run build`
 * just before this). Dev is untouched — authoring, the DEV validators,
 * and the ?p= test picker keep the full arrays. Suffix matching (not
 * fs paths) keeps this file free of node type imports, which tsconfig
 * deliberately excludes.
 */
const AIRED_REMAP: [from: string, to: string][] = [
  ["/src/data/puzzles.ts", "/src/data/generated/nba-puzzles.ts"],
  ["/src/data/roster.ts", "/src/data/generated/nba-roster.ts"],
  ["/src/data/nfl/puzzles.ts", "/src/data/generated/nfl-puzzles.ts"],
  ["/src/data/mlb/puzzles.ts", "/src/data/generated/mlb-puzzles.ts"],
  ["/src/data/nfl/roster.ts", "/src/data/generated/nfl-roster.ts"],
  ["/src/data/mlb/roster.ts", "/src/data/generated/mlb-roster.ts"],
];

function airedDataOnly(): Plugin {
  return {
    name: "journeyman:aired-data-only",
    apply: "build",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const id = resolved.id.replace(/\\/g, "/");
      for (const [from, to] of AIRED_REMAP) {
        // a missing generated file fails the build loudly at load time —
        // npm run build generates them right before vite build
        if (id.endsWith(from)) return id.slice(0, -from.length) + to;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), airedDataOnly()],
  // honour $PORT when something upstream assigns one (preview harnesses,
  // container runtimes); otherwise vite's own default. Read off globalThis so
  // this stays typecheckable without pulling in @types/node.
  server: { port: Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PORT) || undefined },
});
