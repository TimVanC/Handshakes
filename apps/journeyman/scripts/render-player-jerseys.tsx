/**
 * SSR-renders the REAL in-game jersey renderers for three specific players at
 * their most notable stop, using the actual colorway JSON + resolveColorway.
 * Output: design/jerseys/game/<player>.svg (+ .png preview). These are exactly
 * the jerseys the game draws — no re-drawing. Run: `npx tsx scripts/render-player-jerseys.tsx`
 */
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

import { StarIcon, GloveIcon, BatIcon } from "../src/components/Icons";
import JerseyRenderer, { type EraStyle } from "../src/components/JerseyRenderer";
import FootballJerseyRenderer, {
  type FootballEraStyle,
} from "../src/components/FootballJerseyRenderer";
import BaseballBackJerseyRenderer, {
  type BaseballEraStyle,
} from "../src/components/BaseballBackJerseyRenderer";
import { resolveColorway, type ColorwayDB } from "../src/game/colorways";
import nbaColors from "../src/data/colorways.json";
import nflColors from "../src/data/nfl/colorways.json";
import mlbColors from "../src/data/mlb/colorways.json";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../design/jerseys/game");
mkdirSync(outDir, { recursive: true });

const fontFiles = [
  join(here, "assets/ArchivoBlack.ttf"),
  join(here, "assets/Archivo.ttf"),
  join(here, "assets/Anton.ttf"),
];

type Job = { file: string; svg: string };

function eraOrThrow(db: ColorwayDB, fr: string, a: number, b: number) {
  const era = resolveColorway(db, fr, a, b);
  if (!era) throw new Error(`no colorway for ${fr} ${a}-${b}`);
  return era;
}

const SIZE = 320;

// NBA — Ish Smith, Detroit Pistons 2016–2019, #14
const nbaEra = eraOrThrow(nbaColors as unknown as ColorwayDB, "DET", 2016, 2018);
// NFL — Ryan Fitzpatrick, Buffalo Bills 2009–2012, #14
const nflEra = eraOrThrow(nflColors as unknown as ColorwayDB, "BUF", 2009, 2012);
// MLB — Rickey Henderson, Oakland A's 1979–1984, #24
const mlbEra = eraOrThrow(mlbColors as unknown as ColorwayDB, "OAK", 1979, 1984);

const jobs: Job[] = [
  {
    file: "ish-smith-pistons",
    svg: renderToStaticMarkup(
      <JerseyRenderer
        primary={nbaEra.primary}
        secondary={nbaEra.secondary}
        trim={nbaEra.trim}
        number={14}
        eraStyle={nbaEra.eraStyle as EraStyle}
        size={SIZE}
        label={"DET"}
      />
    ),
  },
  {
    file: "ryan-fitzpatrick-bills",
    svg: renderToStaticMarkup(
      <FootballJerseyRenderer
        primary={nflEra.primary}
        secondary={nflEra.secondary}
        trim={nflEra.trim}
        number={14}
        eraStyle={nflEra.eraStyle as FootballEraStyle}
        size={SIZE}
        label={nflEra.tricode ?? "BUF"}
      />
    ),
  },
  {
    file: "rickey-henderson-athletics",
    svg: renderToStaticMarkup(
      <BaseballBackJerseyRenderer
        primary={mlbEra.primary}
        secondary={mlbEra.secondary}
        trim={mlbEra.trim}
        number={24}
        eraStyle={mlbEra.eraStyle as BaseballEraStyle}
        size={SIZE}
        label={mlbEra.tricode ?? "OAK"}
      />
    ),
  },
];

/** React SSR omits the SVG namespace; add it so the file is valid standalone
 *  and the rasterizer can parse it. */
function withNS(svg: string): string {
  return svg.includes("xmlns=")
    ? svg
    : svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
}

for (const j of jobs) {
  const svg = withNS(j.svg);
  writeFileSync(join(outDir, `${j.file}.svg`), svg);
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 720 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Archivo" },
  })
    .render()
    .asPng();
  writeFileSync(join(outDir, `${j.file}.png`), png);
  console.log("wrote jersey", j.file);
}

/* --------------------------------------------------------------------------
 * Full card composite — the game's JerseyCard front rebuilt as a standalone
 * SVG (year · real jersey · accolade icons · 5-stat grid) so it can be
 * exported to an image headlessly.
 * ------------------------------------------------------------------------ */
const INK = "#1d1a13";
const INK_SOFT = "#6b6353";
const LINE = "#d3c8ae";
const CARD = "#faf6ec";
const WOOD_DEEP = "#8c6239";

/** Nest an SSR'd jersey <svg> at (x,y) scaled to width w, preserving aspect. */
function embedJersey(svg: string, x: number, y: number, w: number): { markup: string; h: number } {
  const vb = svg.match(/viewBox="([^"]+)"/)![1];
  const [, , vw, vh] = vb.split(/\s+/).map(Number);
  const h = w * (vh / vw);
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return { markup: `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`, h };
}

function icon(fn: (p: { size?: number }) => unknown, x: number, y: number, size: number, color: string) {
  let s = withNS(renderToStaticMarkup(fn({ size }) as never));
  // the Icon set inherits color via stroke/fill=currentColor; pin it
  s = s.replace(/currentColor/g, color);
  const inner = s.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24">${inner}</svg>`;
}

type Cell = { label: string; value: string };
type CardDef = {
  file: string;
  year: string;
  jersey: string; // SSR'd jersey svg (with NS)
  jerseyW: number;
  cells: Cell[];
  accolades: Array<{ icon: (p: { size?: number }) => unknown; count: number }>;
};

const W = 260;

function composeCard(d: CardDef): string {
  const cx = W / 2;
  const jerseyX = cx - d.jerseyW / 2;
  const { markup: jerseyMarkup, h: jh } = embedJersey(d.jersey, jerseyX, 40, d.jerseyW);

  let cursor = 40 + jh + 6;

  // accolade row (icons + optional ×count), centered
  let accRow = "";
  if (d.accolades.length) {
    const iconSize = 16;
    const gap = 30;
    const rowW = d.accolades.length * gap;
    let ax = cx - rowW / 2 + (gap - iconSize) / 2;
    for (const a of d.accolades) {
      accRow += icon(a.icon, ax, cursor, iconSize, WOOD_DEEP);
      if (a.count > 1)
        accRow += `<text x="${ax + iconSize + 2}" y="${cursor + 12}" font-family="Archivo" font-weight="700" font-size="10" fill="${INK_SOFT}">×${a.count}</text>`;
      ax += gap;
    }
    cursor += iconSize + 8;
  } else {
    cursor += 4;
  }

  // divider
  const divY = cursor;
  // stat grid: 3 top, 2 bottom
  const top = d.cells.slice(0, 3);
  const bottom = d.cells.slice(3);
  const statCell = (c: Cell, x: number, y: number) =>
    `<text x="${x}" y="${y}" text-anchor="middle" font-family="Archivo" font-weight="700" font-size="8" letter-spacing="1" fill="${INK_SOFT}">${c.label.toUpperCase()}</text>` +
    `<text x="${x}" y="${y + 15}" text-anchor="middle" font-family="Anton" font-size="15" fill="${INK}">${c.value}</text>`;

  let grid = "";
  const colX = [cx - 74, cx, cx + 74];
  top.forEach((c, i) => (grid += statCell(c, colX[i], divY + 20)));
  const bx = bottom.length === 2 ? [cx - 40, cx + 40] : [cx];
  bottom.forEach((c, i) => (grid += statCell(c, bx[i], divY + 52)));

  const H = divY + (bottom.length ? 52 : 20) + 15 + 18; // fit to content

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14" fill="${CARD}" stroke="${LINE}" stroke-width="2"/>
  <text x="${cx}" y="28" text-anchor="middle" font-family="Anton" font-size="17" letter-spacing="0.5" fill="${INK}">${d.year}</text>
  ${jerseyMarkup}
  ${accRow}
  <line x1="20" y1="${divY}" x2="${W - 20}" y2="${divY}" stroke="${LINE}" stroke-width="1"/>
  ${grid}
</svg>`;
}

const cardDefs: CardDef[] = [
  {
    file: "ish-smith-pistons",
    year: "2016–2019",
    jersey: withNS(jobs[0].svg),
    jerseyW: 96,
    cells: [
      { label: "GP", value: "219" },
      { label: "MPG", value: "23.8" },
      { label: "PPG", value: "9.7" },
      { label: "RPG", value: "2.7" },
      { label: "APG", value: "4.4" },
    ],
    accolades: [],
  },
  {
    file: "ryan-fitzpatrick-bills",
    year: "2009–2012",
    jersey: withNS(jobs[1].svg),
    jerseyW: 118,
    cells: [
      { label: "GP", value: "55" },
      { label: "Cmp%", value: "58.8" },
      { label: "Yds", value: "11,654" },
      { label: "TD", value: "80" },
      { label: "INT", value: "64" },
    ],
    accolades: [],
  },
  {
    file: "rickey-henderson-athletics",
    year: "1979–1984",
    jersey: withNS(jobs[2].svg),
    jerseyW: 120,
    cells: [
      { label: "G", value: "791" },
      { label: "AVG", value: ".291" },
      { label: "HR", value: "51" },
      { label: "RBI", value: "271" },
      { label: "SB", value: "493" },
    ],
    accolades: [],
  },
];

const cardsDir = join(here, "../design/cards");
mkdirSync(cardsDir, { recursive: true });
for (const d of cardDefs) {
  const svg = composeCard(d);
  writeFileSync(join(cardsDir, `${d.file}.svg`), svg);
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: W * 3 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Archivo" },
  })
    .render()
    .asPng();
  writeFileSync(join(cardsDir, `${d.file}.png`), png);
  console.log("wrote card", d.file);
}
console.log("eras:", {
  nba: nbaEra.identity + "/" + nbaEra.eraStyle,
  nfl: nflEra.identity + "/" + nflEra.eraStyle,
  mlb: mlbEra.identity + "/" + mlbEra.eraStyle,
});
