/**
 * Regenerates public/og.png — the link-preview card iMessage/Twitter show.
 * Run with `npm run build:og`. Keep the SVG palette in sync with the design
 * tokens in src/index.css. Bump the ?v= on the og:image/twitter:image tags in
 * index.html whenever this changes, since iMessage caches previews by URL.
 */
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const W = 1200,
  H = 630;
const paper = "#ece5d4";
const ink = "#1d1a13";
const inkSoft = "#6b6353";
const line = "#d3c8ae";
const wood = "#b3855a";
const woodDeep = "#8c6239";

// three jersey colorways — the only saturated things on the card
const jerseys = [
  { num: "23", fill: "#c0392f", trim: "#f2e6cf" },
  { num: "88", fill: "#274b6d", trim: "#f2e6cf" },
  { num: "24", fill: "#2f6b4a", trim: "#f2e6cf" },
];

function jersey(cx, ty, fill, trim, num) {
  const d = [
    `M ${cx - 70} ${ty + 34}`,
    `C ${cx - 70} ${ty + 12} ${cx - 56} ${ty} ${cx - 40} ${ty + 8}`,
    `L ${cx - 22} ${ty + 20}`,
    `C ${cx - 10} ${ty + 30} ${cx + 10} ${ty + 30} ${cx + 22} ${ty + 20}`,
    `L ${cx + 40} ${ty + 8}`,
    `C ${cx + 56} ${ty} ${cx + 70} ${ty + 12} ${cx + 70} ${ty + 34}`,
    `L ${cx + 52} ${ty + 60}`,
    `C ${cx + 46} ${ty + 68} ${cx + 44} ${ty + 76} ${cx + 44} ${ty + 88}`,
    `L ${cx + 44} ${ty + 168}`,
    `L ${cx - 44} ${ty + 168}`,
    `L ${cx - 44} ${ty + 88}`,
    `C ${cx - 44} ${ty + 76} ${cx - 46} ${ty + 68} ${cx - 52} ${ty + 60}`,
    `Z`,
  ].join(" ");
  return `
    <g>
      <path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M ${cx - 22} ${ty + 20} C ${cx - 10} ${ty + 30} ${cx + 10} ${ty + 30} ${cx + 22} ${ty + 20}"
            fill="none" stroke="${trim}" stroke-width="6" stroke-linecap="round"/>
      <text x="${cx}" y="${ty + 128}" font-family="Anton" font-size="70"
            fill="${trim}" text-anchor="middle">${num}</text>
    </g>`;
}

const jRow = jerseys
  .map((j, i) => jersey(600 + (i - 1) * 190, 356, j.fill, j.trim, j.num))
  .join("");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${paper}"/>
  <circle cx="600" cy="-190" r="360" fill="none"
          stroke="${wood}" stroke-opacity="0.30" stroke-width="3"/>
  <rect x="34" y="34" width="${W - 68}" height="${H - 68}" rx="18"
        fill="none" stroke="${line}" stroke-width="3"/>
  <rect x="46" y="46" width="${W - 92}" height="${H - 92}" rx="12"
        fill="none" stroke="${ink}" stroke-opacity="0.14" stroke-width="1.5"/>
  <text x="600" y="148" font-family="Archivo" font-weight="700" font-size="26"
        letter-spacing="10" fill="${inkSoft}" text-anchor="middle">DAILY CAREER PUZZLE</text>
  <text x="600" y="278" font-family="Anton" font-size="150"
        letter-spacing="2" fill="${ink}" text-anchor="middle">JOURNEYMAN</text>
  <text x="600" y="330" font-family="Archivo" font-weight="500" font-size="30"
        fill="${inkSoft}" text-anchor="middle">A mystery career, revealed one jersey at a time</text>
  ${jRow}
  <text x="600" y="588" font-family="Anton" font-size="40"
        letter-spacing="1" fill="${woodDeep}" text-anchor="middle">JOURNEYMANJERSEY.COM</text>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: W },
  font: {
    fontFiles: [join(here, "assets/Anton.ttf"), join(here, "assets/Archivo.ttf")],
    loadSystemFonts: false,
    defaultFontFamily: "Archivo",
  },
});
const png = resvg.render().asPng();
const out = join(root, "public/og.png");
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
